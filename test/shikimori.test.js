const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')

/**
 * Builds a realistic Lampa + Browser DOM environment modeled on yumata/lampa-source
 * (strictly exposing only real Lampa APIs — no Lampa.Navigator, no Lampa.Config, no scroll.content).
 */
function createLampaHarness(customResponder) {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div class="menu"><ul class="menu__list"></ul></div><div id="app"></div></body></html>', {
        url: 'https://lampa.mx/'
    })
    const { window } = dom
    global.window = window
    global.document = window.document

    delete require.cache[require.resolve('jquery')]
    const $ = require('jquery')

    global.$ = $
    global.jQuery = $

    const state = {
        lang: 'ru',
        storage: {
            shikimori_context: true,
            shikimori_button: false,
            shikimori_anime_only: true,
            shikimori_host: 'auto'
        },
        strings: {},
        components: {},
        settingsComponents: {},
        settingsParams: [],
        manifestPlugins: [],
        listeners: {},
        controllers: {},
        activeController: 'content',
        focusedElement: null,
        collection: [],
        appendedCollections: [],
        activities: [],
        replacedActivity: null,
        backwardCalled: 0,
        notyMessages: [],
        selectCalls: [],
        inputEditCalls: [],
        loadingCancelFn: null,
        loadingActive: false,
        requests: [],
        clearedNetworks: 0,
        playedVideos: [],
        backgroundUrl: null,
        navCanMove: { up: false, down: true, left: false, right: false },
        navMoved: []
    }

    const responder = customResponder || (() => ({ status: 200, data: [] }))

    global.Navigator = {
        canmove(dir) {
            return Boolean(state.navCanMove[dir])
        },
        move(dir) {
            state.navMoved.push(dir)
        },
        setCollection(col) {
            state.collection = col
        },
        focus(el) {
            state.focusedElement = el
        },
        multiAdd(arr) {
            state.appendedCollections.push(arr)
        }
    }

    function FakeReguest() {
        let active = true
        this.timeout = function () {}
        this.clear = function () {
            active = false
            state.clearedNetworks++
        }
        this.silent = function (url, onOk, onErr, postData, params) {
            state.requests.push({ url, params })
            const reply = responder(url, params)
            if (reply && reply.defer) {
                reply.defer(() => {
                    if (!active) return
                    onOk && onOk(reply.data)
                }, (err) => {
                    if (!active) return
                    onErr && onErr(err)
                })
                return
            }
            if (!active) return
            if (!reply || reply.error) {
                onErr && onErr(reply ? reply.jqXHR : { status: 500 })
            } else {
                onOk && onOk(reply.data)
            }
        }
    }

    function FakeScroll(params) {
        const root = $('<div class="scroll"><div class="scroll__content"><div class="scroll__body"></div></div></div>')
        const body = root.find('.scroll__body')
        this.params = () => params || {}
        this.minus = () => { root.addClass('layer--wheight') }
        this.append = (obj) => { body.append(obj) }
        this.clear = () => { body.empty() }
        this.reset = () => {}
        this.update = (elem) => { this.lastUpdated = elem }
        this.body = (js) => (js ? body[0] : body)
        this.render = (js) => (js ? root[0] : root)
        this.destroy = () => { root.remove() }
    }

    const manifestObj = {}
    Object.defineProperty(manifestObj, 'plugins', {
        get: () => state.manifestPlugins,
        set: (plugin) => {
            if (plugin && typeof plugin === 'object' && typeof plugin.type === 'string') {
                state.manifestPlugins.push(plugin)
            }
        }
    })

    global.Lampa = {
        Lang: {
            add(dict) {
                Object.assign(state.strings, dict)
            },
            get() {
                return state.lang
            },
            translate(key) {
                const item = state.strings[key]
                return item ? (item[state.lang] || item.ru || key) : key
            }
        },
        Storage: {
            field(name) {
                return state.storage[name]
            }
        },
        Listener: {
            follow(event, fn) {
                if (!state.listeners[event]) state.listeners[event] = []
                state.listeners[event].push(fn)
            },
            send(event, payload) {
                ;(state.listeners[event] || []).forEach((fn) => fn(payload))
            }
        },
        Component: {
            add(name, Comp) {
                state.components[name] = Comp
            }
        },
        SettingsApi: {
            addComponent(data) {
                state.settingsComponents[data.component] = data
            },
            addParam(data) {
                state.settingsParams.push(data)
            }
        },
        Menu: {
            addButton(icon, title, action) {
                const btn = $(`<li class="menu__item selector"><div class="menu__ico">${icon}</div><div class="menu__text">${title}</div></li>`)
                if (action) btn.on('hover:enter', action)
                $('.menu .menu__list').eq(0).append(btn)
                return btn
            }
        },
        Controller: {
            add(name, cfg) {
                state.controllers[name] = cfg
            },
            toggle(name) {
                state.activeController = name
                if (state.controllers[name] && state.controllers[name].toggle) {
                    state.controllers[name].toggle()
                }
            },
            enabled() {
                return { name: state.activeController, controller: state.controllers[state.activeController] }
            },
            collectionSet(html) {
                const el = html instanceof $ ? html[0] : html
                state.collection = Array.from(el.querySelectorAll('.selector'))
            },
            collectionFocus(target, html) {
                state.focusedElement = target || (state.collection[0] || null)
            },
            collectionAppend(items) {
                const arr = items instanceof $ ? items.toArray() : [items]
                state.appendedCollections.push(arr)
                state.collection = state.collection.concat(arr)
            }
        },
        Activity: {
            push(obj) {
                state.activities.push(obj)
            },
            replace(obj) {
                state.replacedActivity = obj
            },
            backward() {
                state.backwardCalled++
            },
            back() {
                state.backwardCalled++
            }
        },
        Loading: {
            start(onCancel) {
                state.loadingActive = true
                state.loadingCancelFn = onCancel || null
                state.activeController = 'loading'
            },
            stop() {
                state.loadingActive = false
                state.loadingCancelFn = null
            }
        },
        Noty: {
            show(msg, opts) {
                state.notyMessages.push({ msg, opts })
            }
        },
        Select: {
            show(cfg) {
                state.selectCalls.push(cfg)
            },
            close() {}
        },
        Input: {
            edit(params, cb) {
                state.inputEditCalls.push({ params, cb })
            }
        },
        TMDB: {
            api(path) {
                return 'https://api.themoviedb.org/3/' + path
            },
            key() {
                return 'test_tmdb_key_123'
            }
        },
        Background: {
            immediately(url) {
                state.backgroundUrl = url
            }
        },
        Player: {
            play(video) {
                state.playedVideos.push(video)
            },
            playlist() {}
        },
        Platform: {
            is() {
                return false
            }
        },
        Reguest: FakeReguest,
        Scroll: FakeScroll,
        Manifest: manifestObj
    }

    window.Lampa = global.Lampa
    window.Navigator = global.Navigator
    window.appready = true

    delete require.cache[require.resolve('../Shikimori.js')]
    const plugin = require('../Shikimori.js')
    plugin.cacheClear()

    return { state, plugin, $, window }
}

describe('Shikimori.js — Pure Utilities & Formatting', () => {
    let plugin

    beforeEach(() => {
        ;({ plugin } = createLampaHarness())
    })

    it('escapes HTML characters including double and single quotes for attribute safety', () => {
        assert.equal(
            plugin.esc('<img src="x" onerror=\'alert(1)&foo\'>'),
            '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&amp;foo&#39;&gt;'
        )
        assert.equal(plugin.esc(null), '')
        assert.equal(plugin.esc(undefined), '')
        assert.equal(plugin.esc(42), '42')
    })

    it('cleans Shikimori BBCode while completely removing [spoiler] blocks', () => {
        const raw = 'Герой [character=10]Наруто[/character] живёт в [anime=20]Конохе[/anime]. [spoiler=Финал]Обито выжил![/spoiler] И [b]идёт[/b] вперёд.'
        assert.equal(plugin.cleanDescription(raw), 'Герой Наруто живёт в Конохе. И идёт вперёд.')
    })

    it('normalizes Latin, Cyrillic, and Japanese titles consistently', () => {
        assert.equal(plugin.normalize('Shingeki no Kyojin: The Final Season!'), 'shingeki no kyojin the final season')
        assert.equal(plugin.normalize('Атака титанов — Финал (2023)'), 'атака титанов финал 2023')
        assert.equal(plugin.normalize('進撃の巨人!!'), '進撃の巨人')
        assert.equal(plugin.normalize('   ---   '), '')
    })

    it('strips season/part suffixes and Roman numerals for TMDB fallback matching', () => {
        assert.equal(plugin.stripSeasonSuffix('Attack on Titan: The Final Season'), 'Attack on Titan')
        assert.equal(plugin.stripSeasonSuffix('Boku no Hero Academia 2nd Season'), 'Boku no Hero Academia')
        assert.equal(plugin.stripSeasonSuffix('Атака титанов 2 сезон'), 'Атака титанов')
        assert.equal(plugin.stripSeasonSuffix('Mob Psycho 100 II'), 'Mob Psycho 100')
    })

    it('formats episodes accurately for 1-ep movies, ongoing series, and completed series', () => {
        assert.equal(plugin.formatEpisodes({ kind: 'movie', status: 'released', episodes: 1, episodes_aired: 1 }), '1 эп.')
        assert.equal(plugin.formatEpisodes({ kind: 'tv', status: 'ongoing', episodes: 12, episodes_aired: 7 }), '7 / 12 эп.')
        assert.equal(plugin.formatEpisodes({ kind: 'tv', status: 'ongoing', episodes: 0, episodes_aired: 1095 }), '1095 / ? эп.')
        assert.equal(plugin.formatEpisodes({ kind: 'tv', status: 'anons', episodes: 0, episodes_aired: 0 }), '')
    })

    it('formats score and age rating without showing "0.0" or "none"', () => {
        assert.equal(plugin.formatScore('0.0'), '')
        assert.equal(plugin.formatScore(0), '')
        assert.equal(plugin.formatScore('8.74'), '8.74')
        assert.equal(plugin.formatRating('none'), '')
        assert.equal(plugin.formatRating('pg_13'), 'PG-13')
        assert.equal(plugin.formatRating('r_plus'), 'R+')
    })

    it('selects preview poster for lists and high-res original poster for details', () => {
        const anime = {
            image: {
                preview: '/system/animes/preview/1.jpg',
                original: '/system/animes/original/1.jpg'
            }
        }
        assert.equal(plugin.posterOf(anime, false), 'https://shikimori.one/system/animes/preview/1.jpg')
        assert.equal(plugin.posterOf(anime, true), 'https://shikimori.one/system/animes/original/1.jpg')
        assert.equal(plugin.posterOf({}, true), plugin.PLACEHOLDER)
    })

    it('extracts and deduplicates YouTube video IDs from Shikimori videos array', () => {
        const trailers = plugin.extractTrailers([
            { url: 'http://youtu.be/dQw4w9WgXcQ', name: 'PV 1', kind: 'pv' },
            { player_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1', name: 'Duplicate' },
            { url: 'https://www.youtube.com/watch?v=abcDEF123_-', name: 'PV 2', kind: 'pv' }
        ])
        assert.equal(trailers.length, 2)
        assert.equal(trailers[0].id, 'dQw4w9WgXcQ')
        assert.equal(trailers[1].id, 'abcDEF123_-')
    })

    it('identifies anime/animation cards vs live-action Western cards', () => {
        assert.equal(plugin.isCardLikelyAnime({ genre_ids: [16, 28], original_language: 'en' }), true)
        assert.equal(plugin.isCardLikelyAnime({ genre_ids: [18], original_language: 'ja' }), true)
        assert.equal(plugin.isCardLikelyAnime({ genre_ids: [18, 80], original_language: 'en', origin_country: ['US'] }), false)
        assert.equal(plugin.isCardLikelyAnime({ title: 'Sparse Card Without Genres' }), true)
    })
})

describe('Shikimori.js — Multi-Host Fallback, Cache & TMDB Matching', () => {
    it('rotates modularly across mirrors on outage, caches hits, and does NOT rotate on 404', () => {
        let failOne = true
        let failIo = false
        const { state, plugin } = createLampaHarness((url) => {
            if (url.includes('/999999')) return { error: true, jqXHR: { status: 404 } }
            if (url.startsWith('https://shikimori.one') && failOne) return { error: true, jqXHR: { status: 503 } }
            if (url.startsWith('https://shikimori.io') && failIo) return { error: true, jqXHR: { status: 503 } }
            return { data: [{ id: 1, name: 'Cowboy Bebop' }] }
        })

        // 1) shikimori.one fails -> falls back to shikimori.io and caches result
        let result = null
        plugin.shikiRequest(null, '?search=Bebop', (res) => { result = res }, () => {})
        assert.equal(result.length, 1)
        assert.equal(state.requests.length, 2)
        assert.ok(state.requests[0].url.startsWith('https://shikimori.one'))
        assert.ok(state.requests[1].url.startsWith('https://shikimori.io'))

        // 2) Repeat same query -> served from TTL cache without new network calls
        plugin.shikiRequest(null, '?search=Bebop', (res) => { result = res }, () => {})
        assert.equal(state.requests.length, 2)

        // 3) 404 does NOT trigger mirror switch or extra retry
        let failed404 = false
        plugin.shikiRequest(null, '/999999', () => {}, () => { failed404 = true })
        assert.equal(failed404, true)
        assert.equal(state.requests.length, 3)

        // 4) If shikimori.io later goes down and shikimori.one recovers, modular rotation recovers back to shikimori.one!
        failIo = true
        failOne = false
        let recovered = null
        plugin.shikiRequest(null, '?search=Trigun', (res) => { recovered = res }, () => {})
        assert.equal(recovered.length, 1)
        assert.ok(state.requests[state.requests.length - 1].url.startsWith('https://shikimori.one'))
    })

    it('uses Lampa.TMDB.key(), strips season suffix on fallback, and ranks JP Animation highest', () => {
        const { state, plugin } = createLampaHarness((url) => {
            if (url.includes(encodeURIComponent('Shingeki no Kyojin: The Final Season'))) {
                return { data: { results: [] } }
            }
            if (url.includes(encodeURIComponent('Attack on Titan')) && url.includes('search/tv')) {
                return {
                    data: {
                        results: [
                            {
                                id: 500,
                                name: 'Attack on Titan Live Show',
                                original_name: 'Attack on Titan Live Show',
                                genre_ids: [99],
                                original_language: 'en',
                                first_air_date: '2018-01-01'
                            },
                            {
                                id: 1429,
                                name: 'Атака титанов',
                                original_name: '進撃の巨人',
                                genre_ids: [16, 10765],
                                original_language: 'ja',
                                origin_country: ['JP'],
                                first_air_date: '2013-04-07'
                            }
                        ]
                    }
                }
            }
            return { data: { results: [] } }
        })

        let found = null
        plugin.tmdbForAnime({
            name: 'Shingeki no Kyojin: The Final Season',
            english: ['Attack on Titan: The Final Season'],
            russian: 'Атака титанов: Финал',
            kind: 'tv',
            aired_on: '2020-12-07'
        }, (res) => {
            found = res
        })

        assert.ok(state.requests.some((r) => r.url.includes('api_key=test_tmdb_key_123')))
        assert.ok(Array.isArray(found) && found.length >= 1)
        assert.equal(found[0].id, 1429)
        assert.equal(found[0].media_type, 'tv')
    })
})

describe('Shikimori.js — Lampa Components, Settings, Menu & Pagination Integration', () => {
    it('registers settings with SVG icon (no "undefined") and dynamic onContextMenu getter', () => {
        const { state, $ } = createLampaHarness()

        const comp = state.settingsComponents.shikimori
        assert.ok(comp, 'shikimori settings component registered')
        assert.ok(comp.icon && comp.icon.includes('<svg'), 'settings icon is valid SVG, not undefined')

        assert.equal($('.menu .shikimori-menu-item').length, 1, 'menu button added once')
        global.Lampa.Listener.send('menu', { type: 'end' })
        assert.equal($('.menu .shikimori-menu-item').length, 1, 'menu button not duplicated on menu re-render')

        assert.equal(state.manifestPlugins.length, 1)
        const registeredPlugin = state.manifestPlugins[0]
        // Lampa checks truthiness of plugin.onContextMenu directly (without calling it)
        assert.equal(Boolean(registeredPlugin.onContextMenu), true)
        state.storage.shikimori_context = false
        assert.equal(Boolean(registeredPlugin.onContextMenu), false)
    })

    it('renders full-card button with SVG + span, deduplicates, and filters non-anime cards', () => {
        const { state, $ } = createLampaHarness()
        state.storage.shikimori_button = true
        state.storage.shikimori_anime_only = true

        const cardDom = $('<div><div class="full-start-new__buttons"></div></div>')
        const fakeActivity = { render: () => cardDom }

        // Western live-action movie -> skipped when shikimori_anime_only is true
        global.Lampa.Listener.send('full', {
            type: 'complite',
            data: { movie: { title: 'Oppenheimer', genre_ids: [18, 36], original_language: 'en', origin_country: ['US'] } },
            object: { activity: fakeActivity }
        })
        assert.equal(cardDom.find('.shiki-card-btn').length, 0)

        // Anime movie -> button injected with <svg> and <span>, no duplicate on second event
        const animeMovie = { title: 'Your Name', original_title: 'Kimi no Na wa.', genre_ids: [16, 18], original_language: 'ja' }
        global.Lampa.Listener.send('full', { type: 'complite', data: { movie: animeMovie }, object: { activity: fakeActivity } })
        global.Lampa.Listener.send('full', { type: 'complite', data: { movie: animeMovie }, object: { activity: fakeActivity } })

        const btn = cardDom.find('.shiki-card-btn')
        assert.equal(btn.length, 1)
        assert.equal(btn.find('svg').length, 1)
        assert.equal(btn.find('span').text(), 'Shikimori')
    })

    it('paginates ShikimoriSearchComponent without duplicating .shiki-more and navigates to head/menu', () => {
        const page1 = Array.from({ length: 20 }, (_, i) => ({
            id: i + 1,
            name: 'Anime ' + (i + 1),
            russian: 'Аниме ' + (i + 1),
            kind: 'tv',
            status: 'ongoing',
            episodes: 12,
            episodes_aired: 5,
            score: '8.1',
            aired_on: '2026-01-10',
            image: { preview: '/system/animes/preview/' + (i + 1) + '.jpg' }
        }))
        const page2 = Array.from({ length: 5 }, (_, i) => ({
            id: 100 + i,
            name: 'Anime Extra ' + i,
            russian: 'Аниме Экстра ' + i,
            kind: 'tv',
            score: '7.5'
        }))

        const { state } = createLampaHarness((url) => {
            if (url.includes('page=1')) return { data: page1 }
            if (url.includes('page=2')) return { data: page2 }
            return { data: [] }
        })

        const SearchComp = state.components.shikimori_search
        const comp = new SearchComp({ search: '', mode: 'ongoing', page: 1 })
        const rendered = comp.create()
        comp.start()

        assert.equal(rendered.find('.shiki-card').length, 20)
        assert.equal(rendered.find('.shiki-more').length, 1, 'exactly one Load More button after page 1')

        // Trigger Load More -> page 2 has 5 items (< 20), so .shiki-more must be completely removed!
        rendered.find('.shiki-more').trigger('hover:enter')
        assert.equal(rendered.find('.shiki-card').length, 25)
        assert.equal(rendered.find('.shiki-more').length, 0, 'no leftover Load More button on final page')

        // Controller spatial navigation transitions to head/menu and backward
        state.controllers.content.up()
        assert.equal(state.activeController, 'head')
        state.controllers.content.left()
        assert.equal(state.activeController, 'menu')
        state.controllers.content.back()
        assert.equal(state.backwardCalled, 1)

        // Cancelling empty search input keeps UI intact instead of blank screen
        rendered.find('.shiki-tab').first().trigger('hover:enter')
        assert.equal(state.inputEditCalls.length, 1)
        state.inputEditCalls[0].cb('   ')
        assert.equal(state.replacedActivity, null)
        assert.equal(rendered.find('.shiki-card').length, 25)

        comp.destroy()
        assert.ok(state.clearedNetworks >= 1)
    })

    it('renders ShikimoriFullComponent inside Scroll with trailer, franchise relations (ignoring manga), and error retry', () => {
        let shouldFail = true
        const { state } = createLampaHarness((url) => {
            if (shouldFail) return { error: true, jqXHR: { status: 500 } }
            if (url.endsWith('/api/animes/5114')) {
                return {
                    data: {
                        id: 5114,
                        name: 'Fullmetal Alchemist: Brotherhood',
                        russian: 'Стальной алхимик: Братство',
                        kind: 'tv',
                        status: 'released',
                        episodes: 64,
                        duration: 24,
                        score: '9.1',
                        rating: 'r',
                        aired_on: '2009-04-05',
                        description: 'История братьев [character=11]Эдварда[/character]. [spoiler]Секрет камня[/spoiler]',
                        image: { preview: '/p.jpg', original: '/orig.jpg' },
                        studios: [{ name: 'Bones' }],
                        genres: [{ name: 'Action', russian: 'Экшен' }],
                        videos: [{ url: 'https://youtu.be/1dNkQoE76nY', name: 'Trailer 1', kind: 'pv' }],
                        screenshots: [{ preview: '/shot1.jpg' }]
                    }
                }
            }
            if (url.endsWith('/api/animes/5114/related')) {
                return {
                    data: [
                        { relation: 'Adaptation', relation_russian: 'Адаптация', anime: null, manga: { id: 25, name: 'FMA Manga' } },
                        { relation: 'Side story', relation_russian: 'Другая история', anime: { id: 6421, name: 'FMA Specials', russian: 'Спешлы', kind: 'special', aired_on: '2009-08-26', score: '8.0' } }
                    ]
                }
            }
            if (url.endsWith('/api/animes/5114/similar')) {
                return {
                    data: [{ id: 11061, name: 'Hunter x Hunter (2011)', russian: 'Охотник х Охотник', kind: 'tv', score: '9.0' }]
                }
            }
            return { data: [] }
        })

        const FullComp = state.components.shikimori_full
        const comp = new FullComp({ anime_id: 5114 })
        const rendered = comp.create()
        comp.start()

        // First attempt failed -> error screen with .shiki-retry selector is shown and controller active
        assert.equal(rendered.find('.shiki-retry').length, 1)

        // Retry succeeds
        shouldFail = false
        rendered.find('.shiki-retry').trigger('hover:enter')

        assert.ok(rendered.find('.scroll').length === 1, 'wrapped in Lampa.Scroll')
        assert.equal(rendered.find('.shiki-full__img').attr('src'), 'https://shikimori.one/orig.jpg')
        assert.equal(state.backgroundUrl, 'https://shikimori.one/orig.jpg')
        assert.equal(rendered.find('.shiki-full__descr').text(), 'История братьев Эдварда.')
        assert.equal(rendered.find('.shiki-trailer-btn').length, 1)
        assert.equal(rendered.find('.shiki-subcard').length, 2, '1 anime relation (manga skipped) + 1 similar anime')

        // Play trailer
        rendered.find('.shiki-trailer-btn').trigger('hover:enter')
        assert.equal(state.playedVideos.length, 1)
        assert.equal(state.playedVideos[0].id, '1dNkQoE76nY')

        comp.destroy()
    })

    it('supports remote-control cancellation and query deduplication in openShikimoriForCard', () => {
        let deferredResolve = null
        const { state, plugin } = createLampaHarness((url) => ({
            defer(ok) {
                deferredResolve = ok
            },
            data: [{ id: 1, name: 'Naruto' }]
        }))

        plugin.openShikimoriForCard({
            title: 'Naruto',
            original_title: 'Naruto',
            name: 'Naruto'
        })

        assert.equal(state.loadingActive, true)
        assert.equal(typeof state.loadingCancelFn, 'function', 'Loading.start received on_cancel callback')

        // Simulate user pressing Back on TV remote during loading
        state.loadingCancelFn()
        assert.equal(state.loadingActive, false)

        // Late network completion must be ignored after cancel
        deferredResolve([{ id: 1, name: 'Naruto' }])
        assert.equal(state.activities.length, 0)
    })
})
