/**
 * Lampa plugin: Shikimori (https://shikimori.one) anime info
 * - Menu item with search by title (paginated results)
 * - Full card: rating, genres, studios, description, alt titles
 * - TMDB lookup by original/russian title:
 *     1 result  -> opens the full card
 *     N results -> selection menu
 * - Card context-menu entry "Info on Shikimori" (via Manifest.plugins push-setter)
 *
 * Review fixes applied:
 *  1. Controller registration in both components (feed.js pattern)
 *  3. media_type stamped before merging TMDB results
 *  4. normalize() with \p{L} + empty-string guard
 *  5. Manifest.plugins registered via official push-setter (no overwrite)
 *  6. Text input via Lampa.Input.edit(params, callback)
 *  7. Activity.replace without extra reload()
 *  8. multi-query fallback for both Shikimori and TMDB (+dedupe by id)
 *  9. full-card button uses Lampa.Controller.collectionAppend
 * 10. menu item re-appended on menu render, deduped by class
 * 12. Loading.start/stop around every network call
 * 13. stable scroll container (no replaceWith breaking #id)
 * 14. pagination ("load more")
 * 15. data-URI poster placeholder
 * 17. all strings localized
 */
(function () {
    if (window.shikimori_plugin_ready) return
    window.shikimori_plugin_ready = true

    const HOSTS = ['https://shikimori.one', 'https://shikimori.io']
    const UA    = 'LampaShikimoriPlugin/1.0'
    const PAGE  = 20
    let hostIdx = 0

    const network = new Lampa.Reguest()

    // ---------- localization ----------
    Lampa.Lang.add({
        shikimori:            { ru: 'Аниме (Shikimori)', en: 'Anime (Shikimori)', uk: 'Аніме (Shikimori)' },
        shikimori_on_shiki:   { ru: 'Информация на Shikimori', en: 'Info on Shikimori', uk: 'Інформація на Shikimori' },
        shikimori_input_title:{ ru: 'Название аниме', en: 'Anime title', uk: 'Назва аніме' },
        shikimori_tmdb:       { ru: 'Найти на TMDB', en: 'Find on TMDB', uk: 'Знайти на TMDB' },
        shikimori_no_tmdb:    { ru: 'На TMDB ничего не найдено', en: 'Nothing found on TMDB', uk: 'На TMDB нічого не знайдено' },
        shikimori_empty:      { ru: 'Ничего не найдено', en: 'Nothing found', uk: 'Нічого не знайдено' },
        shikimori_error:      { ru: 'Ошибка загрузки Shikimori', en: 'Shikimori load error', uk: 'Помилка завантаження Shikimori' },
        shikimori_choose:     { ru: 'Выберите результат', en: 'Choose a result', uk: 'Оберіть результат' },
        shikimori_load_more:  { ru: 'Загрузить ещё', en: 'Load more', uk: 'Завантажити ще' },
        shikimori_page_shiki: { ru: 'Страница на Shikimori', en: 'Page on Shikimori', uk: 'Сторінка на Shikimori' },
        shikimori_movie:      { ru: 'Фильм', en: 'Movie', uk: 'Фільм' },
        shikimori_series:     { ru: 'Сериал', en: 'Series', uk: 'Серіал' },
        shikimori_episodes:   { ru: 'эп.', en: 'ep.', uk: 'еп.' },
        shikimori_minutes:    { ru: 'мин.', en: 'min', uk: 'хв.' },
        shikimori_score:      { ru: 'Оценка', en: 'Score', uk: 'Оцінка' },
        shikimori_rate:       { ru: 'Рейтинг', en: 'Rating', uk: 'Рейтинг' },
        shikimori_released:   { ru: 'Вышел', en: 'Released', uk: 'Вийшов' },
        shikimori_studios:    { ru: 'Студия', en: 'Studio', uk: 'Студія' },
        shikimori_alt_names:  { ru: 'Альтернативные названия', en: 'Alternative names', uk: 'Альтернативні назви' },
        shikimori_anons:      { ru: 'Анонс', en: 'Anons', uk: 'Анонс' },
        shikimori_ongoing:    { ru: 'Онгоинг', en: 'Airing', uk: 'Онгоїнг' },
        shikimori_released_s: { ru: 'Вышло', en: 'Released', uk: 'Вийшло' },
        shikimori_cancelled:  { ru: 'Отменён', en: 'Cancelled', uk: 'Скасовано' },
        shikimori_paused:     { ru: 'Приостановлен', en: 'Paused', uk: 'Призупинено' },
        shikimori_context_menu: { ru: 'Пункт в контекстном меню карточки', en: 'Entry in card context menu', uk: 'Пункт у контекстному меню картки' },
        shikimori_full_button:  { ru: 'Кнопка Shikimori в карточке фильма', en: 'Shikimori button in movie card', uk: 'Кнопка Shikimori у картці фільму' }
    })

    const lang = () => Lampa.Lang.get()
    const tr   = (key) => Lampa.Lang.translate(key)
    const isRu = () => lang() === 'ru' || lang() === 'uk'

    // ---------- utils ----------
    function esc(str) {
        return $('<div>').text(str == null ? '' : String(str)).html()
    }

    function cleanDescription(text) {
        if (!text) return ''
        return text.replace(/\[[^\]]*\]/g, '').trim()
    }

    const KIND = { tv: 'TV', tv_special: 'TV Special', movie: 'Movie', ova: 'OVA', ona: 'ONA', music: 'Music', pv: 'PV', cm: 'CM', tv_ova: 'OVA' }

    function kindTitle(kind) { return KIND[kind] || kind || '?' }

    function statusTitle(s) {
        const map = {
            anons: tr('shikimori_anons'), ongoing: tr('shikimori_ongoing'),
            released: tr('shikimori_released_s'), cancelled: tr('shikimori_cancelled'),
            paused: tr('shikimori_paused')
        }
        return map[s] || s || ''
    }

    const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150"><rect width="100" height="150" fill="#24262f"/></svg>')

    function posterOf(a) {
        if (!a.image) return PLACEHOLDER
        const p = a.image.preview || ''
        return p.indexOf('http') === 0 ? p : HOSTS[hostIdx] + p
    }

    // \p{L} covers latin/cyrillic/CJK; try/catch for old TV webviews
    function normalize(s) {
        s = (s || '').toLowerCase()
        try { return s.replace(/[^\p{L}\p{N}]+/gu, ' ').trim() }
        catch (e) { return s.replace(/[^a-z0-9а-яё]+/gi, ' ').trim() }
    }

    let cssInjected = false
    function injectCss() {
        if (cssInjected) return
        cssInjected = true
        $('head').append('<style>' +
            '.shiki-card{display:flex;background:#1b1e27;border-radius:8px;margin-bottom:0.5em;padding:0.5em}' +
            '.shiki-card.selector--focus,.shiki-card.focus{background:#2a2f3d;outline:2px solid #4ea7ff;outline-offset:-2px}' +
            '.shiki-card__poster img{width:6em;height:9em;object-fit:cover;border-radius:4px}' +
            '.shiki-card__body{padding:0.5em 1em}' +
            '.shiki-card__name{font-size:1.3em;font-weight:bold}' +
            '.shiki-card__orig{color:#878787;margin:0.2em 0}' +
            '.shiki-card__meta{color:#aaa;font-size:0.9em}' +
            '.shiki-card__score{color:#ffa100;font-weight:bold}' +
            '.shiki-full{display:flex;padding:1em;gap:1em}' +
            '.shiki-full__img{width:14em;height:20em;object-fit:cover;border-radius:8px}' +
            '.shiki-full__info{flex:1;max-width:60em}' +
            '.shiki-full__title{font-size:1.8em;margin:0}' +
            '.shiki-full__orig{font-size:1.1em;color:#878787;margin:0.2em 0 0.6em}' +
            '.shiki-full__facts span{display:inline-block;background:#2a2f3d;border-radius:4px;padding:0.1em 0.5em;margin:0.15em 0.3em 0.15em 0;font-size:0.9em}' +
            '.shiki-full__genres span{color:#4ea7ff;margin-right:0.6em;font-size:0.95em}' +
            '.shiki-full__descr{margin:1em 0;line-height:1.5;white-space:pre-line}' +
            '.shiki-full__alt{color:#878787;font-size:0.9em;margin-bottom:1em}' +
            '.shiki-more{color:#4ea7ff;padding:1em;text-align:center}' +
            '</style>')
    }

    // ---------- shikimori API (multi-host fallback) ----------
    function shikiGet(pathAndQuery, success, failure) {
        const url = HOSTS[hostIdx] + '/api/animes' + pathAndQuery
        Lampa.Loading.start()
        network.silent(url, function (res) {
            Lampa.Loading.stop()
            if (res === false || res === undefined || (typeof res === 'object' && res.error)) {
                if (hostIdx < HOSTS.length - 1) { hostIdx++; shikiGet(pathAndQuery, success, failure); return }
                if (failure) failure()
                return
            }
            success(res)
        }, function () {
            Lampa.Loading.stop()
            if (hostIdx < HOSTS.length - 1) { hostIdx++; shikiGet(pathAndQuery, success, failure); return }
            if (failure) failure()
        }, null, { headers: { 'User-Agent': UA } }) // honored only where the platform allows UA override
    }

    function shikiSearch(query, page, success, failure) {
        shikiGet('?search=' + encodeURIComponent(query) + '&limit=' + PAGE + '&page=' + (page || 1) + '&censored=false', success, failure)
    }

    function shikiDetails(id, success, failure) {
        shikiGet('/' + id, success, failure)
    }

    // ---------- TMDB ----------
    function tmdbUrl(path, params) {
        let base
        try { base = Lampa.TMDB.api(path) }
        catch (e) { base = 'https://api.themoviedb.org/3/' + path }
        return base + (base.indexOf('?') >= 0 ? '&' : '?') +
               'api_key=' + Lampa.Config.setting('tmdb_api_key') + '&language=' + lang() + '&' + params
    }

    function tmdbSearch(name, type, cb) {
        network.silent(tmdbUrl('search/' + type, 'query=' + encodeURIComponent(name)), function (res) {
            const arr = (res && res.results) ? res.results : []
            arr.forEach(function (r) { r.media_type = type }) // fix #3
            cb(arr)
        }, function () { cb([]) })
    }

    function tmdbForAnime(original, russian, callback) {
        const queries = []
        if (original) queries.push(original)
        if (russian && normalize(russian) !== normalize(original)) queries.push(russian)
        if (!queries.length) { callback([]); return }

        let qi = 0
        const all = []
        ;(function nextQuery() {
            if (qi >= queries.length) { finish(); return }
            const name = queries[qi++]
            tmdbSearch(name, 'tv', function (tv) {
                tmdbSearch(name, 'movie', function (mv) {
                    all.push.apply(all, tv.concat(mv))
                    nextQuery()
                })
            })
        })()

        function finish() {
            const seen = {}, uniq = []
            all.forEach(function (r) {
                const k = r.id + ':' + r.media_type
                if (!seen[k]) { seen[k] = 1; uniq.push(r) }
            })
            const norm = normalize(original)
            if (!norm) { callback(uniq); return } // fix #4: never match "everything" on an empty key
            const good = uniq.filter(function (r) {
                const o = normalize(r.original_title || r.original_name || '')
                const t = normalize(r.title || r.name || '')
                return o === norm || t === norm ||
                       (o && (o.indexOf(norm) >= 0 || norm.indexOf(o) >= 0)) ||
                       (t && (t.indexOf(norm) >= 0 || norm.indexOf(t) >= 0))
            })
            callback(good.length ? good : uniq.slice(0, 10))
        }
    }

    function gotoTmdbCard(movie) {
        Lampa.Activity.push({
            url: '',
            component: 'full',
            id: movie.id,
            method: movie.media_type === 'movie' ? 'movie' : 'tv',
            source: 'tmdb',
            page: 1
        })
    }

    function openTmdbResults(results, fallbackTitle) {
        const items = results.map(function (r) {
            const d = r.first_air_date || r.release_date || ''
            return {
                title: r.title || r.name || fallbackTitle || '?',
                subtitle: (r.original_title || r.original_name || '') + ' · ' + (d ? d.substr(0, 4) : '—') +
                          ' · ' + (r.media_type === 'movie' ? tr('shikimori_movie') : tr('shikimori_series')) +
                          ' · ' + tr('shikimori_rate') + ' ' + (r.vote_average || '?'),
                select: r
            }
        })
        if (!items.length) { Lampa.Noty.show(tr('shikimori_no_tmdb')); return }
        if (items.length === 1) { gotoTmdbCard(items[0].select); return }
        Lampa.Select.show({
            title: tr('shikimori_choose'),
            items: items,
            onSelect: function (item) { Lampa.Select.close(); gotoTmdbCard(item.select) },
            onBack: function () { Lampa.Controller.toggle('content') }
        })
    }

    // ---------- search list component ----------
    function ShikimoriSearchComponent(object) {
        const html = $('<div><div class="shiki-results"></div></div>') // fix #13: stable container
        let scroll = null, nav = null, page = 1, loadingMore = false
        const keyword = object.search || ''

        function appendItems(animes) {
            const body = $('<div>')
            animes.forEach(function (a) {
                const item = $(
                    '<div class="shiki-card selector">' +
                        '<div class="shiki-card__poster"><img src="' + posterOf(a) + '"></div>' +
                        '<div class="shiki-card__body">' +
                            '<div class="shiki-card__name">' + esc(isRu() && a.russian ? a.russian : a.name) + '</div>' +
                            '<div class="shiki-card__orig">' + esc(a.name) + '</div>' +
                            '<div class="shiki-card__meta">' + esc(kindTitle(a.kind)) + ' · ' +
                                esc(a.aired_on ? a.aired_on.substr(0, 4) : '—') + ' · ' +
                                '<span class="shiki-card__score">' + esc(a.score || '—') + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>')
                item.on('hover:enter', function () { pushDetails(a) })
                body.append(item)
            })
            if (animes.length >= PAGE) {
                const more = $('<div class="shiki-more selector">' + tr('shikimori_load_more') + '</div>') // fix #14
                more.on('hover:enter', loadMore)
                body.append(more)
            }
            return body
        }

        function setupController() {
            if (nav) nav.destroy()
            const collection = html.find('.selector')
            nav = new Lampa.Navigator({
                toggle: function () {
                    Lampa.Controller.collectionSet(collection)
                    Lampa.Controller.collectionFocus(collection.first())
                },
                keydown: function (key) {
                    if (!scroll) return
                    if (key === 'down') scroll.moveDown()
                    if (key === 'up') scroll.moveUp()
                }
            })
            Lampa.Controller.add('content', {
                link: nav,
                toggle: function () { nav.toggle('content') },
                up: function () { nav.transition('up') },
                down: function () { nav.transition('down') },
                left: function () { nav.transition('left') },
                right: function () { nav.transition('right') },
                back: function () { Lampa.Activity.back() }
            })
            Lampa.Controller.toggle('content')
        }

        function rebuildScroll(bodyContent) {
            if (scroll) scroll.destroy()
            scroll = new Lampa.Scroll({ mask: true, over: true })
            scroll.append(bodyContent)
            html.find('.shiki-results').empty().append(scroll.render())
            setupController()
        }

        function drawList(animes) {
            page = 1
            if (!animes || !animes.length) {
                html.find('.shiki-results').empty().append(
                    '<div style="padding:2em;text-align:center">' + tr('shikimori_empty') + '</div>')
                setupController()
                return
            }
            rebuildScroll(appendItems(animes))
        }

        function loadMore() {
            if (loadingMore || !keyword) return
            loadingMore = true
            shikiSearch(keyword, page + 1, function (animes) {
                loadingMore = false
                if (!animes || !animes.length) { Lampa.Noty.show(tr('shikimori_empty')); return }
                page++
                const items = appendItems(animes)
                const moreBtn = scroll.content.find('.shiki-more')
                if (moreBtn.length) moreBtn.before(items.children().detach())
                else scroll.content.append(items)
                Lampa.Controller.collectionSet(html.find('.selector'))
            }, function () {
                loadingMore = false
                Lampa.Noty.show(tr('shikimori_error'), { style: 'error' })
            })
        }

        function askKeyword() {
            Lampa.Input.edit({ title: tr('shikimori_input_title'), value: '', free: true, nosave: true, nomic: true },
                function (value) {
                    if (!value) return
                    Lampa.Activity.replace({ search: value }) // fix #7: replace() already re-creates the activity
                })
        }

        this.create = function () { return html }

        this.start = function () {
            if (!keyword) { askKeyword(); setupController(); return }
            shikiSearch(keyword, 1, drawList, function () {
                Lampa.Noty.show(tr('shikimori_error'), { style: 'error' })
                setupController()
            })
        }

        this.stop = function () {}
        this.destroy = function () {
            if (nav) nav.destroy()
            if (scroll) scroll.destroy()
            html.remove()
        }
        this.render = function () { return html }
    }

    // ---------- details component ----------
    function ShikimoriFullComponent(object) {
        const html = $('<div class="shiki-full-wrap"><div class="shiki-full"></div></div>')
        let loaded = false, anime = null, tmdbBusy = false, nav = null

        function setupController() {
            if (nav) nav.destroy()
            const collection = html.find('.selector')
            nav = new Lampa.Navigator({
                toggle: function () {
                    Lampa.Controller.collectionSet(collection)
                    Lampa.Controller.collectionFocus(collection.first())
                }
            })
            Lampa.Controller.add('content', {
                link: nav,
                toggle: function () { nav.toggle('content') },
                up: function () { Lampa.Controller.collectionPrev('up') },
                down: function () { Lampa.Controller.collectionNext('down') },
                left: function () { Lampa.Controller.collectionPrev('left') },
                right: function () { Lampa.Controller.collectionNext('right') },
                back: function () { Lampa.Activity.back() }
            })
            Lampa.Controller.toggle('content')
        }

        function renderDetails(a) {
            anime = a
            const facts = []
            if (a.kind) facts.push(kindTitle(a.kind))
            if (a.status) facts.push(statusTitle(a.status))
            if (a.episodes) facts.push((a.episodes > 1 ? a.episodes : '') + ' ' + tr('shikimori_episodes'))
            if (a.duration) facts.push(a.duration + ' ' + tr('shikimori_minutes'))
            if (a.score) facts.push(tr('shikimori_score') + ': ' + a.score)
            if (a.rating) facts.push(tr('shikimori_rate') + ': ' + a.rating)
            if (a.aired_on) facts.push(tr('shikimori_released') + ': ' + a.aired_on)
            if (a.studios && a.studios.length) facts.push(tr('shikimori_studios') + ': ' + a.studios.map(function (s) { return s.name }).join(', '))

            const genres = (a.genres || []).map(function (g) {
                return '<span>#' + esc(isRu() && g.russian ? g.russian : g.name) + '</span>'
            }).join(' ')

            const alt = [].concat(a.english || [], a.japanese || [], a.synonyms || []).filter(Boolean).map(esc).join(', ') || '—'

            let descr = a.description_ru || a.description || ''
            try { descr = JSON.parse(descr) } catch (e) { /* plain text */ }
            descr = cleanDescription(String(descr))

            html.find('.shiki-full').html(
                '<div><img class="shiki-full__img" src="' + posterOf(a) + '"></div>' +
                '<div class="shiki-full__info">' +
                    '<h1 class="shiki-full__title">' + esc(isRu() && a.russian ? a.russian : a.name) + '</h1>' +
                    '<h2 class="shiki-full__orig">' + esc(a.name) + '</h2>' +
                    '<div class="shiki-full__facts">' + facts.map(function (f) { return '<span>' + esc(f) + '</span>' }).join('') + '</div>' +
                    '<div class="shiki-full__genres">' + genres + '</div>' +
                    '<div class="shiki-full__descr">' + esc(descr) + '</div>' +
                    '<div class="shiki-full__alt">' + tr('shikimori_alt_names') + ': ' + alt + '</div>' +
                    (a.url ? '<a href="' + HOSTS[hostIdx] + a.url + '" target="_blank" style="color:#4ea7ff;display:block;margin-bottom:0.5em">' + tr('shikimori_page_shiki') + '</a>' : '') +
                    '<div class="full-start__button selector shiki-tmdb-btn"><div>' + tr('shikimori_tmdb') + '</div></div>' +
                '</div>')

            html.find('.shiki-tmdb-btn').on('hover:enter', function () {
                if (tmdbBusy || !anime) return
                tmdbBusy = true // debounce
                Lampa.Loading.start()
                tmdbForAnime(anime.name, anime.russian, function (results) {
                    Lampa.Loading.stop()
                    tmdbBusy = false
                    openTmdbResults(results, anime.russian || anime.name)
                })
            })

            setupController()
        }

        this.create = function () { return html }
        this.start = function () {
            if (loaded) { setupController(); return }
            loaded = true
            shikiDetails(object.anime_id, renderDetails, function () {
                Lampa.Noty.show(tr('shikimori_error'), { style: 'error' })
            })
        }
        this.stop = function () {}
        this.destroy = function () { if (nav) nav.destroy(); html.remove() }
        this.render = function () { return html }
    }

    function pushDetails(a) {
        Lampa.Activity.push({
            url: '',
            title: a.russian || a.name,
            component: 'shikimori_full',
            anime_id: a.id,
            page: 1
        })
    }

    // ---------- open from a foreign card (context menu / full button) ----------
    function openShikimoriForCard(card) {
        const queries = [card.original_title, card.original_name, card.title, card.name].filter(Boolean)
        if (!queries.length) { Lampa.Noty.show(tr('shikimori_empty')); return }

        ;(function tryNext(i) {
            if (i >= queries.length) { Lampa.Noty.show(tr('shikimori_empty')); return }
            shikiSearch(queries[i], 1, function (animes) {
                if (!animes || !animes.length) return tryNext(i + 1)
                if (animes.length === 1) return pushDetails(animes[0])
                Lampa.Select.show({
                    title: tr('shikimori_choose'),
                    items: animes.map(function (a) {
                        return {
                            title: a.russian || a.name,
                            subtitle: kindTitle(a.kind) + ' · ' + (a.aired_on ? a.aired_on.substr(0, 4) : '—') + ' · ' + (a.score || '—'),
                            anime: a
                        }
                    }),
                    onSelect: function (item) { Lampa.Select.close(); pushDetails(item.anime) },
                    onBack: function () { Lampa.Controller.toggle('content') }
                })
            }, function () { tryNext(i + 1) })
        })(0)
    }

    // ---------- menu item (re-appended on menu render, fix #10) ----------
    function addMenuItem() {
        const icon = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 10l1 2-1 2M16 10l-1 2 1 2M12 8v8"/></svg>'
        function tryAppend() {
            const list = $('.menu .menu__list').eq(0)
            if (!list.length || list.find('.shikimori-menu-item').length) return
            const btn = $('<li class="menu__item selector shikimori-menu-item"><div class="menu__ico">' + icon +
                          '</div><div class="menu__text">' + tr('shikimori') + '</div></li>')
            btn.on('hover:enter', function () {
                Lampa.Activity.push({ url: '', title: tr('shikimori'), component: 'shikimori_search', search: '', page: 1 })
            })
            list.append(btn)
        }
        tryAppend()
        Lampa.Listener.follow('menu', tryAppend)
        setTimeout(tryAppend, 1000)
        setTimeout(tryAppend, 3000)
    }

    // ---------- settings ----------
    function addSettings() {
        Lampa.SettingsApi.addComponent({ component: 'shikimori', name: 'Shikimori' })
        Lampa.SettingsApi.addParam({
            component: 'shikimori',
            param: { name: 'shikimori_context', type: 'trigger', default: true },
            field: { name: tr('shikimori_context_menu') }
        })
        Lampa.SettingsApi.addParam({
            component: 'shikimori',
            param: { name: 'shikimori_button', type: 'trigger', default: false },
            field: { name: tr('shikimori_full_button') }
        })
    }

    // ---------- init ----------
    function init() {
        injectCss()
        Lampa.Component.add('shikimori_search', ShikimoriSearchComponent)
        Lampa.Component.add('shikimori_full', ShikimoriFullComponent)
        addMenuItem()
        addSettings()

        // Official plugin registration — Manifest.plugins has a PUSH setter,
        // so this does NOT overwrite other plugins (fix #5)
        Lampa.Manifest.plugins = {
            name: tr('shikimori_on_shiki'),
            type: 'video',
            onContextMenu: function () { return true },
            onContextLauch: function (card) { openShikimoriForCard(card) }
        }

        // Optional button inside TMDB full card (fix #9: collectionAppend)
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite' || !Lampa.Storage.field('shikimori_button')) return
            const movie = e.data.movie
            const btn = $('<div class="full-start__button selector"><div>' + tr('shikimori_on_shiki') + '</div></div>')
            btn.on('hover:enter', function () { openShikimoriForCard(movie) })
            const box = e.object.activity.render().find('.full-start-new__buttons,.full-start__buttons').first()
            if (box.length) { box.append(btn); Lampa.Controller.collectionAppend(btn) }
        })
    }

    if (window.appready) init()
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') init() })
})()
