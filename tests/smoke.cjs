const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'Shikimori.js');
let source = fs.readFileSync(sourcePath, 'utf8');

const exportForTests = [
  '  window.__shikiTest = {',
  '    NetworkManager: NetworkManager,',
  '    main: main,',
  '    Card: Card,',
  '    Component: Component$1',
  '  };',
  '  if (!window.plugin_shikimori_ready) startPlugin();'
].join('\n');

const startMarker = '  if (!window.plugin_shikimori_ready) startPlugin();';
assert.ok(source.includes(startMarker), 'plugin startup marker must exist');
source = source.replace(startMarker, exportForTests);

const ajaxCalls = [];
const jqueryInstances = [];
const scrollInstances = [];
let emptyCreated = 0;

function FakeJQuery(selector) {
  this.selector = selector;
  this.length = 1;
  this.nodes = [];
  this.handlers = {};
  jqueryInstances.push(this);
}

FakeJQuery.prototype.eq = function () {
  return this;
};
FakeJQuery.prototype.append = function (value) {
  this.nodes.push(value);
  return this;
};
FakeJQuery.prototype.on = function (event, callback) {
  this.handlers[event] = callback;
  return this;
};
FakeJQuery.prototype.off = function () {
  this.handlers = {};
  return this;
};
FakeJQuery.prototype.find = function (selector) {
  return new FakeJQuery(selector);
};
FakeJQuery.prototype.addClass = function () {
  return this;
};
FakeJQuery.prototype.remove = function () {
  this.removed = true;
  return this;
};
FakeJQuery.prototype.empty = function () {
  this.nodes = [];
  return this;
};
FakeJQuery.prototype.text = function () {
  return this;
};
FakeJQuery.prototype.prepend = function (value) {
  this.nodes.unshift(value);
  return this;
};

function $(selector) {
  return new FakeJQuery(selector);
}

$.extend = function (target) {
  for (let i = 1; i < arguments.length; i++) {
    Object.assign(target, arguments[i] || {});
  }
  return target;
};

$.ajax = function (options) {
  const xhr = {
    statusText: '',
    aborted: false,
    alwaysCallback: null,
    always(callback) {
      this.alwaysCallback = callback;
      return this;
    },
    abort() {
      this.aborted = true;
      this.statusText = 'abort';
      if (options.error) options.error(this, 'abort', 'abort');
      if (this.alwaysCallback) this.alwaysCallback();
    },
    resolve(data) {
      if (options.success) options.success(data);
      if (this.alwaysCallback) this.alwaysCallback();
    }
  };

  ajaxCalls.push({ options, xhr });
  return xhr;
};

const window = { appready: true };
const Lampa = {
  Manifest: {},
  Storage: {
    field(key) {
      return key === 'language' ? 'ru' : false;
    }
  },
  Template: {
    add() {},
    get(name, data) {
      Lampa.lastTemplate = { name, data };
      return new FakeJQuery(name);
    }
  },
  Component: {
    add() {}
  },
  Listener: {
    follow() {},
    remove() {}
  },
  Activity: {
    push() {},
    active() {
      return null;
    }
  },
  Noty: { show() {} },
  Select: { show() {} },
  Lang: { translate: () => 'none' },
  Controller: {
    toggle() {},
    own: () => true,
    add() {},
    collectionSet() {},
    collectionFocus() {}
  },
  Utils: { protocol: () => 'https://' },
  Arrays: { destroy() {} },
  Empty: function () {
    emptyCreated++;
    this.render = () => new FakeJQuery('empty');
    this.start = function () {};
  },
  Scroll: function () {
    this.append = () => {};
    this.render = () => new FakeJQuery('scroll');
    this.minus = () => {};
    this.update = () => {};
    this.destroy = () => {
      this.destroyed = true;
    };
    scrollInstances.push(this);
  }
};

const mockConsole = {
  warn() {},
  error() {},
  log() {}
};

vm.runInNewContext(source, {
  window,
  Lampa,
  $,
  Navigator: {
    move() {},
    canmove: () => true
  },
  console: mockConsole
}, { filename: 'Shikimori.js' });

const api = window.__shikiTest;
assert.ok(api, 'test exports should be initialized');

function testRequestCancellation() {
  const manager = new api.NetworkManager(12345);
  let errorCalled = false;

  manager.get('https://example.test/cancel', () => {}, () => {
    errorCalled = true;
  });

  const request = ajaxCalls[0];
  manager.clear();

  assert.equal(request.xhr.aborted, true);
  assert.equal(errorCalled, false, 'intentional abort must not start a fallback chain');
}

function testGraphQLJsonAndVariables() {
  const manager = new api.NetworkManager(7777);
  let completed = null;
  let failed = null;

  api.main({
    page: 2,
    sort: 'ranked',
    kind: 'tv',
    status: 'ongoing',
    genre: 5,
    seasons: 'winter_2026'
  }, data => {
    completed = data;
  }, error => {
    failed = error;
  }, manager);

  const request = ajaxCalls[1];
  const payload = JSON.parse(request.options.data);

  assert.equal(request.options.method, 'POST');
  assert.match(request.options.contentType, /application\/json/i);
  assert.equal(request.options.timeout, 7777);
  assert.equal(payload.variables.page, 2);
  assert.equal(payload.variables.order, 'ranked');
  assert.equal(payload.variables.kind, 'tv');
  assert.equal(payload.variables.status, 'ongoing');
  assert.equal(payload.variables.genre, '5');
  assert.equal(payload.variables.season, 'winter_2026');
  assert.match(payload.query, /malId/);

  request.xhr.resolve({ data: { animes: [{ id: 1, malId: 1234 }] } });
  assert.equal(completed.length, 1);
  assert.equal(failed, null);

  let graphQLError = null;
  api.main({}, () => {}, error => {
    graphQLError = error;
  }, manager);

  ajaxCalls[2].xhr.resolve({ errors: [{ message: 'Invalid sort' }] });
  assert.equal(graphQLError.message, 'Invalid sort');
}

function testCardEscapingAndNullSafety() {
  new api.Card({
    poster: null,
    kind: null,
    status: null,
    score: null,
    season: null,
    airedOn: null,
    russian: '<img src=x onerror=alert(1)>'
  }, 'ru');

  assert.equal(
    Lampa.lastTemplate.data.title,
    '&lt;img src=x onerror=alert(1)&gt;'
  );
  assert.equal(Lampa.lastTemplate.data.img, '');
  assert.equal(Lampa.lastTemplate.data.type, 'ANIME');
}

function testPaginationDeduplicationAndDestroy() {
  ajaxCalls.length = 0;
  const component = new api.Component({ page: 1 });
  const activity = {
    loader() {},
    toggleCount: 0,
    toggle() {
      this.toggleCount++;
    }
  };

  component.activity = activity;
  component.create();

  const body = jqueryInstances.find(item =>
    String(item.selector).indexOf('LMEShikimori-catalog--list') !== -1
  );
  assert.ok(body, 'catalogue container should be created');

  const graphqlRequests = () => ajaxCalls.filter(item =>
    item.options.url === 'https://shikimori.one/api/graphql'
  );

  const firstPage = graphqlRequests()[0];
  const firstBatch = Array.from({ length: 36 }, (_, index) => ({
    id: index + 1,
    name: 'Anime ' + (index + 1),
    malId: 1000 + index
  }));

  firstPage.xhr.resolve({ data: { animes: firstBatch } });
  assert.equal(body.nodes.length, 36);

  scrollInstances[0].onEnd();
  scrollInstances[0].onEnd();
  assert.equal(graphqlRequests().length, 2, 'scroll lock should allow one next-page request');

  const secondPage = graphqlRequests()[1];
  const secondBatch = [{ id: 36, name: 'duplicate' }].concat(
    Array.from({ length: 35 }, (_, index) => ({
      id: 37 + index,
      name: 'Anime ' + (37 + index),
      malId: 2000 + index
    }))
  );

  secondPage.xhr.resolve({ data: { animes: secondBatch } });
  assert.equal(body.nodes.length, 71, 'duplicate id must be skipped across pages');

  scrollInstances[0].onEnd();
  const thirdPage = graphqlRequests()[2];
  component.destroy();

  assert.equal(thirdPage.xhr.aborted, true, 'destroy must abort an in-flight page request');
}

function testEmptyRestoredPage() {
  ajaxCalls.length = 0;
  const component = new api.Component({ page: 2 });
  component.activity = { loader() {}, toggle() {} };
  component.create();

  const request = ajaxCalls.find(item =>
    item.options.url === 'https://shikimori.one/api/graphql'
  );
  request.xhr.resolve({ data: { animes: [] } });

  assert.equal(emptyCreated, 1, 'empty state must render when a restored page is empty');
  component.destroy();
}

testRequestCancellation();
testGraphQLJsonAndVariables();
testCardEscapingAndNullSafety();
testPaginationDeduplicationAndDestroy();
testEmptyRestoredPage();

process.stdout.write('Shikimori smoke tests: PASS (5 groups)\n');
