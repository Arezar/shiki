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
  '    getSeason: getSeason,',
  '    isHighConfidenceTmdbMatch: isHighConfidenceTmdbMatch,',
  '  };',
  startMarker
].join('\n');

source = source.replace(startMarker, exportForTests);

const ajaxCalls = [];
const jqueryInstances = [];
const storage = {
  lme_shikimori_account_v1: { access_token: 'legacy-token', refresh_token: 'legacy-refresh', client_secret: 'legacy-secret' },
  lme_shikimori_oauth_state: 'legacy-state'
};
let lastTemplate = null;
let emptyCreated = 0;
const scrollInstances = [];
const selectCalls = [];
const layerVisibleCalls = [];
const controllerCollections = {};
let lastCollectionFocus = null;
let activityBackwardCalls = 0;
const activityPushCalls = [];
let lastInputEdit = null;
const notyCalls = [];

function FakeJQuery(selector) {
  this.selector = selector;
  this.length = 1;
  this.nodes = [];
  this.handlers = {};
  jqueryInstances.push(this);
}
FakeJQuery.prototype.eq = function () { return this; };
FakeJQuery.prototype.append = function (value) {
  if (value instanceof FakeJQuery) value.parent = this;
  this.nodes.push(value);
  return this;
};
FakeJQuery.prototype.on = function (event, callback) { this.handlers[event] = callback; return this; };
FakeJQuery.prototype.off = function () { this.handlers = {}; return this; };
FakeJQuery.prototype.find = function (selector) { return new FakeJQuery(selector); };
FakeJQuery.prototype.addClass = function () { return this; };
FakeJQuery.prototype.removeClass = function () { return this; };
FakeJQuery.prototype.remove = function () {
  this.removed = true;
  if (this.parent && this.parent.nodes) {
    const index = this.parent.nodes.indexOf(this);
    if (index !== -1) this.parent.nodes.splice(index, 1);
  }
  return this;
};
FakeJQuery.prototype.empty = function () { this.nodes = []; return this; };
FakeJQuery.prototype.text = function (value) { if (arguments.length) this.textContent = String(value); return this; };
FakeJQuery.prototype.prepend = function (value) {
  if (value instanceof FakeJQuery) value.parent = this;
  this.nodes.unshift(value);
  return this;
};

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
  Activity: { push(params) { activityPushCalls.push(params); }, active() { return null; }, backward() { activityBackwardCalls++; } },
  Input: { edit(options, callback) { lastInputEdit = { options, callback }; } },
  Noty: { show(message) { notyCalls.push(message); } },
  Select: { show(options) { selectCalls.push(options); } },
  Lang: { translate: () => 'none' },
  Layer: { visible(element) { layerVisibleCalls.push(element); } },
  Controller: {
    toggle(name) {
      if (name === 'content' && controllerCollections.content) controllerCollections.content.toggle();
    },
    own: () => true,
    add(name, options) { controllerCollections[name] = options; },
    collectionSet() {},
    collectionFocus(focus) { lastCollectionFocus = focus; }
  },
  Utils: { protocol: () => 'https://' },
  Arrays: { destroy() {} },
  Empty: function () {
    emptyCreated++;
    this.render = () => new FakeJQuery('empty');
    this.start = function () {};
  },
  Scroll: function () {
    scrollInstances.push(this);
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

function testSeasonBoundariesAndTmdbMatchConfidence() {
  assert.equal(api.getSeason(new Date(2026, 0, 15)), 'winter_2026', 'January belongs to winter of the same year');
  assert.equal(api.getSeason(new Date(2026, 2, 15)), 'winter_2026', 'March must remain in winter');
  assert.equal(api.getSeason(new Date(2026, 3, 15)), 'spring_2026', 'April starts spring');
  assert.equal(api.getSeason(new Date(2026, 5, 15)), 'spring_2026', 'June remains in spring');
  assert.equal(api.getSeason(new Date(2026, 6, 15)), 'summer_2026', 'July starts summer');
  assert.equal(api.getSeason(new Date(2026, 8, 15)), 'summer_2026', 'September remains in summer');
  assert.equal(api.getSeason(new Date(2026, 9, 15)), 'fall_2026', 'October starts fall');
  assert.equal(api.getSeason(new Date(2026, 11, 15)), 'fall_2026', 'December remains in fall');

  const anime = { kind: 'tv', airedOn: { year: 2001 } };
  const exact = { id: 1, media_type: 'tv', name: 'Cowboy Bebop', first_air_date: '2001-01-01' };
  assert.equal(api.isHighConfidenceTmdbMatch(anime, exact, ['Cowboy Bebop']), true, 'exact title, media type and year should be safe for automatic opening');
  assert.equal(api.isHighConfidenceTmdbMatch(anime, { ...exact, name: 'Cowboy Bebop: The Movie' }, ['Cowboy Bebop']), false, 'partial title matches must require user confirmation');
  assert.equal(api.isHighConfidenceTmdbMatch(anime, { ...exact, media_type: 'movie' }, ['Cowboy Bebop']), false, 'wrong media type must require user confirmation');
  assert.equal(api.isHighConfidenceTmdbMatch(anime, { ...exact, first_air_date: '2005-01-01' }, ['Cowboy Bebop']), false, 'distant release years must require user confirmation');
  assert.equal(api.isHighConfidenceTmdbMatch({ kind: 'movie', airedOn: { year: 2001 } }, { ...exact, media_type: 'movie' }, ['Cowboy Bebop']), true, 'exact movie matches with matching type should be accepted');
}

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

function testNativeCardBadgesAndIdIsolation() {
  const appended = [];
  const view = { append(node) { appended.push(node); } };
  const root = { querySelector(selector) { return selector === '.card__view' ? view : null; } };
  let nativeData = null;
  let enabledModules = [];
  Lampa.Manifest.app_digital = 300;
  Lampa.Template.elem = (tag, attrs) => ({ tag, attrs });
  Lampa.Maker = {
    make(name, data, configure) {
      nativeData = data;
      const module = { only() { enabledModules = Array.from(arguments); return this; } };
      configure(module);
      return {
        menu_list: [],
        use(hooks) { this.hooks = hooks; },
        create() { this.hooks.onCreate.call({ html: root }); },
        render() { return new FakeJQuery('native-card'); },
        destroy() {}
      };
    }
  };

  const card = new api.Card({
    id: 42,
    name: 'Native anime',
    kind: 'tv',
    poster: { originalUrl: 'https://example.test/poster.jpg' },
    score: '8.2',
    airedOn: { year: 2024, date: '2024-01-01' },
  }, 'en', {});

  assert.equal(nativeData.id, 'shiki-42');
  assert.ok(!enabledModules.includes('Favorite'));
  assert.ok(!enabledModules.includes('Watched'));
  assert.ok(!enabledModules.includes('Plugins'));
  assert.equal(appended.length, 1, 'native DOM card must receive the Shikimori kind badge only');
  assert.equal(appended[0].attrs.class, 'card__type LMEShikimori__kind');
  card.destroy();
  Lampa.Manifest.app_digital = 200;
  delete Lampa.Maker;
  delete Lampa.Template.elem;
}

function testRestoredFiltersAreStableAcrossPages() {
  storage.lme_shikimori_filters_v1 = {
    sort: 'ranked',
    kind: 'tv',
    status: 'ongoing',
    genre: '1,2',
    seasons: 'winter_2026',
    score: '8',
    rating: 'pg_13',
    duration: 'D',
    search: 'Saved search'
  };
  const component = new api.Component({ page: 1 });
  component.activity = { loader() {}, toggle() {} };
  component.create();

  const first = ajaxCalls.filter(item => item.options.url === 'https://shikimori.one/api/graphql').pop();
  const firstVariables = JSON.parse(first.options.data).variables;
  assert.equal(firstVariables.page, 1);
  assert.equal(firstVariables.order, 'ranked');
  assert.equal(firstVariables.kind, 'tv');
  assert.equal(firstVariables.status, 'ongoing');
  assert.equal(firstVariables.genre, '1,2');
  assert.equal(firstVariables.season, 'winter_2026');
  assert.equal(firstVariables.score, 8);
  assert.equal(firstVariables.rating, 'pg_13');
  assert.equal(firstVariables.duration, 'D');
  assert.equal(firstVariables.search, 'Saved search');

  first.xhr.resolve({ data: { animes: Array.from({ length: 36 }, (_, index) => ({ id: index + 100, name: 'Anime ' + index })) } });
  const scroll = scrollInstances[scrollInstances.length - 1];
  scroll.onEnd();
  const requests = ajaxCalls.filter(item => item.options.url === 'https://shikimori.one/api/graphql');
  const secondVariables = JSON.parse(requests[requests.length - 1].options.data).variables;
  assert.equal(secondVariables.page, 2);
  Object.keys(firstVariables).filter(key => key !== 'page').forEach(key => {
    assert.equal(secondVariables[key], firstVariables[key], 'filter changed between pages for ' + key);
  });
  component.destroy();
  assert.deepEqual(storage.lme_shikimori_filters_v1, { sort: 'ranked' }, 'leaving the catalogue should clear all filters and title search while retaining standalone sort');
  storage.lme_shikimori_filters_v1 = {};
}

function testResetFiltersClearsCheckboxState() {
  storage.lme_shikimori_filters_v1 = { kind: 'tv', status: 'ongoing', sort: 'ranked', genre: '1,2', search: 'Saved title' };
  const component = new api.Component({ page: 1 });
  component.activity = { loader() {}, toggle() {} };
  component.create();
  const genresRequest = ajaxCalls.filter(item => item.options.url === 'https://shikimori.one/api/genres').pop();
  genresRequest.xhr.resolve([
    { id: 1, entry_type: 'Anime', russian: 'Фэнтези' },
    { id: 2, entry_type: 'Anime', russian: 'Комедия' },
    { id: 3, entry_type: 'Anime', russian: 'Аниме жанр' },
    { id: 4, entry_type: 'Anime', russian: 'Экшен' },
    { id: 5, entry_type: 'Anime', russian: 'Драма' }
  ]);

  const filtersButton = jqueryInstances.filter(item => item.selector === '.LMEShikimori__filters').pop();
  assert.ok(filtersButton && filtersButton.handlers['hover:enter']);
  filtersButton.handlers['hover:enter']();
  const filterMenu = selectCalls[selectCalls.length - 1];
  assert.ok(filterMenu.items.length <= 7, 'top-level filter menu should stay compact for remote navigation');
  filterMenu.onSelect(filterMenu.items.find(item => item.resetFilters));
  assert.equal(storage.lme_shikimori_filters_v1.search, 'Saved title', 'resetting filters must preserve the separate title search');
  const resetMenu = selectCalls[selectCalls.length - 1];
  resetMenu.onSelect(resetMenu.items.find(item => item.group === 'basic'));
  const basicMenu = selectCalls[selectCalls.length - 1];
  const statusFilter = basicMenu.items.find(item => item.title === 'Статус выхода');
  assert.ok(statusFilter.items.every(item => item.selected === false && item.checked === false));
  const typeFilter = basicMenu.items.find(item => item.title === 'Тип аниме');
  assert.ok(typeFilter.items.every(item => item.selected === false && item.checked === false));
  const genreFilter = basicMenu.items.find(item => item.title === 'Жанры');
  assert.ok(genreFilter.items.every(item => item.selected === false && item.checked === false));
  assert.ok(!basicMenu.items.some(item => item.genreSearch), 'genre selection should not require a text search');
  basicMenu.onSelect(genreFilter);
  const genreChoices = selectCalls[selectCalls.length - 1];
  assert.equal(genreChoices.title, 'Жанры');
  assert.equal(genreChoices.items.length, 5, 'opening genres should show the ready-made full list');
  assert.deepEqual(genreChoices.items.map(item => item.title), ['Комедия', 'Драма', 'Фэнтези', 'Экшен', 'Аниме жанр'], 'popular genres should come first, followed by the remaining genres in Russian alphabetical order');
  genreChoices.items[1].checked = true;
  genreChoices.onCheck(genreChoices.items[1]);
  assert.equal(genreFilter.items.find(item => item.id === 5).selected, true, 'filtered genre selection should update the full genre state');
  component.destroy();
  storage.lme_shikimori_filters_v1 = {};
}

function testGenreFilterHandlesSlowInitialLoad() {
  ajaxCalls.length = 0;
  notyCalls.length = 0;
  const component = new api.Component({ page: 1 });
  component.activity = { loader() {}, toggle() {} };
  component.create();

  const filtersButton = jqueryInstances.filter(item => item.selector === '.LMEShikimori__filters').pop();
  filtersButton.handlers['hover:enter']();
  const rootMenu = selectCalls[selectCalls.length - 1];
  rootMenu.onSelect(rootMenu.items.find(item => item.group === 'basic'));
  const basicMenu = selectCalls[selectCalls.length - 1];
  basicMenu.onSelect(basicMenu.items.find(item => item.title === 'Жанры'));

  assert.match(notyCalls[notyCalls.length - 1], /ещё загружается/, 'opening genres before the API response should not report a false empty result');

  const genresRequest = ajaxCalls.filter(item => item.options.url === 'https://shikimori.one/api/genres').pop();
  genresRequest.xhr.resolve([
    { id: 1, entry_type: 'Anime', russian: 'Жанр один' },
    { id: 2, entry_type: 'Anime', russian: 'Жанр два' }
  ]);

  const returnedGroup = selectCalls[selectCalls.length - 1];
  returnedGroup.onSelect(returnedGroup.items.find(item => item.title === 'Жанры'));
  const loadedGenres = selectCalls[selectCalls.length - 1];
  assert.equal(loadedGenres.items.length, 2, 'genre choices should become available after the request completes');
  component.destroy();
}

function testTvFriendlyFilterGroupsAndBackNavigation() {
  ajaxCalls.length = 0;
  storage.lme_shikimori_filters_v1 = { kind: 'tv', sort: 'ranked' };
  const component = new api.Component({ page: 1 });
  component.activity = { loader() {}, toggle() {} };
  component.create();

  component.start();
  const contentController = controllerCollections.content;
  assert.ok(contentController && typeof contentController.back === 'function', 'catalogue controller must expose a Back handler');
  const backCallsBefore = activityBackwardCalls;
  contentController.back();
  assert.equal(activityBackwardCalls, backCallsBefore + 1, 'Back must return through Lampa activity history');
  const filtersButton = jqueryInstances.filter(item => item.selector === '.LMEShikimori__filters').pop();
  const titleSearchButton = jqueryInstances.filter(item => item.selector === '.LMEShikimori__title-search').pop();
  const homeButton = jqueryInstances.filter(item => item.selector === '.LMEShikimori__home').pop();
  assert.ok(filtersButton && filtersButton.handlers['hover:enter'], 'filter entry must be reachable by remote activation');
  assert.ok(titleSearchButton && titleSearchButton.handlers['hover:enter'], 'title search must have its own remote button');
  assert.ok(homeButton && homeButton.handlers['hover:enter'], 'home button must be reachable by remote activation');
  assert.match(source, /Главная/);
  assert.match(source, /Поиск по названию/);
  assert.match(source, />Фильтры</);
  const filterMenusBeforeSearch = selectCalls.length;
  titleSearchButton.handlers['hover:enter']();
  assert.ok(lastInputEdit, 'title search button should open the text input directly');
  assert.equal(lastInputEdit.options.title, 'Поиск аниме на Shikimori');
  const pushCountBeforeSearch = activityPushCalls.length;
  lastInputEdit.callback('Cowboy Bebop');
  assert.equal(activityPushCalls.length, pushCountBeforeSearch + 1, 'title search should apply without opening the filters menu');
  assert.equal(activityPushCalls[activityPushCalls.length - 1].search, 'Cowboy Bebop');
  assert.equal(activityPushCalls[activityPushCalls.length - 1].kind, 'tv', 'title search should preserve the active anime-type filter');
  assert.equal(selectCalls.length, filterMenusBeforeSearch, 'title search should not open the filter menu');
  filtersButton.handlers['hover:enter']();

  const rootMenu = selectCalls[selectCalls.length - 1];
  assert.equal(rootMenu.title, 'Фильтры Shikimori');
  assert.ok(rootMenu.items.length <= 7, 'filter menu should contain only filter actions and groups');
  assert.equal(rootMenu.items[0].title, 'Показать результаты');
  assert.equal(rootMenu.items[0].subtitle, 'Активных условий: 1');
  assert.match(rootMenu.items.find(item => item.group === 'basic').subtitle, /TV Series/, 'group summary should show the standard anime-type label');
  assert.match(source, /title: 'OVA', code: 'ova'/, 'OVA should keep its standard label without an explanation');
  assert.match(source, /title: 'ONA', code: 'ona'/, 'ONA should keep its standard label without an explanation');
  assert.ok(!rootMenu.items.some(item => item.searchAnimes), 'title search must stay outside the filters menu');
  assert.ok(rootMenu.items.every(item => !/^(Home|Filters|Search|Apply|Reset)$/i.test(item.title)), 'filter actions should use Russian labels');
  assert.equal(rootMenu.items.find(item => item.group === 'basic').title, 'Основное');
  assert.equal(rootMenu.items.find(item => item.group === 'quality').title, 'Рейтинг и формат');
  const yearGroup = rootMenu.items.find(item => item.group === 'year');
  const seasonGroup = rootMenu.items.find(item => item.group === 'season');
  const sortGroup = rootMenu.items.find(item => item.group === 'sort');
  assert.equal(yearGroup.title, 'Год выпуска');
  assert.equal(seasonGroup.title, 'Сезон выхода');
  assert.equal(sortGroup.title, 'Сортировка');
  assert.equal(yearGroup.subtitle, 'Не выбрано');
  assert.equal(seasonGroup.subtitle, 'Не выбрано');
  assert.equal(sortGroup.subtitle, 'Не выбрано', 'default sorting should not look like an active filter');

  rootMenu.onSelect(sortGroup);
  const sortMenu = selectCalls[selectCalls.length - 1];
  assert.equal(sortMenu.title, 'Сортировка');
  assert.equal(sortMenu.items.length, 10, 'all sorting choices should be isolated from year and season');
  sortMenu.onBack();

  const rootAfterSort = selectCalls[selectCalls.length - 1];
  rootAfterSort.onSelect(seasonGroup);
  const seasonMenu = selectCalls[selectCalls.length - 1];
  assert.equal(seasonMenu.title, 'Сезон выхода');
  assert.equal(seasonMenu.items[0].title, 'Любой сезон');
  assert.match(seasonMenu.items[1].title, /^(Зима|Весна|Лето|Осень) \\d{4}$/);
  seasonMenu.onBack();

  const rootBeforeYear = selectCalls[selectCalls.length - 1];
  rootBeforeYear.onSelect(yearGroup);
  const yearMenu = selectCalls[selectCalls.length - 1];
  assert.equal(yearMenu.title, 'Год выпуска');
  assert.equal(yearMenu.items[0].title, 'Любой год');
  const decadeChoice = yearMenu.items.find(item => item.code);
  assert.ok(decadeChoice, 'year list should expose decade choices separately from seasons');
  yearMenu.onSelect(decadeChoice);
  const returnedRoot = selectCalls[selectCalls.length - 1];
  assert.equal(returnedRoot.title, 'Фильтры Shikimori');
  assert.equal(returnedRoot.items.find(item => item.group === 'year').subtitle, decadeChoice.title);
  returnedRoot.onSelect(returnedRoot.items.find(item => item.group === 'season'));
  const clearedSeasonMenu = selectCalls[selectCalls.length - 1];
  assert.ok(
    clearedSeasonMenu.items.every(item => item.code === '' || !item.selected),
    'choosing a year should clear every specific season selection'
  );
  clearedSeasonMenu.onBack();
  const updatedRoot = selectCalls[selectCalls.length - 1];
  assert.equal(updatedRoot.items[0].subtitle, 'Активных условий: 2');
  assert.match(updatedRoot.items.find(item => item.group === 'year').subtitle, new RegExp(decadeChoice.title));
  const qualityGroup = updatedRoot.items.find(item => item.group === 'quality');
  assert.ok(qualityGroup, 'quality group should be available');
  updatedRoot.onSelect(qualityGroup);

  const groupMenu = selectCalls[selectCalls.length - 1];
  assert.equal(groupMenu.title, 'Рейтинг и формат');
  assert.equal(groupMenu.items.length, 3, 'group should expose only its related filters');
  const scoreFilter = groupMenu.items.find(item => item.title === 'Минимальная оценка Shikimori');
  assert.ok(scoreFilter, 'group should expose the score filter');
  groupMenu.onSelect(scoreFilter);

  const scoreMenu = selectCalls[selectCalls.length - 1];
  scoreMenu.onBack();
  const returnedGroup = selectCalls[selectCalls.length - 1];
  assert.equal(returnedGroup.title, 'Рейтинг и формат', 'Back from a filter should return to its group');
  returnedGroup.onBack();

  const rootAfterGroup = selectCalls[selectCalls.length - 1];
  assert.equal(rootAfterGroup.title, 'Фильтры Shikimori', 'Back from a group should return to the filter root');
  rootAfterGroup.onBack();
  assert.equal(lastCollectionFocus, filtersButton, 'Back out of filters should restore focus to the Filters button');
  component.destroy();
  storage.lme_shikimori_filters_v1 = {};
}

function testPaginationDeduplicationAndDestroy() {
  ajaxCalls.length = 0;
  const component = new api.Component({ page: 1 });
  component.activity = { loader() {}, toggle() {} };
  component.create();

  const body = jqueryInstances.filter(item => String(item.selector).indexOf('LMEShikimori-catalog--list') !== -1).pop();
  assert.ok(body, 'catalogue container should be created');
  const graphqlRequests = () => ajaxCalls.filter(item => item.options.url === 'https://shikimori.one/api/graphql');
  const firstPage = graphqlRequests()[0];
  const firstBatch = Array.from({ length: 36 }, (_, index) => ({ id: index + 1, name: 'Anime ' + (index + 1) }));
  const visibleCallsBeforeFirstPage = layerVisibleCalls.length;
  firstPage.xhr.resolve({ data: { animes: firstBatch } });
  assert.equal(body.nodes.length, 36);
  assert.ok(layerVisibleCalls.length > visibleCallsBeforeFirstPage, 'new catalogue cards should trigger Lampa lazy-image visibility processing immediately');
  assert.equal(layerVisibleCalls[layerVisibleCalls.length - 1].selector, 'scroll', 'visibility processing should target the catalogue scroll container');

  scrollInstances[scrollInstances.length - 1].onEnd();
  scrollInstances[scrollInstances.length - 1].onEnd();
  assert.equal(graphqlRequests().length, 2, 'scroll lock should allow one next-page request');

  const secondPage = graphqlRequests()[1];
  const secondBatch = [{ id: 36, name: 'duplicate' }].concat(
    Array.from({ length: 35 }, (_, index) => ({ id: 37 + index, name: 'Anime ' + (37 + index) }))
  );
  secondPage.xhr.resolve({ data: { animes: secondBatch } });
  assert.equal(body.nodes.length, 71, 'duplicate id must be skipped across pages');

  scrollInstances[scrollInstances.length - 1].onEnd();
  const thirdPage = graphqlRequests()[2];
  component.destroy();
  assert.equal(thirdPage.xhr.aborted, true, 'destroy must abort an in-flight page request');
}

function testEmptyRestoredPage() {
  ajaxCalls.length = 0;
  const before = emptyCreated;
  const component = new api.Component({ page: 2 });
  component.activity = { loader() {}, toggle() {} };
  component.create();

  const request = ajaxCalls.find(item => item.options.url === 'https://shikimori.one/api/graphql');
  request.xhr.resolve({ data: { animes: [] } });
  assert.equal(emptyCreated, before + 1, 'empty state must render when a restored page is empty');
  component.destroy();
}

function testCatalogueRetryAfterInitialFailure() {
  ajaxCalls.length = 0;
  const component = new api.Component({ page: 1 });
  component.activity = {
    loader() {},
    toggle() {
      if (controllerCollections.content) controllerCollections.content.toggle();
    }
  };
  component.create();
  component.start();

  const graphqlRequests = () => ajaxCalls.filter(item => item.options.url === 'https://shikimori.one/api/graphql');
  const firstRequest = graphqlRequests()[0];
  assert.ok(firstRequest, 'initial catalogue request should start');
  const initialLoading = jqueryInstances.filter(item => String(item.selector).indexOf('LMEShikimori__loading-info') !== -1).pop();
  assert.ok(initialLoading && source.includes('Загружается каталог Shikimori'), 'initial load should render a visible progress status');
  firstRequest.xhr.reject(503, { message: 'Service unavailable' });
  assert.equal(initialLoading.removed, true, 'loading status should be removed after a request failure');

  const retry = jqueryInstances.find(item => String(item.selector).indexOf('LMEShikimori__retry">') !== -1);
  assert.ok(retry && retry.handlers['hover:enter'], 'failed initial load should expose a remote-friendly retry control');
  assert.equal(lastCollectionFocus, retry, 'failure should move remote focus to the retry control');
  retry.handlers['hover:enter']();
  assert.equal(graphqlRequests().length, 2, 'retry should issue another catalogue request');
  const retryRequest = graphqlRequests()[1];
  assert.equal(JSON.parse(retryRequest.options.data).variables.page, 1, 'retry should request the failed page');
  assert.equal(retry.removed, true, 'retry control should disappear once retry starts');
  const retryLoading = jqueryInstances.filter(item => String(item.selector).indexOf('LMEShikimori__loading-info') !== -1).pop();
  assert.ok(retryLoading && source.includes('Повторная загрузка каталога'), 'retry should render a visible loading status');

  retryRequest.xhr.resolve({ data: { animes: [{ id: 9001, name: 'Retry success' }] } });
  assert.equal(retryLoading.removed, true, 'loading status should disappear after a successful retry');
  component.destroy();
}

function testTmdbAdultSearchFlagRemainsEnabled() {
  assert.match(source, /&include_adult=true&query=/, 'TMDB fallback search should preserve the existing include_adult=true behavior');
}

function testNoAccountAuthorizationRemains() {
  assert.equal(Object.keys(storage.lme_shikimori_account_v1).length, 0, 'legacy OAuth credentials and tokens must be cleared');
  assert.equal(storage.lme_shikimori_oauth_state, '', 'legacy OAuth state must be cleared');
  assert.equal(source.indexOf('/oauth/'), -1, 'OAuth endpoints must be removed');
  assert.doesNotMatch(source, /client_secret|refresh_token|user_rates|whoami/i);
  assert.doesNotMatch(source, /accountMenu|connectShikimori|disconnectShikimori|authenticatedRequest|accountList|Shikimori__account|authNetwork|authGeneration|refreshWaiters|refreshInFlight/);
  assert.doesNotMatch(source, /Изменить запись в Shikimori|Мой список Shikimori/);
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
  assert.match(source, /onCheck: function \(chosen\)/, 'genre filters should use checkbox callbacks');
}

testSeasonBoundariesAndTmdbMatchConfidence();
testRequestCancellation();
testGraphQLVariablesAndFilterCoverage();
testNativeCardBadgesAndIdIsolation();
testRestoredFiltersAreStableAcrossPages();
testGenreFilterHandlesSlowInitialLoad();
testResetFiltersClearsCheckboxState();
testTvFriendlyFilterGroupsAndBackNavigation();
testPaginationDeduplicationAndDestroy();
testEmptyRestoredPage();
testCatalogueRetryAfterInitialFailure();
testLegacyCardFallbackSafety();
testTmdbAdultSearchFlagRemainsEnabled();
testNoAccountAuthorizationRemains();

process.stdout.write('Shikimori smoke tests: PASS (13 groups)\n');
