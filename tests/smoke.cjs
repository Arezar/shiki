const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'Shikimori.js');
let source = fs.readFileSync(sourcePath, 'utf8');

const startMarker = '  if (!window.plugin_shikimori_ready) startPlugin();';
assert.ok(source.includes(startMarker), 'plugin startup marker must exist');

const exportForTests = [
  '  window.__shikiTest = {',
  '    NetworkManager: NetworkManager,',
  '    main: main,',
  '    Card: Card,',
  '    Component: Component$1,',
  '    parseOAuthRedirect: parseOAuthRedirect,',
  '    refreshAccessToken: refreshAccessToken,',
  '    normalizeUserRateEntry: normalizeUserRateEntry,',
  '    userRateStatusTitle: userRateStatusTitle,',
  '    accountIsConnected: accountIsConnected',
  '  };',
  startMarker
].join('\n');

source = source.replace(startMarker, exportForTests);

const ajaxCalls = [];
const storage = {};
let lastTemplate = null;

function FakeJQuery(selector) {
  this.selector = selector;
  this.length = 1;
  this.nodes = [];
  this.handlers = {};
}
FakeJQuery.prototype.eq = function () { return this; };
FakeJQuery.prototype.append = function (value) { this.nodes.push(value); return this; };
FakeJQuery.prototype.on = function (event, callback) { this.handlers[event] = callback; return this; };
FakeJQuery.prototype.off = function () { this.handlers = {}; return this; };
FakeJQuery.prototype.find = function (selector) { return new FakeJQuery(selector); };
FakeJQuery.prototype.addClass = function () { return this; };
FakeJQuery.prototype.removeClass = function () { return this; };
FakeJQuery.prototype.remove = function () { this.removed = true; return this; };
FakeJQuery.prototype.empty = function () { this.nodes = []; return this; };
FakeJQuery.prototype.text = function () { return this; };
FakeJQuery.prototype.prepend = function (value) { this.nodes.unshift(value); return this; };

function $(selector) {
  return new FakeJQuery(selector);
}
$.extend = function (target) {
  for (let i = 1; i < arguments.length; i++) Object.assign(target, arguments[i] || {});
  return target;
};
$.ajax = function (options) {
  const xhr = {
    statusText: '',
    aborted: false,
    alwaysCallback: null,
    always(callback) { this.alwaysCallback = callback; return this; },
    abort() {
      this.aborted = true;
      this.statusText = 'abort';
      if (options.error) options.error(this, 'abort', 'abort');
      if (this.alwaysCallback) this.alwaysCallback();
    },
    resolve(data) {
      if (options.success) options.success(data);
      if (this.alwaysCallback) this.alwaysCallback();
    },
    reject(status, response) {
      this.status = status;
      this.responseJSON = response;
      if (options.error) options.error(this, 'error', 'request failed');
      if (this.alwaysCallback) this.alwaysCallback();
    }
  };
  ajaxCalls.push({ options, xhr });
  return xhr;
};

const window = { appready: true, crypto: null };
const Lampa = {
  Manifest: { app_digital: 200 },
  Storage: {
    field(key) { return key === 'language' ? 'ru' : false; },
    get(key, fallback) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback; },
    set(key, value) { storage[key] = value; }
  },
  Template: {
    add() {},
    get(name, data) {
      lastTemplate = { name, data };
      return new FakeJQuery(name);
    }
  },
  Component: { add() {} },
  Listener: { follow() {}, remove() {} },
  Activity: { push() {}, active() { return null; } },
  Noty: { show() {} },
  Select: { show() {} },
  Lang: { translate: () => 'none' },
  Controller: {
    toggle() {}, own: () => true, add() {}, collectionSet() {}, collectionFocus() {}
  },
  Utils: { protocol: () => 'https://' },
  Arrays: { destroy() {} },
  Empty: function () {
    this.render = () => new FakeJQuery('empty');
    this.start = function () {};
  },
  Scroll: function () {
    this.append = () => {};
    this.render = () => new FakeJQuery('scroll');
    this.minus = () => {};
    this.update = () => {};
    this.destroy = function () {};
  }
};

vm.runInNewContext(source, {
  window,
  Lampa,
  $,
  Navigator: { move() {}, canmove: () => true },
  console: { warn() {}, error() {}, log() {} },
  Date,
  Uint8Array,
  isFinite,
  encodeURIComponent,
  decodeURIComponent
}, { filename: 'Shikimori.js' });

const api = window.__shikiTest;
assert.ok(api, 'test exports should be initialized');

function testRequestCancellation() {
  const manager = new api.NetworkManager(12345);
  let errorCalled = false;
  manager.get('https://example.test/cancel', () => {}, () => { errorCalled = true; });
  const request = ajaxCalls[0];
  manager.clear();
  assert.equal(request.xhr.aborted, true);
  assert.equal(errorCalled, false, 'intentional abort must not trigger an error fallback');
}

function testGraphQLVariablesAndFilterCoverage() {
  const manager = new api.NetworkManager(7777);
  let completed = null;
  let failed = null;
  api.main({
    page: 2,
    sort: 'ranked',
    kind: 'tv',
    status: 'ongoing',
    genre: '1,2',
    seasons: 'winter_2026',
    search: 'Fullmetal',
    score: '8',
    rating: 'pg_13',
    duration: 'D'
  }, data => { completed = data; }, error => { failed = error; }, manager);

  const request = ajaxCalls.find(item => item.options.url === 'https://shikimori.one/api/graphql');
  const payload = JSON.parse(request.options.data);
  assert.equal(request.options.method, 'POST');
  assert.match(request.options.contentType, /application\/json/i);
  assert.equal(request.options.timeout, 7777);
  assert.equal(payload.variables.page, 2);
  assert.equal(payload.variables.order, 'ranked');
  assert.equal(payload.variables.kind, 'tv');
  assert.equal(payload.variables.status, 'ongoing');
  assert.equal(payload.variables.genre, '1,2');
  assert.equal(payload.variables.season, 'winter_2026');
  assert.equal(payload.variables.search, 'Fullmetal');
  assert.equal(payload.variables.score, 8);
  assert.equal(payload.variables.rating, 'pg_13');
  assert.equal(payload.variables.duration, 'D');
  assert.match(payload.query, /duration: \$duration/);
  assert.match(payload.query, /episodesAired/);
  assert.match(payload.query, /duration/);

  request.xhr.resolve({ data: { animes: [{ id: 1 }] } });
  assert.equal(completed.length, 1);
  assert.equal(failed, null);

  let graphQLError = null;
  api.main({}, () => {}, error => { graphQLError = error; }, manager);
  const errorRequest = ajaxCalls.filter(item => item.options.url === 'https://shikimori.one/api/graphql').pop();
  errorRequest.xhr.resolve({ errors: [{ message: 'Invalid sort' }] });
  assert.equal(graphQLError.message, 'Invalid sort');
}

function testOAuthRedirectParsing() {
  const parsed = api.parseOAuthRedirect('https://example.test/callback?code=one-time-code&state=state-value');
  assert.equal(parsed.code, 'one-time-code');
  assert.equal(parsed.state, 'state-value');

  const raw = api.parseOAuthRedirect('one-time-code');
  assert.equal(raw.code, 'one-time-code');
  assert.equal(raw.state, '');
  const malformed = api.parseOAuthRedirect('https://example.test/?code=%E0%A4%A&state=x');
  assert.equal(malformed.code, '');
  assert.equal(malformed.state, '');
}

function testConcurrentTokenRefresh() {
  storage.lme_shikimori_account_v1 = {
    client_id: 'client-id',
    client_secret: 'client-secret',
    refresh_token: 'old-refresh'
  };

  const before = ajaxCalls.length;
  const received = [];
  const errors = [];
  api.refreshAccessToken(token => received.push(token), error => errors.push(error));
  api.refreshAccessToken(token => received.push(token), error => errors.push(error));

  const requests = ajaxCalls.slice(before).filter(item => item.options.url === 'https://shikimori.io/oauth/token');
  assert.equal(requests.length, 1, 'parallel callers must share a single refresh request');
  requests[0].xhr.resolve({
    access_token: 'new-access',
    refresh_token: 'new-refresh',
    expires_in: 86400
  });

  assert.deepEqual(received, ['new-access', 'new-access']);
  assert.equal(errors.length, 0);
  assert.equal(storage.lme_shikimori_account_v1.refresh_token, 'new-refresh');
  assert.equal(storage.lme_shikimori_account_v1.access_token, 'new-access');
}

function testConcurrentTokenRefresh() {
  storage.lme_shikimori_account_v1 = {
    client_id: 'client-id',
    client_secret: 'client-secret',
    refresh_token: 'old-refresh'
  };

  const before = ajaxCalls.length;
  const received = [];
  const errors = [];
  api.refreshAccessToken(token => received.push(token), error => errors.push(error));
  api.refreshAccessToken(token => received.push(token), error => errors.push(error));

  const requests = ajaxCalls.slice(before).filter(item => item.options.url === 'https://shikimori.io/oauth/token');
  assert.equal(requests.length, 1, 'parallel callers must share a single refresh request');
  requests[0].xhr.resolve({
    access_token: 'new-access',
    refresh_token: 'new-refresh',
    expires_in: 86400
  });

  assert.deepEqual(received, ['new-access', 'new-access']);
  assert.equal(errors.length, 0);
  assert.equal(storage.lme_shikimori_account_v1.refresh_token, 'new-refresh');
  assert.equal(storage.lme_shikimori_account_v1.access_token, 'new-access');
}

function testUserRateNormalization() {
  const anime = api.normalizeUserRateEntry({
    user_rate: { id: 99, status: 'watching', score: 9, episodes: 12, user_id: 7 },
    anime: { id: 42, name: 'Test anime', score: '8.5' }
  });
  assert.equal(anime.id, 42);
  assert.equal(anime.__user_rate.id, 99);
  assert.equal(anime.__user_rate.status, 'watching');
  assert.equal(anime.__user_rate.score, 9);
  assert.equal(anime.__user_rate.episodes, 12);
  assert.equal(api.userRateStatusTitle('completed'), 'Просмотрено');
}

function testLegacyCardFallbackSafety() {
  new api.Card({
    id: 5,
    poster: null,
    kind: null,
    score: null,
    season: null,
    airedOn: null,
    russian: '<img src=x onerror=alert(1)>'
  }, 'ru');

  assert.equal(lastTemplate.name, 'LMEShikimori-Card');
  assert.equal(lastTemplate.data.title, '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(lastTemplate.data.img, '');
  assert.equal(lastTemplate.data.type, 'ANIME');
  assert.equal(storage.lme_shikimori_watchlist, undefined, 'plugin must not create a duplicate local watchlist');
  assert.doesNotMatch(source, /getWatchlist|toggleWatchlist|WATCHLIST_KEY/);
  assert.match(source, /Lampa\.Maker\.make\('Card'/, 'Lampa 3.x should use native cards');
  assert.match(source, /item\.menu_list\.push/, 'Shikimori actions should use the native card context menu');
  assert.match(source, /onCheck: function \(chosen\)/, 'genre filters should use checkbox callbacks');
}

testRequestCancellation();
testGraphQLVariablesAndFilterCoverage();
testOAuthRedirectParsing();
testConcurrentTokenRefresh();
testUserRateNormalization();
testLegacyCardFallbackSafety();

process.stdout.write('Shikimori smoke tests: PASS (5 groups)\n');
