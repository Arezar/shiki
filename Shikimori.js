/**
 * Lampa plugin: Shikimori (https://shikimori.one) anime catalog & info
 * - Menu section with showcase tabs (Airing, Popular, Top, Upcoming) & title search
 * - Infinite scroll + "Load more" pagination without duplicate controls
 * - Scrollable full card: high-res poster, rating, genres, studios, clean description,
 *   YouTube trailers, screenshots, franchise chronology (related) & similar anime
 * - Smart TMDB lookup (original / English / Russian titles, season-suffix fallback,
 *   Animation/JP/year scoring)
 * - Card context-menu entry & optional full-card button with SVG icon
 * - Optimized for modern Smart TV browsers, targeting current LG webOS
 */
(function () {
    'use strict'

    if (typeof window === 'undefined' || window.shikimori_plugin_ready) return
    window.shikimori_plugin_ready = true

    var HOSTS = ['https://shikimori.one', 'https://shikimori.io']
    var VERSION = '1.5.7'
    var PAGE = 20
    var CACHE_TTL = 15 * 60 * 1000
    var CACHE_MAX = 80
    var hostIdx = 0

    var ICON_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/><path d="M8 10l1.5 2L8 14M16 10l-1.5 2 1.5 2M12 8v8"/></svg>'
    var SEARCH_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
    var PLAY_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z"/></svg>'
    var TMDB_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M7 9h4M9 9v6M14 9h3a2 2 0 0 1 0 4h-3V9z"/></svg>'

    var PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 150"><rect width="100" height="150" fill="#24262f"/><circle cx="50" cy="75" r="18" fill="none" stroke="#3a3f4e" stroke-width="3"/></svg>'
    )

    // Modern WebView target (LG webOS): use full Unicode letter/number support.
    var UNICODE_NORM_RE = /[^\p{L}\p{N}]+/gu;

    // ---------- in-memory TTL cache ----------
    var cacheStore = {}
    var cacheKeys = []

    function cacheGet(key) {
        var entry = cacheStore[key]
        if (!entry) return undefined
        if (Date.now() - entry.ts > CACHE_TTL) {
            delete cacheStore[key]
            var idx = cacheKeys.indexOf(key)
            if (idx >= 0) cacheKeys.splice(idx, 1)
            return undefined
        }
        return entry.val
    }

    function cacheSet(key, val) {
        if (!Object.prototype.hasOwnProperty.call(cacheStore, key)) {
            if (cacheKeys.length >= CACHE_MAX) {
                var oldest = cacheKeys.shift()
                if (oldest !== undefined) delete cacheStore[oldest]
            }
            cacheKeys.push(key)
        }
        cacheStore[key] = { val: val, ts: Date.now() }
    }

    // ---------- localization ----------
    var STRINGS = {
        shikimori:            { ru: 'Аниме (Shikimori)', en: 'Anime (Shikimori)', uk: 'Аніме (Shikimori)' },
        shikimori_on_shiki:   { ru: 'Информация на Shikimori', en: 'Info on Shikimori', uk: 'Інформація на Shikimori' },
        shikimori_btn_short:  { ru: 'Shikimori', en: 'Shikimori', uk: 'Shikimori' },
        shikimori_input_title:{ ru: 'Название аниме', en: 'Anime title', uk: 'Назва аніме' },
        shikimori_search_btn: { ru: 'Поиск', en: 'Search', uk: 'Пошук' },
        shikimori_tab_ongoing:{ ru: 'Онгоинги', en: 'Airing', uk: 'Онгоїнги' },
        shikimori_tab_popular:{ ru: 'Популярное', en: 'Popular', uk: 'Популярне' },
        shikimori_tab_top:    { ru: 'Топ рейтинга', en: 'Top rated', uk: 'Топ рейтингу' },
        shikimori_tab_anons:  { ru: 'Анонсы', en: 'Upcoming', uk: 'Анонси' },
        shikimori_tmdb:       { ru: 'Открыть в Lampa', en: 'Open in Lampa', uk: 'Відкрити в Lampa' },
        shikimori_trailer:    { ru: 'Трейлер', en: 'Trailer', uk: 'Трейлер' },
        shikimori_no_tmdb:    { ru: 'На TMDB ничего не найдено', en: 'Nothing found on TMDB', uk: 'На TMDB нічого не знайдено' },
        shikimori_empty:      { ru: 'Ничего не найдено', en: 'Nothing found', uk: 'Нічого не знайдено' },
        shikimori_no_descr:   { ru: 'Описание отсутствует', en: 'No description available', uk: 'Опис відсутній' },
        shikimori_error:      { ru: 'Ошибка загрузки Shikimori', en: 'Shikimori load error', uk: 'Помилка завантаження Shikimori' },
        shikimori_retry:      { ru: 'Повторить', en: 'Retry', uk: 'Повторити' },
        shikimori_choose:     { ru: 'Выберите результат', en: 'Choose a result', uk: 'Оберіть результат' },
        shikimori_load_more:  { ru: 'Загрузить ещё', en: 'Load more', uk: 'Завантажити ще' },
        shikimori_related:    { ru: 'Связанное (франшиза)', en: 'Related (franchise)', uk: 'Пов’язане (франшиза)' },
        shikimori_similar:    { ru: 'Похожее аниме', en: 'Similar anime', uk: 'Схоже аніме' },
        shikimori_screenshots:{ ru: 'Кадры', en: 'Screenshots', uk: 'Кадри' },
        shikimori_movie:      { ru: 'Фильм', en: 'Movie', uk: 'Фільм' },
        shikimori_series:     { ru: 'Сериал', en: 'Series', uk: 'Серіал' },
        shikimori_episodes:   { ru: 'эп.', en: 'ep.', uk: 'еп.' },
        shikimori_minutes:    { ru: 'мин.', en: 'min', uk: 'хв.' },
        shikimori_score:      { ru: 'Оценка', en: 'Score', uk: 'Оцінка' },
        shikimori_rate:       { ru: 'Рейтинг', en: 'Rating', uk: 'Рейтинг' },
        shikimori_released:   { ru: 'Вышел', en: 'Released', uk: 'Вийшов' },
        shikimori_studios:    { ru: 'Студия', en: 'Studio', uk: 'Студія' },
        shikimori_alt_names:  { ru: 'Альтернативные названия', en: 'Alternative names', uk: 'Альтернативні назви' },
        shikimori_anons:      { ru: 'Анонс', en: 'Upcoming', uk: 'Анонс' },
        shikimori_ongoing:    { ru: 'Онгоинг', en: 'Airing', uk: 'Онгоїнг' },
        shikimori_released_s: { ru: 'Вышло', en: 'Released', uk: 'Вийшло' },
        shikimori_cancelled:  { ru: 'Отменён', en: 'Cancelled', uk: 'Скасовано' },
        shikimori_paused:     { ru: 'Приостановлен', en: 'Paused', uk: 'Призупинено' },
        shikimori_context_menu: { ru: 'Пункт в контекстном меню карточки', en: 'Entry in card context menu', uk: 'Пункт у контекстному меню картки' },
        shikimori_full_button:  { ru: 'Кнопка Shikimori в карточке фильма', en: 'Shikimori button in movie card', uk: 'Кнопка Shikimori у картці фільму' },
        shikimori_anime_only:   { ru: 'Кнопка только для аниме и мультфильмов', en: 'Button only for anime & animation', uk: 'Кнопка лише для аніме та мультфільмів' },
        shikimori_host_label:   { ru: 'Зеркало Shikimori', en: 'Shikimori mirror', uk: 'Дзеркало Shikimori' },
        shikimori_host_auto:    { ru: 'Автоматически', en: 'Automatic', uk: 'Автоматично' },
        shikimori_adult:         { ru: 'Показывать аниме 18+', en: 'Include adult anime (18+)', uk: 'Показувати аніме 18+' },
        shikimori_more:         { ru: 'ещё', en: 'more', uk: 'ще' },
        shikimori_filters:      { ru: 'Фильтры', en: 'Filters', uk: 'Фільтри' },
        shikimori_filter_kind:  { ru: 'Тип', en: 'Type', uk: 'Тип' },
        shikimori_filter_status:{ ru: 'Статус', en: 'Status', uk: 'Статус' },
        shikimori_filter_year:  { ru: 'Год / сезон', en: 'Year / season', uk: 'Рік / сезон' },
        shikimori_filter_genre: { ru: 'Жанр', en: 'Genre', uk: 'Жанр' },
        shikimori_filter_score: { ru: 'Минимальная оценка', en: 'Minimum score', uk: 'Мінімальна оцінка' },
        shikimori_filter_duration:{ ru: 'Длительность', en: 'Duration', uk: 'Тривалість' },
        shikimori_filter_rating:{ ru: 'Возрастной рейтинг', en: 'Age rating', uk: 'Віковий рейтинг' },
        shikimori_filter_order: { ru: 'Сортировка', en: 'Sort by', uk: 'Сортування' },
        shikimori_filter_clear: { ru: 'Сбросить фильтры', en: 'Clear filters', uk: 'Скинути фільтри' },
        shikimori_filter_any:   { ru: 'Любой', en: 'Any', uk: 'Будь-який' },
        shikimori_filter_active:{ ru: 'Активно', en: 'Active', uk: 'Активно' }
    }

    function lang() {
        return (typeof Lampa !== 'undefined' && Lampa.Lang && Lampa.Lang.get) ? Lampa.Lang.get() : 'ru'
    }

    function tr(key) {
        if (typeof Lampa !== 'undefined' && Lampa.Lang && Lampa.Lang.translate) {
            return Lampa.Lang.translate(key)
        }
        var entry = STRINGS[key]
        if (!entry) return key
        return entry[lang()] || entry.ru || key
    }

    function isRu() {
        var l = lang()
        return l === 'ru' || l === 'uk' || l === 'be'
    }

    // ---------- pure utils ----------
    var ESC_MAP = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }

    function esc(str) {
        if (str === null || str === undefined) return ''
        return String(str).replace(/[&<>"']/g, function (ch) { return ESC_MAP[ch] })
    }

    function cleanDescription(text) {
        if (!text) return ''
        var s = String(text)
        // Strip [spoiler]...[/spoiler] blocks completely so plot twists are not leaked
        var prev
        do {
            prev = s
            s = s.replace(/\[\s*spoiler(?:=[^\]]*)?\][\s\S]*?\[\/\s*spoiler\s*\]/gi, '')
        } while (s !== prev)
        // Remove remaining BBCode tags while preserving inner readable text
        s = s.replace(/\[\/?[a-z_]+(?:=[^\]]*)?\]/gi, '')
        s = s.replace(/\[[^\]]*\]/g, '')
        s = s.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ')
        s = s.replace(/\n{3,}/g, '\n\n')
        return s.trim()
    }

    var KIND = {
        tv: 'TV',
        tv_13: 'TV · 13',
        tv_24: 'TV · 24',
        tv_48: 'TV · 48',
        tv_special: 'TV Special',
        special: 'Special',
        movie: 'Movie',
        ova: 'OVA',
        ona: 'ONA',
        music: 'Music',
        pv: 'PV',
        cm: 'CM',
        tv_ova: 'OVA'
    }

    function kindTitle(kind) {
        return KIND[kind] || kind || '?'
    }

    function statusTitle(s) {
        var map = {
            anons: tr('shikimori_anons'),
            ongoing: tr('shikimori_ongoing'),
            released: tr('shikimori_released_s'),
            cancelled: tr('shikimori_cancelled'),
            paused: tr('shikimori_paused')
        }
        return map[s] || s || ''
    }

    function genreTitle(id) {
        var ru = ['','Экшен','Приключения','Машины','Комедия','Безумие','Демоны','Детектив','Драма','Этти','Фэнтези','Игры','','Исторический','Ужасы','Детское','Магия','Боевые искусства','Меха','Музыка','Пародия','Самураи','Романтика','Школа','Фантастика','Сёдзё','Сёдзё-ай','Сёнэн','Сёнэн-ай','Космос','Спорт','Сверхспособности','Вампиры','Гарем','Повседневность','Сверхъестественное','Военное','Полиция','Психологическое','Триллер','Сэйнэн','Дзёсэй']
        var en = ['','Action','Adventure','Cars','Comedy','Dementia','Demons','Mystery','Drama','Ecchi','Fantasy','Game','','Historical','Horror','Kids','Magic','Martial Arts','Mecha','Music','Parody','Samurai','Romance','School','Sci-Fi','Shoujo','Shoujo Ai','Shounen','Shounen Ai','Space','Sports','Super Power','Vampire','Harem','Slice of Life','Supernatural','Military','Police','Psychological','Thriller','Seinen','Josei']
        var n = parseInt(id, 10)
        return (isRu() ? ru[n] : en[n]) || String(id)
    }

    function seasonTitle(value) {
        var match = /^(winter|spring|summer|fall)_(\d{4})$/.exec(String(value || ''))
        if (!match) return String(value || '')
        var names = isRu() ? { winter: 'Зима', spring: 'Весна', summer: 'Лето', fall: 'Осень' } : { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' }
        return names[match[1]] + ' ' + match[2]
    }

    function durationTitle(value) {
        var map = {
            S: '< 10 ' + tr('shikimori_minutes'),
            D: '< 30 ' + tr('shikimori_minutes'),
            F: '30+ ' + tr('shikimori_minutes')
        }
        return map[value] || value
    }

    function orderTitle(value) {
        var map = {
            popularity: isRu() ? 'Популярность' : 'Popularity',
            ranked: isRu() ? 'Рейтинг' : 'Ranked',
            ranked_shiki: isRu() ? 'Рейтинг Shikimori' : 'Shikimori ranking',
            aired_on: isRu() ? 'Дата выхода' : 'Release date',
            name: isRu() ? 'Название' : 'Name A–Z',
            episodes: isRu() ? 'Количество серий' : 'Episode count',
            status: isRu() ? 'Статус выхода' : 'Release status'
        }
        return map[value] || value
    }

    function formatScore(score) {
        var n = parseFloat(score)
        if (!n || isNaN(n) || n <= 0) return ''
        return String(score)
    }

    var RATING_MAP = {
        g: 'G',
        pg: 'PG',
        pg_13: 'PG-13',
        r: 'R-17',
        r_plus: 'R+',
        rx: 'Rx'
    }

    function formatRating(rating) {
        if (!rating || rating === 'none') return ''
        return RATING_MAP[rating] || String(rating).toUpperCase()
    }

    function formatEpisodes(a) {
        if (!a) return ''
        var total = parseInt(a.episodes, 10) || 0
        var aired = parseInt(a.episodes_aired, 10) || 0
        var unit = tr('shikimori_episodes')
        if (a.status === 'ongoing' || (total === 0 && aired > 0)) {
            if (aired > 0 && total > 0) return aired + ' / ' + total + ' ' + unit
            if (aired > 0) return aired + ' / ? ' + unit
        }
        if (total > 0) return total + ' ' + unit
        return ''
    }

    function activeHost() {
        if (typeof Lampa !== 'undefined' && Lampa.Storage && Lampa.Storage.field) {
            var pref = Lampa.Storage.field('shikimori_host')
            if (pref && pref !== 'auto' && HOSTS.indexOf(pref) >= 0) return pref
        }
        return HOSTS[hostIdx] || HOSTS[0]
    }

    function resolveImageUrl(rawPath) {
        if (!rawPath || typeof rawPath !== 'string') return PLACEHOLDER
        var p = rawPath.trim()
        if (!p) return PLACEHOLDER
        if (p.indexOf('https://') === 0 || p.indexOf('http://') === 0) return p
        if (p.indexOf('//') === 0) return 'https:' + p
        if (p.charAt(0) === '/') return activeHost() + p
        return PLACEHOLDER
    }

    function posterCandidates(a, highRes) {
        if (!a) return []
        var paths = []
        function add(path) {
            if (path && typeof path === 'string' && paths.indexOf(path) < 0) paths.push(path)
        }
        if (a.poster) {
            if (highRes) { add(a.poster.originalUrl); add(a.poster.mainUrl) }
            else { add(a.poster.mainUrl); add(a.poster.originalUrl) }
        }
        if (a.image) {
            if (highRes) { add(a.image.original); add(a.image.preview) }
            else { add(a.image.preview); add(a.image.original) }
            add(a.image.x96)
            add(a.image.x48)
        }
        var urls = []
        function push(url) {
            if (!url || url === PLACEHOLDER) return
            if (urls.indexOf(url) < 0) urls.push(url)
            // CDN subdomains such as desu.shikimori.one may have a matching .io host.
            var hostMarker = '.shikimori.one'
            var markerAt = url.indexOf(hostMarker)
            if (markerAt >= 0) {
                var mirror = url.substring(0, markerAt) + '.shikimori.io' + url.substring(markerAt + hostMarker.length)
                if (urls.indexOf(mirror) < 0) urls.push(mirror)
            }
        }
        paths.forEach(function (path) {
            var p = String(path).trim()
            if (!p) return
            if (p.indexOf('//') === 0) {
                push('https:' + p)
                var protocolPath = p.substr(2)
                for (var pi = 0; pi < HOSTS.length; pi++) {
                    var hostName = HOSTS[pi].replace('https://', '').replace('http://', '')
                    if (protocolPath.indexOf(hostName + '/') === 0) {
                        for (var pj = 0; pj < HOSTS.length; pj++) {
                            if (pi !== pj) push(HOSTS[pj] + protocolPath.substr(hostName.length))
                        }
                    }
                }
                return
            }
            if (p.indexOf('https://') === 0 || p.indexOf('http://') === 0) {
                push(p)
                for (var hi = 0; hi < HOSTS.length; hi++) {
                    for (var hj = 0; hj < HOSTS.length; hj++) {
                        if (hi !== hj && p.indexOf(HOSTS[hi] + '/') === 0) push(HOSTS[hj] + p.substr(HOSTS[hi].length))
                    }
                }
                return
            }
            if (p.charAt(0) !== '/') p = '/' + p
            push(activeHost() + p)
            for (var h = 0; h < HOSTS.length; h++) push(HOSTS[h] + p)
        })
        return urls
    }

    function posterOf(a, highRes) {
        var candidates = posterCandidates(a, highRes)
        return candidates.length ? candidates[0] : PLACEHOLDER
    }

    function bindImgFallback(container, anime, posterSelector, highRes) {
        container.find('img').each(function () {
            var img = this
            if (anime && (!posterSelector || $(img).is(posterSelector))) {
                img._shikiPosterCandidates = posterCandidates(anime, !!highRes)
                img._shikiPosterIndex = 0
            }
            $(img).on('error', function () {
                if (this._shikiPosterCandidates && this._shikiPosterIndex + 1 < this._shikiPosterCandidates.length) {
                    this._shikiPosterIndex++
                    this.src = this._shikiPosterCandidates[this._shikiPosterIndex]
                    return
                }
                if (this._shikiFallback) return
                this._shikiFallback = 1
                this.src = PLACEHOLDER
            })
            // On fast/cached failures the image can finish before the handler is attached.
            // Replay that already-fired failure so the alternate poster URL is still tried.
            if (img.complete && typeof img.naturalWidth === 'number' && img.naturalWidth === 0) {
                $(img).triggerHandler('error')
            }
        })
    }

    function normalize(s) {
        return String(s || '').toLowerCase().replace(UNICODE_NORM_RE, ' ').trim()
    }

    function stripSeasonSuffix(title) {
        if (!title) return ''
        var s = String(title).trim()
        // Remove explicit season/part/cour markers
        s = s.replace(/\s*(?::|-|–|—)?\s*(?:the\s+)?(?:final\s+season|(?:\d+(?:st|nd|rd|th)\s+season)|(?:season\s*\d+)|(?:part\s*\d+)|(?:cour\s*\d+)|(?:\d+\s*сезон)|(?:сезон\s*\d+)|(?:часть\s*\d+)|(?:финал))$/i, '')
        // Remove trailing Roman numerals II..VIII when preceded by space
        s = s.replace(/\s+(?:II|III|IV|V|VI|VII|VIII)$/, '')
        return s.trim()
    }

    function dedupeQueries(list) {
        var seen = {}
        var out = []
        if (!Array.isArray(list)) return out
        for (var i = 0; i < list.length; i++) {
            var raw = list[i]
            if (!raw || typeof raw !== 'string') continue
            var trimmed = raw.trim()
            if (!trimmed) continue
            var key = normalize(trimmed) || trimmed.toLowerCase()
            if (!seen[key]) {
                seen[key] = 1
                out.push(trimmed)
            }
        }
        return out
    }

    function extractYoutubeId(url) {
        if (!url || typeof url !== 'string') return ''
        var m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/)
        return m ? m[1] : ''
    }

    function extractTrailers(videos) {
        if (!Array.isArray(videos)) return []
        var seen = {}
        var out = []
        for (var i = 0; i < videos.length; i++) {
            var v = videos[i]
            if (!v) continue
            var id = extractYoutubeId(v.url) || extractYoutubeId(v.player_url)
            if (id && !seen[id]) {
                seen[id] = 1
                out.push({
                    id: id,
                    title: v.name || tr('shikimori_trailer'),
                    subtitle: (v.kind ? String(v.kind).toUpperCase() : 'YouTube'),
                    url: 'https://www.youtube.com/watch?v=' + id,
                    youtube: true
                })
            }
        }
        return out
    }

    function isCardLikelyAnime(card) {
        if (!card || typeof card !== 'object') return false
        var hasMetadata = false

        if (typeof card.original_language === 'string' && card.original_language) {
            hasMetadata = true
            if (card.original_language.toLowerCase() === 'ja') return true
        }

        if (Array.isArray(card.origin_country) && card.origin_country.length) {
            hasMetadata = true
            if (card.origin_country.indexOf('JP') >= 0) return true
        }

        if (Array.isArray(card.production_countries) && card.production_countries.length) {
            hasMetadata = true
            for (var c = 0; c < card.production_countries.length; c++) {
                var pc = card.production_countries[c]
                if (pc && (pc.iso_3166_1 === 'JP' || /japan|япони/i.test(pc.name || ''))) return true
            }
        }

        if (Array.isArray(card.genre_ids) && card.genre_ids.length) {
            hasMetadata = true
            if (card.genre_ids.indexOf(16) >= 0) return true
        }

        if (Array.isArray(card.genres) && card.genres.length) {
            hasMetadata = true
            for (var g = 0; g < card.genres.length; g++) {
                var genre = card.genres[g]
                if (!genre) continue
                if (genre.id === 16) return true
                if (typeof genre === 'string' && /anime|аниме|аніме|animation|мультфильм|мультфільм/i.test(genre)) return true
                if (genre.name && /anime|аниме|аніме|animation|мультфильм|мультфільм/i.test(genre.name)) return true
            }
        }

        // If card object has no genre/language/country fields at all, allow by default
        return !hasMetadata
    }

    // ---------- styles ----------
    var cssInjected = false
    function injectCss() {
        if (cssInjected) return
        cssInjected = true
        var css = [
            '.shiki-search-wrap,.shiki-full-wrap{width:100%;height:100%;min-height:0;box-sizing:border-box}',
            '.shiki-full-wrap{height:100%;min-height:0;overflow:hidden;position:relative}',
            '.shiki-full-wrap>.scroll{height:100%;max-height:100%;min-height:0;overflow:hidden}',
            '.shiki-search-wrap .scroll,.shiki-full-wrap .scroll{width:100%;max-width:100%;box-sizing:border-box}',
            '.shiki-search-wrap .scroll__content,.shiki-full-wrap .scroll__content{width:100%;max-width:100%;box-sizing:border-box;padding-left:2em;padding-right:2em}',
            '.shiki-toolbar{display:block;width:100%;max-width:100%;box-sizing:border-box;padding:.45em 0 1.1em}',
            '.shiki-toolbar__tools,.shiki-toolbar__tabs{display:flex;flex-flow:row wrap;align-items:stretch;width:100%;max-width:100%;box-sizing:border-box}',
            '.shiki-toolbar__tools{margin-bottom:.35em}',
            '.shiki-toolbar .shiki-tab{display:flex;align-items:center;box-sizing:border-box;min-width:0;max-width:100%;min-height:2.8em;padding:.35em 1.05em;margin:0 .5em .5em 0;background:rgba(255,255,255,.055);border:0;border-radius:1em;color:rgba(255,255,255,.88);font-size:1.02em;line-height:1.2;cursor:pointer}',
            '.shiki-toolbar__tools .shiki-tab--search{flex:1 1 18em;justify-content:flex-start;text-align:left}',
            '.shiki-toolbar__tools .shiki-tab--filter{flex:0 0 auto;justify-content:center;min-width:8em}',
            '.shiki-toolbar__tabs .shiki-tab--section{flex:1 1 9em;justify-content:center;text-align:center}',
            '.shiki-toolbar .shiki-tab>svg{display:block;width:1.25em!important;height:1.25em!important;min-width:1.25em;max-width:1.25em;flex:0 0 1.25em;margin:0 .7em 0 0}',
            '.shiki-toolbar .shiki-tab>span{display:block;min-width:0;max-width:100%;white-space:normal;overflow-wrap:break-word;word-wrap:break-word}',
            '.shiki-toolbar__tools .shiki-tab--search>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.shiki-toolbar .shiki-tab--active{background:rgba(255,255,255,.13);box-shadow:inset 0 -.16em 0 #efbd70;color:#fff}',
            '.shiki-toolbar .shiki-tab.selector--focus,.shiki-toolbar .shiki-tab.focus{background:#fff!important;box-shadow:none!important;color:#111!important;outline:none!important}',
            '.shiki-filter-summary{box-sizing:border-box;width:100%;padding:.15em .15em .4em;color:rgba(255,255,255,.58);font-size:.8em;line-height:1.45;white-space:normal;overflow-wrap:break-word;word-wrap:break-word}',
            '.shiki-list{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.8em;width:100%;max-width:100%;box-sizing:border-box;align-items:stretch}',
            '.shikimori-full-rating{display:flex;align-items:center;gap:.55em;margin-top:.65em;color:rgba(255,255,255,.68);font-size:.95em;line-height:1.4}',
            '.shikimori-full-rating span{color:#f2c477;font-weight:700}',
            '.shikimori-card-rating{position:absolute;left:.45em;bottom:.45em;z-index:5;display:block;padding:.2em .42em;border-radius:.22em;background:rgba(20,23,30,.92);color:#f2c477;font-size:.72em;font-weight:700;line-height:1.25;white-space:nowrap;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.35)}',
            '.shiki-card{display:flex;flex-direction:column;align-items:stretch;min-width:0;width:auto;max-width:none;box-sizing:border-box;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:.3em;margin:0;padding:.55em;cursor:pointer}',
            '.shiki-card.selector--focus,.shiki-card.focus{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.8);box-shadow:inset 0 0 0 1px rgba(255,255,255,.72);outline:none}',
            '.shiki-card__poster{display:block;width:100%;flex:0 0 auto}',
            '.shiki-card__poster img{display:block;width:100%;height:auto;aspect-ratio:2/3;max-width:100%;object-fit:contain;border-radius:.22em;background:rgba(255,255,255,.07)}',
            '.shiki-card__body{display:block;flex:1 1 auto;width:100%;min-width:0;box-sizing:border-box;padding:.55em .2em .25em;overflow:hidden}',
            '.shiki-card__name{display:block;max-width:100%;font-size:1.02em;font-weight:600;line-height:1.25;white-space:normal;overflow-wrap:break-word;word-wrap:break-word;word-break:normal}',
            '.shiki-card__orig{max-width:100%;color:rgba(255,255,255,.55);margin:.25em 0 0;font-size:.78em;line-height:1.3;white-space:normal;overflow-wrap:break-word;word-wrap:break-word}',
            '.shiki-card__meta{display:block;max-width:100%;margin-top:.35em;color:rgba(255,255,255,.68);font-size:.86em;line-height:1.55;white-space:normal;overflow-wrap:break-word;word-wrap:break-word}',
            '.shiki-card__meta-item{display:inline}',
            '.shiki-card__meta-item+.shiki-card__meta-item:before{content:"·";display:inline-block;margin:0 .55em;color:rgba(255,255,255,.38)}',
            '.shiki-card__kind{display:inline-block;padding:.05em .42em;border-radius:.22em;background:rgba(255,255,255,.12);color:rgba(255,255,255,.9);font-size:.88em;line-height:1.45}',
            '.shiki-card__score{color:#f0c477;font-weight:700;white-space:nowrap}',
            '.shiki-empty{padding:2.5em 1em;text-align:center;color:rgba(255,255,255,.65);font-size:1em}',
            '.shiki-more,.shiki-retry{grid-column:1/-1;display:block;box-sizing:border-box;width:100%;background:rgba(255,255,255,.055);color:rgba(255,255,255,.88);padding:.9em 1.2em;text-align:center;border:0;border-radius:1em;margin:.2em 0 .6em;cursor:pointer;font-weight:600}',
            '.shiki-more.selector--focus,.shiki-more.focus,.shiki-retry.selector--focus,.shiki-retry.focus{background:#fff;color:#111;outline:none}',
            '.shiki-full{display:flex;width:100%;max-width:100%;box-sizing:border-box;padding:1.1em .2em 2em;align-items:flex-start}',
            '.shiki-full__poster{flex:0 0 auto;margin-right:1.5em}',
            '.shiki-full__img{width:14em;height:20em;max-width:30vw;object-fit:cover;border-radius:.3em;display:block;background:rgba(255,255,255,.06)}',
            '.shiki-full__info{flex:1;min-width:0;max-width:none}',
            '.shiki-full__title{font-size:1.8em;margin:0 0 .15em;line-height:1.2;overflow-wrap:break-word;word-wrap:break-word}',
            '.shiki-full__orig{font-size:1.05em;color:rgba(255,255,255,.55);margin:0 0 .7em;font-weight:normal}',
            '.shiki-full__facts{margin-bottom:.6em;line-height:1.7}',
            '.shiki-full__facts span{display:inline-block;background:rgba(255,255,255,.07);border-radius:.2em;padding:.2em .55em;margin:.15em .35em .15em 0;font-size:.9em}',
            '.shiki-full__genres{margin-bottom:.8em}',
            '.shiki-full__genres span{display:inline-block;color:rgba(255,255,255,.68);margin-right:.65em;font-size:.92em}',
            '.shiki-full__actions{display:flex;flex-wrap:wrap;align-items:center;margin:.9em 0 1.1em}',
            '.shiki-full__actions>*{margin:0 .7em .7em 0}',
            '.shiki-full__actions .full-start__button{display:inline-flex;align-items:center}',
            '.shiki-full__actions .full-start__button>svg{margin-right:.5em;flex-shrink:0}',
            '.shiki-full__descr{margin:.9em 0;line-height:1.55;white-space:pre-line;color:rgba(255,255,255,.86)}',
            '.shiki-full__alt{color:rgba(255,255,255,.52);font-size:.88em;margin-bottom:1.1em;line-height:1.4;overflow-wrap:break-word;word-wrap:break-word}',
            '.shiki-section{margin-top:1.4em;width:100%;box-sizing:border-box}',
            '.shiki-section__title{font-size:1.15em;font-weight:600;margin-bottom:.6em;color:#fff}',
            '.shiki-shots{display:flex;flex-wrap:wrap}',
            '.shiki-shots img{width:11em;height:6.2em;max-width:42vw;object-fit:cover;border-radius:.25em;background:rgba(255,255,255,.06);margin:0 .6em .6em 0}',
            '.shiki-sublist{display:flex;flex-wrap:wrap;width:100%;box-sizing:border-box}',
            '.shiki-subcard{flex:0 0 calc(50% - .45em);min-width:0;display:flex;box-sizing:border-box;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:.25em;padding:.5em;align-items:center;cursor:pointer;margin:0 .45em .55em 0}',
            '.shiki-subcard--more{cursor:pointer;background:rgba(255,255,255,.06)!important;opacity:1}',
            '.shiki-subcard.selector--focus,.shiki-subcard.focus{background:#fff;color:#111;border-color:#fff;outline:none}',
            '.shiki-subcard.selector--focus .shiki-subcard__sub,.shiki-subcard.focus .shiki-subcard__sub{color:rgba(0,0,0,.62)}',
            '.shiki-subcard img{width:3.4em;height:4.8em;object-fit:cover;border-radius:.2em;flex-shrink:0;background:rgba(255,255,255,.06)}',
            '.shiki-subcard__body{min-width:0;flex:1;overflow:hidden}',
            '.shiki-subcard__title{font-size:.95em;font-weight:600;white-space:normal;overflow-wrap:break-word;word-wrap:break-word}',
            '.shiki-subcard__sub{font-size:.82em;color:rgba(255,255,255,.55);margin-top:.15em;white-space:normal}',
            '@media (max-width:1400px){.shiki-list{grid-template-columns:repeat(4,minmax(0,1fr))}}',
            '@media (max-width:900px){.shiki-list{grid-template-columns:repeat(3,minmax(0,1fr))}}',
            '@media (max-width:600px){.shiki-list{grid-template-columns:repeat(2,minmax(0,1fr))}.shiki-search-wrap .scroll__content,.shiki-full-wrap .scroll__content{padding-left:.7em;padding-right:.7em}.shiki-toolbar__tools .shiki-tab--search{flex:1 1 100%}.shiki-toolbar__tools .shiki-tab--filter{flex:1 1 auto}.shiki-toolbar__tabs .shiki-tab--section{flex:1 1 42%}.shiki-full{flex-direction:column;align-items:center}.shiki-full__poster{margin:0 0 1em}.shiki-full__img{max-width:55vw}.shiki-full__info{width:100%}.shiki-full__title,.shiki-full__orig{text-align:center}.shiki-full__actions{justify-content:center}.shiki-subcard{flex-basis:100%;margin-right:0}}'
        ].join('')
        $('head').append('<style id="shikimori-plugin-styles">' + css + '</style>')
    }

    // ---------- Shikimori API (modular multi-host fallback + TTL cache) ----------
    function getHostCandidates() {
        var pref = (typeof Lampa !== 'undefined' && Lampa.Storage && Lampa.Storage.field)
            ? Lampa.Storage.field('shikimori_host')
            : 'auto'
        var list = []
        var i
        if (pref && pref !== 'auto' && HOSTS.indexOf(pref) >= 0) {
            list.push(pref)
            for (i = 0; i < HOSTS.length; i++) {
                if (HOSTS[i] !== pref) list.push(HOSTS[i])
            }
            return list
        }
        for (i = 0; i < HOSTS.length; i++) {
            list.push(HOSTS[(hostIdx + i) % HOSTS.length])
        }
        return list
    }

    function createNetwork(timeoutMs) {
        var net = new Lampa.Reguest()
        var originalClear = net && typeof net.clear === 'function' ? net.clear : null
        if (net) {
            net._shikiCancelled = false
            net.clear = function () {
                net._shikiCancelled = true
                if (originalClear) return originalClear.apply(net, arguments)
            }
        }
        if (net && typeof net.timeout === 'function') {
            net.timeout(timeoutMs || 12000)
        }
        return net
    }

    function isValidShikiPayload(res, opts) {
        if (res === false || res === undefined || res === null) return false
        if (opts && opts.expectArray) return Array.isArray(res)
        if (opts && opts.expectObject) {
            return typeof res === 'object' && !Array.isArray(res) && Boolean(res.id)
        }
        return true
    }

    function shikiRequest(net, pathAndQuery, success, failure, options) {
        var opts = options || {}
        var requestNet = net || createNetwork(12000)
        if (requestNet && requestNet._shikiCancelled) return
        var cacheKey = 'animes:' + pathAndQuery
        if (!opts.noCache) {
            var hit = cacheGet(cacheKey)
            if (hit !== undefined && isValidShikiPayload(hit, opts)) {
                success(hit)
                return
            }
        }

        var candidates = getHostCandidates()

        function tryCandidate(idx) {
            if (requestNet && requestNet._shikiCancelled) return
            if (idx >= candidates.length) {
                if (failure) failure()
                return
            }
            var host = candidates[idx]
            var url = host + '/api/animes' + pathAndQuery
            try {
                requestNet.silent(url, function (res) {
                    if (requestNet && requestNet._shikiCancelled) return
                    if (res === false || res === undefined || res === null) {
                        tryCandidate(idx + 1)
                        return
                    }
                    if (typeof res === 'object' && !Array.isArray(res)) {
                        if (res.code === 404) {
                            tryCandidate(idx + 1)
                            return
                        }
                        if (res.error || res.retry_later) {
                            tryCandidate(idx + 1)
                            return
                        }
                    }
                    if (!isValidShikiPayload(res, opts)) {
                        tryCandidate(idx + 1)
                        return
                    }
                    var foundIdx = HOSTS.indexOf(host)
                    if (foundIdx >= 0) hostIdx = foundIdx
                    var isEmptyArray = Array.isArray(res) && res.length === 0
                    // Try the alternate Shikimori host before accepting an empty response.
                    if (isEmptyArray && idx + 1 < candidates.length) {
                        tryCandidate(idx + 1)
                        return
                    }
                    if (!isEmptyArray) cacheSet(cacheKey, res)
                    success(res)
                }, function () {
                    if (requestNet && requestNet._shikiCancelled) return
                    tryCandidate(idx + 1)
                }, null, { headers: { 'Accept': 'application/json' } })
            } catch (e) {
                tryCandidate(idx + 1)
            }
        }

        tryCandidate(0)
    }

    function shikiCatalog(net, mode, keyword, page, success, failure, filters) {
        var p = page || 1
        var allowAdult = false
        try {
            allowAdult = !!(Lampa.Storage && Lampa.Storage.field && Lampa.Storage.field('shikimori_adult'))
        } catch (e) {}
        var base = '?limit=' + PAGE + '&page=' + p + '&censored=' + (allowAdult ? 'false' : 'true')
        var query
        if (mode === 'search' && keyword) query = base + '&search=' + encodeURIComponent(keyword)
        else query = base
        var order = mode === 'top' ? 'ranked' : 'popularity'
        if (mode === 'anons') query += '&status=anons'
        else if (mode === 'ongoing') query += '&status=ongoing'
        if (filters && typeof filters === 'object') {
            if (filters.kind) query += '&kind=' + encodeURIComponent(filters.kind)
            if (filters.status) { query = query.replace(/&status=[^&]*/g, ''); query += '&status=' + encodeURIComponent(filters.status) }
            if (filters.season) query += '&season=' + encodeURIComponent(filters.season)
            if (filters.score) query += '&score=' + encodeURIComponent(filters.score)
            if (filters.duration) query += '&duration=' + encodeURIComponent(filters.duration)
            if (filters.rating) query += '&rating=' + encodeURIComponent(filters.rating)
            if (filters.genre) query += '&genre=' + encodeURIComponent(filters.genre)
            if (filters.order) order = filters.order
        }
        query += '&order=' + encodeURIComponent(order)
        shikiRequest(net, query, success, failure, { expectArray: true })
    }

    function shikiSearch(net, query, page, success, failure) {
        shikiCatalog(net, 'search', query, page, success, failure)
    }

    function shikiDetails(net, id, success, failure) {
        shikiRequest(net, '/' + encodeURIComponent(id), success, failure, { expectObject: true })
    }

    function shikiRelated(net, id, success, failure) {
        shikiRequest(net, '/' + encodeURIComponent(id) + '/related', success, failure, { expectArray: true })
    }

    function shikiSimilar(net, id, success, failure) {
        shikiRequest(net, '/' + encodeURIComponent(id) + '/similar', success, failure, { expectArray: true })
    }

    // ---------- TMDB lookup & scoring ----------
    function tmdbApiKey() {
        if (typeof Lampa !== 'undefined' && Lampa.TMDB && typeof Lampa.TMDB.key === 'function') {
            return Lampa.TMDB.key()
        }
        return ''
    }

    function tmdbUrl(path, params) {
        var base
        try {
            base = Lampa.TMDB.api(path)
        } catch (e) {
            base = 'https://api.themoviedb.org/3/' + path
        }
        var key = tmdbApiKey()
        return base + (base.indexOf('?') >= 0 ? '&' : '?') +
            (key ? 'api_key=' + encodeURIComponent(key) + '&' : '') +
            'language=' + encodeURIComponent(lang()) + '&' + params
    }

    function tmdbSearch(net, name, type, cb) {
        if (net && net._shikiCancelled) return
        try {
            net.silent(tmdbUrl('search/' + type, 'query=' + encodeURIComponent(name)), function (res) {
                if (net && net._shikiCancelled) return
                var arr = (res && Array.isArray(res.results)) ? res.results : []
                var stamped = []
                for (var i = 0; i < arr.length; i++) {
                    var copy = {}
                    for (var k in arr[i]) {
                        if (Object.prototype.hasOwnProperty.call(arr[i], k)) copy[k] = arr[i][k]
                    }
                    copy.media_type = arr[i].media_type || type
                    if (type !== 'multi' || copy.media_type === 'tv' || copy.media_type === 'movie') stamped.push(copy)
                }
                cb(stamped)
            }, function () {
                if (!(net && net._shikiCancelled)) cb([])
            })
        } catch (e) {
            if (!(net && net._shikiCancelled)) cb([])
        }
    }

    function isSubstrTitleMatch(a, b) {
        if (!a || !b) return false
        var minLen = Math.min(a.length, b.length)
        var threshold = /[\u3400-\u9fff\uf900-\ufaff]/.test(a) || /[\u3400-\u9fff\uf900-\ufaff]/.test(b) ? 2 : 3
        if (minLen < threshold) return false
        return a.indexOf(b) >= 0 || b.indexOf(a) >= 0
    }

    function scoreTmdbCandidate(candidate, targetNorms, targetYear, targetKind) {
        if (!candidate) return { score: -100, titleMatched: false, exactTitle: false }
        var score = 0
        var origNorm = normalize(candidate.original_title || candidate.original_name || '')
        var locNorm = normalize(candidate.title || candidate.name || '')

        var titleMatched = false
        var exactTitle = false
        for (var i = 0; i < targetNorms.length; i++) {
            var tn = targetNorms[i]
            if (!tn) continue
            if (origNorm === tn || locNorm === tn) {
                score += 60
                titleMatched = true
                exactTitle = true
                break
            }
            if (isSubstrTitleMatch(origNorm, tn) || isSubstrTitleMatch(locNorm, tn)) {
                score += 25
                titleMatched = true
            }
        }

        if (Array.isArray(candidate.genre_ids) && candidate.genre_ids.indexOf(16) >= 0) {
            score += 30
        }
        if (candidate.original_language === 'ja' ||
            (Array.isArray(candidate.origin_country) && candidate.origin_country.indexOf('JP') >= 0)) {
            score += 25
        }

        var dateStr = candidate.first_air_date || candidate.release_date || ''
        var candYear = dateStr ? parseInt(dateStr.substr(0, 4), 10) : 0
        if (targetYear && candYear) {
            var diff = Math.abs(targetYear - candYear)
            if (diff === 0) score += 25
            else if (diff === 1) score += 12
            else if (diff <= 3) score += 4
        }

        if (targetKind) {
            var wantMovie = targetKind === 'movie'
            if ((wantMovie && candidate.media_type === 'movie') || (!wantMovie && candidate.media_type === 'tv')) {
                score += 10
            }
        }

        return { score: score, titleMatched: titleMatched, exactTitle: exactTitle }
    }

    function tmdbForAnime(animeOrOrig, maybeRussian, maybeCallback, optionalNet) {
        var animeObj
        var callback
        var net
        if (typeof animeOrOrig === 'object' && animeOrOrig !== null) {
            animeObj = animeOrOrig
            callback = maybeRussian
            net = maybeCallback || createNetwork(12000)
        } else {
            animeObj = { name: animeOrOrig, russian: maybeRussian }
            callback = maybeCallback
            net = optionalNet || createNetwork(12000)
        }

        var englishTitles = Array.isArray(animeObj.english) ? animeObj.english : [animeObj.english]
        var synonyms = Array.isArray(animeObj.synonyms) ? animeObj.synonyms : [animeObj.synonyms]
        var engFirst = englishTitles[0] || ''
        var primaryQueries = dedupeQueries([animeObj.name].concat(englishTitles, [animeObj.russian], synonyms))
        if (!primaryQueries.length) {
            callback([], false)
            return
        }

        var fallbackQueries = dedupeQueries([animeObj.name, animeObj.russian].concat(englishTitles, synonyms).map(stripSeasonSuffix)).filter(function (q) {
            var nq = normalize(q)
            for (var i = 0; i < primaryQueries.length; i++) {
                if (normalize(primaryQueries[i]) === nq) return false
            }
            return Boolean(nq)
        })

        var targetNorms = dedupeQueries([animeObj.name, animeObj.russian].concat(englishTitles, synonyms).concat(
            [animeObj.name, animeObj.russian].concat(englishTitles, synonyms).map(stripSeasonSuffix)
        )).map(normalize).filter(Boolean)

        var targetYear = animeObj.aired_on ? parseInt(String(animeObj.aired_on).substr(0, 4), 10) : 0

        function runBatch(queries, done) {
            var qi = 0
            var acc = []
            var fails = 0
            function next() {
                if (qi >= queries.length || fails >= 3) {
                    done(acc)
                    return
                }
                var q = queries[qi++]
                tmdbSearch(net, q, 'multi', function (results) {
                    acc = acc.concat(results)
                    if (!results.length) fails++
                    else fails = 0
                    next()
                })
            }
            next()
        }

        function rankAndFinish(rawList) {
            var seen = {}
            var uniq = []
            for (var i = 0; i < rawList.length; i++) {
                var r = rawList[i]
                var key = r.id + ':' + r.media_type
                if (!seen[key]) {
                    seen[key] = 1
                    uniq.push(r)
                }
            }
            if (!uniq.length) {
                callback([], false)
                return
            }

            var scored = uniq.map(function (r) {
                var res = scoreTmdbCandidate(r, targetNorms, targetYear, animeObj.kind)
                return { item: r, score: res.score, titleMatched: res.titleMatched, exactTitle: res.exactTitle }
            })

            scored.sort(function (a, b) { return b.score - a.score })

            var matched = scored.filter(function (s) { return s.titleMatched })
            var confidentSingle = matched.length === 1 && (matched[0].exactTitle || matched[0].score >= 65)
            var chosen = (matched.length ? matched : scored.slice(0, 10)).map(function (s) { return s.item })
            callback(chosen, confidentSingle)
        }

        runBatch(primaryQueries, function (firstBatch) {
            var hasGoodMatch = false
            for (var i = 0; i < firstBatch.length; i++) {
                var check = scoreTmdbCandidate(firstBatch[i], targetNorms, targetYear, animeObj.kind)
                if (check.titleMatched && check.score >= 60) {
                    hasGoodMatch = true
                    break
                }
            }
            if (hasGoodMatch || !fallbackQueries.length) {
                rankAndFinish(firstBatch)
                return
            }
            runBatch(fallbackQueries, function (secondBatch) {
                rankAndFinish(firstBatch.concat(secondBatch))
            })
        })
    }

    function gotoTmdbCard(movie) {
        Lampa.Activity.push({
            url: '',
            component: 'full',
            id: movie.id,
            method: movie.media_type === 'movie' ? 'movie' : 'tv',
            card: movie,
            source: 'tmdb',
            page: 1
        })
    }

    function openNativeTmdbSearch(title) {
        var query = String(title || '').trim()
        if (!query) {
            Lampa.Noty.show(tr('shikimori_no_tmdb'))
            return
        }
        // Use Lampa's own TMDB source as a fallback: it respects the app's
        // configured TMDB proxy and native network handling.
        Lampa.Activity.push({
            url: 'search/multi?query=' + encodeURIComponent(query),
            title: query,
            component: 'category_full',
            source: 'tmdb',
            page: 1
        })
    }

    function openTmdbResults(results, fallbackTitle, allowAutoOpen) {
        if (!Array.isArray(results) || !results.length) {
            openNativeTmdbSearch(fallbackTitle)
            return
        }
        if (results.length === 1 && allowAutoOpen) {
            gotoTmdbCard(results[0])
            return
        }
        var items = results.map(function (r) {
            var d = r.first_air_date || r.release_date || ''
            var vote = r.vote_average ? Number(r.vote_average).toFixed(1) : '—'
            var rawSubtitle = (r.original_title || r.original_name || '') + ' · ' +
                (d ? d.substr(0, 4) : '—') + ' · ' +
                (r.media_type === 'movie' ? tr('shikimori_movie') : tr('shikimori_series')) + ' · ' +
                tr('shikimori_rate') + ' ' + vote
            return {
                title: esc(r.title || r.name || fallbackTitle || '?'),
                subtitle: esc(rawSubtitle),
                select: r
            }
        })
        try {
            if (Lampa.Select && typeof Lampa.Select.show === 'function') {
                Lampa.Select.show({
                    title: tr('shikimori_choose'),
                    items: items,
                    onSelect: function (item) {
                        try { Lampa.Select.close() } catch (e) {}
                        gotoTmdbCard(item.select)
                    },
                    onBack: function () {
                        try { Lampa.Controller.toggle('content') } catch (e) {}
                    }
                })
            } else {
                openNativeTmdbSearch(fallbackTitle)
            }
        } catch (e) {
            try { openNativeTmdbSearch(fallbackTitle) } catch (ee) {
                try { Lampa.Noty.show(tr('shikimori_no_tmdb')) } catch (eee) {}
            }
        }
    }

    // ---------- controller helper (standard Lampa spatial navigation) ----------
    function activateContentController(scroll, getLastFocused, setLastFocused) {
        var container = scroll.render(true)

        // Lampa's Scroll moves .scroll__body with transforms; Navigator.canmove()
        // only reports focus-neighbours and can be false while content remains above.
        // In that case, move focus to the nearest selector visually above and let
        // Lampa.Scroll reveal it. Hand off to the head only at the real content edge.
        function focusAboveCurrent() {
            var current = getLastFocused && getLastFocused()
            if (!current || !current.getBoundingClientRect) return false

            var currentRect = current.getBoundingClientRect()
            var currentCenter = currentRect.left + currentRect.width / 2
            var candidates = $(container).find('.selector').toArray()
            var best = null
            var bestScore = Infinity

            for (var i = 0; i < candidates.length; i++) {
                var candidate = candidates[i]
                if (candidate === current || !candidate.getBoundingClientRect) continue
                var rect = candidate.getBoundingClientRect()
                if (!rect.width || !rect.height) continue
                var centerY = rect.top + rect.height / 2
                if (centerY >= currentRect.top + currentRect.height / 2 - 2) continue

                var verticalGap = Math.max(0, currentRect.top - rect.bottom)
                var horizontalGap = Math.abs((rect.left + rect.width / 2) - currentCenter)
                var score = verticalGap * 2 + horizontalGap
                if (score < bestScore) {
                    bestScore = score
                    best = candidate
                }
            }

            if (!best) return false
            if (setLastFocused) setLastFocused(best)
            try { Lampa.Controller.collectionFocus(best, container) } catch (e) {}
            try { scroll.update(best, true) } catch (e) {}
            return true
        }

        Lampa.Controller.add('content', {
            toggle: function () {
                Lampa.Controller.collectionSet(container)
                Lampa.Controller.collectionFocus(getLastFocused() || false, container)
            },
            up: function () {
                if (typeof Navigator !== 'undefined' && Navigator.canmove('up')) Navigator.move('up')
                else if (!focusAboveCurrent()) Lampa.Controller.toggle('head')
            },
            down: function () {
                if (typeof Navigator !== 'undefined' && Navigator.canmove('down')) Navigator.move('down')
            },
            left: function () {
                if (typeof Navigator !== 'undefined' && Navigator.canmove('left')) Navigator.move('left')
                else Lampa.Controller.toggle('menu')
            },
            right: function () {
                if (typeof Navigator !== 'undefined' && Navigator.canmove('right')) Navigator.move('right')
            },
            back: function () {
                if (Lampa.Activity.backward) Lampa.Activity.backward()
                else Lampa.Activity.back()
            }
        })
        Lampa.Controller.toggle('content')
    }

    // ---------- trailer playback ----------
    function playYoutubeVideo(videoItem, allItems) {
        if (Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('android') &&
            Lampa.Storage && Lampa.Storage.field && Lampa.Storage.field('player_launch_trailers') === 'youtube' &&
            Lampa.Android && Lampa.Android.openYoutube) {
            try { Lampa.Android.openYoutube(videoItem.id); return } catch (e) {}
        }
        if (typeof YT !== 'undefined' && Lampa.YouTube && typeof Lampa.YouTube.play === 'function') {
            try { Lampa.YouTube.play(videoItem.id); return } catch (e) {}
        }
        if (Lampa.Player && typeof Lampa.Player.play === 'function') {
            try {
                Lampa.Player.play({ title: videoItem.title, url: videoItem.url })
                if (Lampa.Player.playlist && Array.isArray(allItems) && allItems.length > 1) {
                    var playlist = allItems.map(function (t) { return { title: t.title, url: t.url } })
                    try { Lampa.Player.playlist(playlist) } catch (ee) {}
                }
            } catch (e) {}
        }
    }

    // ---------- search & catalog component ----------
    function ShikimoriSearchComponent(object) {
        var self = this
        var html = $('<div class="shiki-search-wrap"></div>')
        var net = createNetwork(12000)
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250, end_ratio: 1 })
        var page = 1
        var hasMore = false
        var loadingMore = false
        var destroyed = false
        var lastFocused = null

        var keyword = (object && object.search) ? String(object.search).trim() : ''
        var mode = (object && object.mode) ? object.mode : (keyword ? 'search' : 'ongoing')
        var filters = (object && object.filters && typeof object.filters === 'object') ? object.filters : {}
        var adultFilterEnabled = false
        try { adultFilterEnabled = !!(Lampa.Storage && Lampa.Storage.field && Lampa.Storage.field('shikimori_adult')) } catch (e) {}
        if (!adultFilterEnabled && filters.rating === 'rx') delete filters.rating
        if (!adultFilterEnabled && String(filters.genre) === '12') delete filters.genre

        function setLoader(active) {
            if (self.activity && typeof self.activity.loader === 'function') {
                self.activity.loader(active)
                return
            }
            try {
                if (active) html.addClass('shiki-local-loading')
                else html.removeClass('shiki-local-loading')
            } catch (e) {}
        }

        function bindFocusable(elements) {
            elements.on('hover:focus', function () {
                lastFocused = this
                scroll.update(this, false)
            }).on('hover:hover hover:touch mouseenter', function () {
                lastFocused = this
            })
        }

        function setupController() {
            if (destroyed) return
            activateContentController(scroll, function () { return lastFocused }, function (element) { lastFocused = element })
        }

        function askKeyword() {
            function onEdit(value) {
                if (destroyed) return
                var trimmed = (value || '').trim()
                if (!trimmed) {
                    setupController()
                    return
                }
                Lampa.Activity.replace({ search: trimmed, mode: 'search', page: 1, filters: filters })
            }
            if (Lampa.Input && typeof Lampa.Input.edit === 'function') {
                Lampa.Input.edit({
                    title: tr('shikimori_input_title'),
                    value: keyword,
                    free: true,
                    nosave: true
                }, onEdit)
            } else if (Lampa.Search && typeof Lampa.Search.show === 'function') {
                Lampa.Search.show({
                    title: tr('shikimori_input_title'),
                    value: keyword,
                    onSearch: onEdit,
                    onBack: function () { setupController() }
                })
            } else {
                // fallback: just focus controller if no input method
                setupController()
            }
        }

        function buildToolbar() {
            var bar = $('<div class="shiki-toolbar"></div>')
            var tools = $('<div class="shiki-toolbar__tools"></div>')
            var searchLabel = keyword
                ? (tr('shikimori_search_btn') + ': ' + keyword)
                : tr('shikimori_search_btn')

            var searchBtn = $('<div class="shiki-tab shiki-tab--search selector' + (mode === 'search' ? ' shiki-tab--active' : '') + '">' +
                SEARCH_SVG + '<span>' + esc(searchLabel) + '</span></div>')
            searchBtn.on('hover:enter', askKeyword)
            tools.append(searchBtn)

            var filterLabel = tr('shikimori_filters') + (hasActiveFilters() ? ' •' : '')
            var filterBtn = $('<div class="shiki-tab shiki-tab--filter selector"><span>' + esc(filterLabel) + '</span></div>')
            filterBtn.on('hover:enter', showFilterMenu)
            tools.append(filterBtn)
            bar.append(tools)

            var tabsRow = $('<div class="shiki-toolbar__tabs"></div>')
            var tabs = [
                { id: 'ongoing', label: tr('shikimori_tab_ongoing') },
                { id: 'popular', label: tr('shikimori_tab_popular') },
                { id: 'top',     label: tr('shikimori_tab_top') },
                { id: 'anons',   label: tr('shikimori_tab_anons') }
            ]

            tabs.forEach(function (t) {
                var tab = $('<div class="shiki-tab shiki-tab--section selector' + (mode === t.id ? ' shiki-tab--active' : '') + '">' +
                    '<span>' + esc(t.label) + '</span></div>')
                tab.on('hover:enter', function () {
                    if (mode === t.id && !keyword) return
                    Lampa.Activity.replace({ search: '', mode: t.id, page: 1, filters: filters })
                })
                tabsRow.append(tab)
            })
            bar.append(tabsRow)

            bindFocusable(bar.find('.selector'))
            if (hasActiveFilters()) bar.append($('<div class="shiki-filter-summary"></div>').text(filterSummary()))
            return bar
        }

        function hasActiveFilters() {
            return !!(filters.kind || filters.status || filters.season || filters.score || filters.duration || filters.rating || filters.genre || filters.order)
        }
        function filterSummary() {
            var parts = []
            if (filters.kind) parts.push(tr('shikimori_filter_kind') + ': ' + kindTitle(filters.kind))
            if (filters.status) parts.push(tr('shikimori_filter_status') + ': ' + statusTitle(filters.status))
            if (filters.season) parts.push(tr('shikimori_filter_year') + ': ' + seasonTitle(filters.season))
            if (filters.score) parts.push(tr('shikimori_filter_score') + ': ' + filters.score + '+')
            if (filters.duration) parts.push(tr('shikimori_filter_duration') + ': ' + durationTitle(filters.duration))
            if (filters.rating) parts.push(tr('shikimori_filter_rating') + ': ' + formatRating(filters.rating))
            if (filters.genre) parts.push(tr('shikimori_filter_genre') + ': ' + genreTitle(filters.genre))
            if (filters.order) parts.push(tr('shikimori_filter_order') + ': ' + orderTitle(filters.order))
            return parts.join('  ·  ')
        }
        function replaceFilters(next) {
            filters = next
            Lampa.Activity.replace({ search: keyword, mode: mode, page: 1, filters: filters })
        }
        function showFilterMenu() {
            if (!Lampa.Select || typeof Lampa.Select.show !== 'function') { Lampa.Noty.show(tr('shikimori_filters')); return }
            var adultEnabled = false
            try { adultEnabled = !!(Lampa.Storage && Lampa.Storage.field && Lampa.Storage.field('shikimori_adult')) } catch (e) {}
            var seasonValues = [['', tr('shikimori_filter_any')]]
            var seasonNames = isRu()
                ? [['winter', 'Зима'], ['spring', 'Весна'], ['summer', 'Лето'], ['fall', 'Осень']]
                : [['winter', 'Winter'], ['spring', 'Spring'], ['summer', 'Summer'], ['fall', 'Fall']]
            var currentYear = new Date().getFullYear()
            for (var sy = currentYear; sy >= currentYear - 2; sy--) {
                for (var ss = 0; ss < seasonNames.length; ss++) {
                    seasonValues.push([seasonNames[ss][0] + '_' + sy, seasonNames[ss][1] + ' ' + sy])
                }
            }
            for (var y = currentYear; y >= 1980; y--) seasonValues.push([String(y), String(y)])

            var kindValues = [['', tr('shikimori_filter_any')], ['tv', 'TV'], ['tv_13', 'TV · 13'], ['tv_24', 'TV · 24'], ['tv_48', 'TV · 48'], ['movie', tr('shikimori_movie')], ['ova', 'OVA'], ['ona', 'ONA'], ['special', 'Special'], ['tv_special', 'TV Special'], ['music', 'Music'], ['pv', 'PV'], ['cm', 'CM']]
            var genreValues = [['', tr('shikimori_filter_any')]]
            for (var gid = 1; gid <= 41; gid++) {
                if (gid === 12 && !adultEnabled) continue
                genreValues.push([String(gid), genreTitle(gid)])
            }
            var ratingValues = [['', tr('shikimori_filter_any')], ['g', 'G'], ['pg', 'PG'], ['pg_13', 'PG-13'], ['r', 'R'], ['r_plus', 'R+']]
            if (adultEnabled) ratingValues.push(['rx', 'Rx'])

            var entries = [
                { key: 'kind', title: tr('shikimori_filter_kind'), values: kindValues },
                { key: 'status', title: tr('shikimori_filter_status'), values: [['', tr('shikimori_filter_any')], ['anons', tr('shikimori_anons')], ['ongoing', tr('shikimori_ongoing')], ['released', tr('shikimori_released_s')]] },
                { key: 'season', title: tr('shikimori_filter_year'), values: seasonValues },
                { key: 'genre', title: tr('shikimori_filter_genre'), values: genreValues },
                { key: 'score', title: tr('shikimori_filter_score'), values: [['', tr('shikimori_filter_any')], ['5', '5+'], ['6', '6+'], ['7', '7+'], ['8', '8+'], ['9', '9+']] },
                { key: 'duration', title: tr('shikimori_filter_duration'), values: [['', tr('shikimori_filter_any')], ['S', '< 10 ' + tr('shikimori_minutes')], ['D', '< 30 ' + tr('shikimori_minutes')], ['F', '30+ ' + tr('shikimori_minutes')]] },
                { key: 'rating', title: tr('shikimori_filter_rating'), values: ratingValues },
                { key: 'order', title: tr('shikimori_filter_order'), values: [['', tr('shikimori_filter_any')], ['popularity', tr('shikimori_tab_popular')], ['ranked', tr('shikimori_tab_top')], ['ranked_shiki', isRu() ? 'Рейтинг Shikimori' : 'Shikimori ranking'], ['aired_on', isRu() ? 'Дата выхода' : 'Release date'], ['episodes', isRu() ? 'Количество серий' : 'Episode count'], ['name', 'A–Z'], ['status', isRu() ? 'Статус выхода' : 'Release status']] }
            ]
            var items = entries.map(function (entry) { return { title: entry.title + (filters[entry.key] ? ' · ' + filters[entry.key] : ''), subtitle: filters[entry.key] ? tr('shikimori_filter_active') : '', filterKey: entry.key } })
            items.push({ title: tr('shikimori_filter_clear'), filterKey: '__clear' })
            Lampa.Select.show({ title: tr('shikimori_filters'), items: items, onSelect: function (item) {
                try { Lampa.Select.close() } catch (e) {}
                if (item.filterKey === '__clear') { replaceFilters({}); return }
                var entry = null
                for (var i = 0; i < entries.length; i++) if (entries[i].key === item.filterKey) entry = entries[i]
                if (!entry) return
                Lampa.Select.show({ title: entry.title, items: entry.values.map(function (pair) { return { title: pair[1], subtitle: filters[entry.key] === pair[0] && pair[0] ? tr('shikimori_filter_active') : '', value: pair[0] } }), onSelect: function (choice) {
                    try { Lampa.Select.close() } catch (e) {}
                    var next = {}; for (var k in filters) if (Object.prototype.hasOwnProperty.call(filters, k)) next[k] = filters[k]
                    if (choice.value) next[entry.key] = choice.value; else delete next[entry.key]
                    replaceFilters(next)
                }, onBack: showFilterMenu })
            }, onBack: setupController })
        }

        function createCardElement(a) {
            var primaryName = (isRu() && a.russian) ? a.russian : a.name
            var showOrig = a.name && a.name !== primaryName
            var scoreText = formatScore(a.score) || '—'
            var epText = formatEpisodes(a)
            var yearText = a.aired_on ? String(a.aired_on).substr(0, 4) : '—'

            var metaParts = [
                '<span class="shiki-card__meta-item shiki-card__kind">' + esc(kindTitle(a.kind)) + '</span>',
                '<span class="shiki-card__meta-item">' + esc(yearText) + '</span>'
            ]
            if (epText) metaParts.push('<span class="shiki-card__meta-item">' + esc(epText) + '</span>')
            metaParts.push('<span class="shiki-card__meta-item shiki-card__score">★ ' + esc(scoreText) + '</span>')

            var item = $(
                '<div class="shiki-card selector">' +
                    '<div class="shiki-card__poster"><img class="shiki-poster-image" src="' + esc(posterOf(a, false)) + '" alt=""></div>' +
                    '<div class="shiki-card__body">' +
                        '<div class="shiki-card__name">' + esc(primaryName) + '</div>' +
                        (showOrig ? '<div class="shiki-card__orig">' + esc(a.name) + '</div>' : '') +
                        '<div class="shiki-card__meta">' + metaParts.join('') + '</div>' +
                    '</div>' +
                '</div>'
            )
            bindImgFallback(item, a, '.shiki-poster-image', false)
            item.on('hover:enter', function () { pushDetails(a) })
            bindFocusable(item)
            return item
        }

        function appendCards(listContainer, animes) {
            if (!Array.isArray(animes)) return null
            var firstAdded = null
            animes.forEach(function (a) {
                if (!a || typeof a !== 'object') return
                var card = createCardElement(a)
                if (!firstAdded) firstAdded = card[0]
                listContainer.append(card)
            })
            hasMore = animes.length >= PAGE
            listContainer.find('.shiki-more').remove()
            if (hasMore) {
                var more = $('<div class="shiki-more selector">' + esc(tr('shikimori_load_more')) + '</div>')
                more.on('hover:enter', function () { loadMore(true) })
                bindFocusable(more)
                listContainer.append(more)
            }
            return firstAdded
        }

        function loadMore(manualTrigger) {
            if (loadingMore || !hasMore || destroyed) return
            loadingMore = true
            shikiCatalog(net, mode, keyword, page + 1, function (animes) {
                loadingMore = false
                if (destroyed) return
                var listContainer = scroll.body().find('.shiki-list')

                if (!Array.isArray(animes)) {
                    Lampa.Noty.show(tr('shikimori_error'), { style: 'error' })
                    Lampa.Controller.collectionSet(scroll.render(true))
                    if (lastFocused && lastFocused.parentNode) {
                        try { Lampa.Controller.collectionFocus(lastFocused, scroll.render(true)) } catch (e) {}
                    }
                    return
                }
                if (!animes.length) {
                    hasMore = false
                    Lampa.Controller.collectionSet(scroll.render(true))
                    if (lastFocused && lastFocused.parentNode) {
                        try { Lampa.Controller.collectionFocus(lastFocused, scroll.render(true)) } catch (e) {}
                    }
                    return
                }
                page++
                var firstNew = appendCards(listContainer, animes)
                Lampa.Controller.collectionSet(scroll.render(true))
                // collectionSet may reset cursor on some Lampa builds — restore previous focus for auto-scroll
                if (lastFocused && lastFocused.parentNode) {
                    try { Lampa.Controller.collectionFocus(lastFocused, scroll.render(true)) } catch (e) {}
                }
                if (manualTrigger && firstNew) {
                    lastFocused = firstNew
                    try { Lampa.Controller.collectionFocus(firstNew, scroll.render(true)) } catch (e) {}
                }
            }, function () {
                loadingMore = false
                if (destroyed) return
                Lampa.Noty.show(tr('shikimori_error'), { style: 'error' })
            }, filters)
        }

        function drawInitial(animes, isError) {
            if (destroyed) return
            page = 1
            hasMore = false
            scroll.clear()
            scroll.reset()

            var toolbar = buildToolbar()
            var listContainer = $('<div class="shiki-list"></div>')
            scroll.append(toolbar)
            scroll.append(listContainer)

            if (isError || !Array.isArray(animes)) {
                var retry = $('<div class="shiki-retry selector">' + esc(tr('shikimori_retry')) + '</div>')
                retry.on('hover:enter', fetchFirstPage)
                bindFocusable(retry)
                listContainer.append('<div class="shiki-empty">' + esc(tr('shikimori_error')) + '</div>')
                listContainer.append(retry)
            } else if (!animes.length) {
                listContainer.append('<div class="shiki-empty">' + esc(tr('shikimori_empty')) + '</div>')
            } else {
                appendCards(listContainer, animes)
                var firstCard = listContainer.find('.shiki-card').first()[0]
                if (firstCard) lastFocused = firstCard
            }

            setupController()
        }

        function fetchFirstPage() {
            setLoader(true)
            shikiCatalog(net, mode, keyword, 1, function (animes) {
                setLoader(false)
                drawInitial(animes, false)
            }, function () {
                setLoader(false)
                Lampa.Noty.show(tr('shikimori_error'), { style: 'error' })
                drawInitial([], true)
            }, filters)
        }

        this.create = function () {
            scroll.minus()
            scroll.onEnd = function () {
                loadMore(false)
            }
            html.append(scroll.render())
            return html
        }

        this.start = function () {
            if (scroll.body().children().length) {
                setupController()
                return
            }
            fetchFirstPage()
        }

        this.pause = function () {}
        this.stop = function () {}
        this.destroy = function () {
            destroyed = true
            net.clear()
            scroll.destroy()
            html.remove()
        }
        this.render = function () {
            return html
        }
    }

    // ---------- full details component ----------
    function ShikimoriFullComponent(object) {
        var self = this
        var html = $('<div class="shiki-full-wrap"></div>')
        var net = createNetwork(12000)
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 })
        var loaded = false
        var destroyed = false
        var anime = null
        var tmdbBusy = false
        var tmdbNet = null
        var tmdbLoading = false
        var secondaryNets = []
        var lastFocused = null

        function setLoader(active) {
            if (self.activity && typeof self.activity.loader === 'function') {
                self.activity.loader(active)
                return
            }
            try {
                if (active) html.addClass('shiki-local-loading')
                else html.removeClass('shiki-local-loading')
            } catch (e) {}
        }

        function bindFocusable(elements) {
            elements.on('hover:focus', function () {
                lastFocused = this
                scroll.update(this, false)
            }).on('hover:hover hover:touch mouseenter', function () {
                lastFocused = this
            })
        }

        function setupController() {
            if (destroyed) return
            activateContentController(scroll, function () { return lastFocused }, function (element) { lastFocused = element })
        }

        function renderSubSection(slot, titleText, entries, visibleLimit) {
            if (destroyed || !entries || !entries.length) return
            var limit = visibleLimit || 12
            var sec = $('<div class="shiki-section"><div class="shiki-section__title">' + esc(titleText) + '</div><div class="shiki-sublist"></div></div>')
            var grid = sec.find('.shiki-sublist')

            entries.slice(0, limit).forEach(function (entry) {
                var a = entry.anime
                var name = (isRu() && a.russian) ? a.russian : a.name
                var sub = entry.subtitle || [
                    kindTitle(a.kind),
                    a.aired_on ? String(a.aired_on).substr(0, 4) : '',
                    formatScore(a.score) ? ('★ ' + formatScore(a.score)) : ''
                ].filter(Boolean).join(' · ')

                var card = $(
                    '<div class="shiki-subcard selector">' +
                        '<img class="shiki-poster-image" src="' + esc(posterOf(a, false)) + '" alt="">' +
                        '<div class="shiki-subcard__body">' +
                            '<div class="shiki-subcard__title">' + esc(name) + '</div>' +
                            '<div class="shiki-subcard__sub">' + esc(sub) + '</div>' +
                        '</div>' +
                    '</div>'
                )
                bindImgFallback(card, a, '.shiki-poster-image', false)
                card.on('hover:enter', function () { pushDetails(a) })
                bindFocusable(card)
                grid.append(card)
            })
            if (entries.length > limit) {
                var more = $('<div class="shiki-subcard shiki-subcard--more selector"><div class="shiki-subcard__body"><div class="shiki-subcard__title">+ ' + esc(tr('shikimori_more')) + ' ' + (entries.length - limit) + '</div></div></div>')
                more.on('hover:enter', function () {
                    var nextLimit = Math.min(limit + 12, entries.length)
                    renderSubSection(slot, titleText, entries, nextLimit)
                    var target = slot.find('.shiki-subcard').eq(limit)[0]
                    if (target) {
                        lastFocused = target
                        try {
                            var collection = scroll.render(true)
                            Lampa.Controller.collectionSet(collection)
                            Lampa.Controller.collectionFocus(target, collection)
                        } catch (e) {}
                    }
                })
                bindFocusable(more)
                grid.append(more)
            }

            slot.empty().append(sec)
            // Related/similar cards arrive after the initial detail render; refresh Lampa's scroll bounds.
            try { scroll.update(lastFocused || sec.find('.selector').first()[0] || sec[0], false) } catch (e) {}
            var shikiCanAppend = false
            try {
                if (Lampa.Controller && Lampa.Controller.enabled) {
                    var shikiEn = Lampa.Controller.enabled()
                    shikiCanAppend = shikiEn && typeof shikiEn === 'object' && shikiEn.name === 'content'
                }
            } catch (e) {}
            if (shikiCanAppend) {
                try { Lampa.Controller.collectionAppend(sec.find('.selector')) } catch (e) {}
            }
        }

        function loadSecondarySections(animeId, infoBox) {
            var relatedSlot = $('<div class="shiki-related-slot"></div>')
            var similarSlot = $('<div class="shiki-similar-slot"></div>')
            infoBox.append(relatedSlot)
            infoBox.append(similarSlot)

            var relatedNet = createNetwork(12000)
            var similarNet = createNetwork(12000)
            secondaryNets.push(relatedNet, similarNet)

            shikiRelated(relatedNet, animeId, function (relList) {
                if (destroyed || !Array.isArray(relList)) return
                var items = []
                for (var i = 0; i < relList.length; i++) {
                    var rel = relList[i]
                    if (rel && rel.anime && rel.anime.id) {
                        var relLabel = (isRu() && rel.relation_russian) ? rel.relation_russian : (rel.relation || '')
                        var year = rel.anime.aired_on ? String(rel.anime.aired_on).substr(0, 4) : ''
                        var subParts = [relLabel, kindTitle(rel.anime.kind), year].filter(Boolean)
                        items.push({ anime: rel.anime, subtitle: subParts.join(' · ') })
                    }
                }
                renderSubSection(relatedSlot, tr('shikimori_related'), items)
            })

            shikiSimilar(similarNet, animeId, function (simList) {
                if (destroyed || !Array.isArray(simList)) return
                var items = []
                for (var i = 0; i < simList.length; i++) {
                    if (simList[i] && simList[i].id && simList[i].id !== animeId) {
                        items.push({ anime: simList[i] })
                    }
                }
                renderSubSection(similarSlot, tr('shikimori_similar'), items)
            })
        }

        function renderDetails(a) {
            if (destroyed) return
            anime = a
            scroll.clear()
            scroll.reset()

            var highPoster = posterOf(a, true)
            if (highPoster !== PLACEHOLDER && Lampa.Background && typeof Lampa.Background.immediately === 'function') {
                try { Lampa.Background.immediately(highPoster) } catch (e) {}
            }

            var facts = []
            if (a.kind) facts.push(kindTitle(a.kind))
            if (a.status) facts.push(statusTitle(a.status))
            var epStr = formatEpisodes(a)
            if (epStr) facts.push(epStr)
            if (a.duration && Number(a.duration) > 0) facts.push(a.duration + ' ' + tr('shikimori_minutes'))
            var scoreStr = formatScore(a.score)
            if (scoreStr) facts.push(tr('shikimori_score') + ': ' + scoreStr)
            var ratingStr = formatRating(a.rating)
            if (ratingStr) facts.push(tr('shikimori_rate') + ': ' + ratingStr)
            if (a.aired_on) facts.push(tr('shikimori_released') + ': ' + a.aired_on)
            if (Array.isArray(a.studios) && a.studios.length) {
                var studioNames = a.studios.map(function (s) { return s && s.name }).filter(Boolean)
                if (studioNames.length) facts.push(tr('shikimori_studios') + ': ' + studioNames.join(', '))
            }

            var genresHtml = (Array.isArray(a.genres) ? a.genres : []).map(function (g) {
                if (!g) return ''
                return '<span>#' + esc(isRu() && g.russian ? g.russian : g.name) + '</span>'
            }).filter(Boolean).join(' ')

            var altNames = dedupeQueries([].concat(a.english || [], a.japanese || [], a.synonyms || []))
            var altText = altNames.length ? altNames.map(esc).join(', ') : '—'

            var descr = cleanDescription(a.description || a.description_ru || '')
            if (!descr) descr = tr('shikimori_no_descr')

            var primaryTitle = (isRu() && a.russian) ? a.russian : a.name
            var showOrig = a.name && a.name !== primaryTitle
            var trailers = extractTrailers(a.videos)

            var box = $(
                '<div class="shiki-full">' +
                    '<div class="shiki-full__poster"><img class="shiki-full__img shiki-poster-image" src="' + esc(highPoster) + '" alt=""></div>' +
                    '<div class="shiki-full__info">' +
                        '<h1 class="shiki-full__title">' + esc(primaryTitle) + '</h1>' +
                        (showOrig ? '<h2 class="shiki-full__orig">' + esc(a.name) + '</h2>' : '') +
                        '<div class="shiki-full__facts">' + facts.map(function (f) { return '<span>' + esc(f) + '</span>' }).join('') + '</div>' +
                        (genresHtml ? '<div class="shiki-full__genres">' + genresHtml + '</div>' : '') +
                        '<div class="shiki-full__actions">' +
                            '<div class="full-start__button selector shiki-tmdb-btn">' + TMDB_SVG + '<span>' + esc(tr('shikimori_tmdb')) + '</span></div>' +
                            (trailers.length ? '<div class="full-start__button selector shiki-trailer-btn">' + PLAY_SVG + '<span>' + esc(tr('shikimori_trailer')) + '</span></div>' : '') +
                        '</div>' +
                        '<div class="shiki-full__descr">' + esc(descr) + '</div>' +
                        '<div class="shiki-full__alt">' + esc(tr('shikimori_alt_names')) + ': ' + altText + '</div>' +
                    '</div>' +
                '</div>'
            )

            bindImgFallback(box, a, '.shiki-full__img', true)
            var infoBox = box.find('.shiki-full__info')

            if (Array.isArray(a.screenshots) && a.screenshots.length) {
                var shotsSec = $('<div class="shiki-section"><div class="shiki-section__title">' + esc(tr('shikimori_screenshots')) + '</div><div class="shiki-shots"></div></div>')
                var shotsWrap = shotsSec.find('.shiki-shots')
                a.screenshots.slice(0, 6).forEach(function (shot) {
                    var shotUrl = resolveImageUrl(shot && (shot.preview || shot.original))
                    if (shotUrl !== PLACEHOLDER) {
                        shotsWrap.append('<img src="' + esc(shotUrl) + '" alt="" loading="lazy">')
                    }
                })
                if (shotsWrap.children().length) {
                    bindImgFallback(shotsWrap)
                    infoBox.append(shotsSec)
                }
            }

            box.find('.shiki-tmdb-btn').on('hover:enter', function () {
                if (tmdbBusy || !anime) return
                tmdbBusy = true
                tmdbNet = createNetwork(12000)
                var currentNet = tmdbNet
                var cancelled = false
                tmdbLoading = true
                try {
                    Lampa.Loading.start(function () {
                        cancelled = true
                        tmdbBusy = false
                        try { currentNet.clear() } catch (e) {}
                        if (tmdbNet === currentNet) tmdbNet = null
                        if (tmdbLoading) {
                            tmdbLoading = false
                            try { Lampa.Loading.stop() } catch (ee) {}
                        }
                        if (!destroyed) setupController()
                    })
                } catch (e) {
                    try { Lampa.Loading.start() } catch (ee) {}
                }
                tmdbForAnime(anime, function (results, confidentSingle) {
                    if (cancelled || (currentNet && currentNet._shikiCancelled)) return
                    if (tmdbLoading) {
                        tmdbLoading = false
                        try { Lampa.Loading.stop() } catch (e) {}
                    }
                    if (tmdbNet === currentNet) tmdbNet = null
                    tmdbBusy = false
                    if (destroyed) return
                    openTmdbResults(results, anime.russian || anime.name, confidentSingle)
                }, currentNet)
            })

            if (trailers.length) {
                box.find('.shiki-trailer-btn').on('hover:enter', function () {
                    if (trailers.length === 1) {
                        playYoutubeVideo(trailers[0], trailers)
                        return
                    }
                    Lampa.Select.show({
                        title: tr('shikimori_trailer'),
                        items: trailers.map(function (t) {
                            return {
                                title: esc(t.title),
                                subtitle: esc(t.subtitle),
                                video: t
                            }
                        }),
                        onSelect: function (item) {
                            Lampa.Select.close()
                            setupController()
                            playYoutubeVideo(item.video, trailers)
                        },
                        onBack: function () {
                            setupController()
                        }
                    })
                })
            }

            bindFocusable(box.find('.selector'))
            lastFocused = box.find('.shiki-tmdb-btn')[0]

            scroll.append(box)
            setupController()
            // Recalculate the scroll area after the complete details DOM is attached.
            try { scroll.update(lastFocused || box.find('.selector').first()[0] || box[0], false) } catch (e) {}

            if (a.id) {
                loadSecondarySections(a.id, infoBox)
            }
        }

        function renderError() {
            if (destroyed) return
            scroll.clear()
            var errWrap = $('<div class="shiki-list"><div class="shiki-empty">' + esc(tr('shikimori_error')) + '</div></div>')
            var retry = $('<div class="shiki-retry selector">' + esc(tr('shikimori_retry')) + '</div>')
            retry.on('hover:enter', loadDetails)
            bindFocusable(retry)
            errWrap.append(retry)
            lastFocused = retry[0]
            scroll.append(errWrap)
            setupController()
        }

        function loadDetails() {
            setLoader(true)
            shikiDetails(net, object.anime_id, function (res) {
                setLoader(false)
                loaded = true
                renderDetails(res)
            }, function () {
                setLoader(false)
                Lampa.Noty.show(tr('shikimori_error'), { style: 'error' })
                renderError()
            })
        }

        this.create = function () {
            scroll.minus()
            html.append(scroll.render())
            return html
        }

        this.start = function () {
            if (loaded) {
                setupController()
                return
            }
            loadDetails()
        }

        this.pause = function () {}
        this.stop = function () {}
        this.destroy = function () {
            destroyed = true
            net.clear()
            for (var ni = 0; ni < secondaryNets.length; ni++) {
                try { secondaryNets[ni].clear() } catch (e) {}
            }
            secondaryNets = []
            if (tmdbNet) {
                try { tmdbNet.clear() } catch (e) {}
                tmdbNet = null
            }
            tmdbBusy = false
            if (tmdbLoading) {
                tmdbLoading = false
                try { Lampa.Loading.stop() } catch (e) {}
            }
            scroll.destroy()
            html.remove()
        }
        this.render = function () {
            return html
        }
    }

    function pushDetails(a) {
        if (!a || !a.id) return
        try {
            Lampa.Activity.push({
                url: '',
                title: (isRu() && a.russian) ? a.russian : a.name,
                component: 'shikimori_full',
                anime_id: a.id,
                page: 1
            })
        } catch (e) {}
    }

    // ---------- open from a foreign TMDB/Lampa card ----------
    function openShikimoriForCard(card) {
        if (!card) {
            Lampa.Noty.show(tr('shikimori_empty'))
            return
        }
        // Prefer the displayed title first: it usually retains the season/part suffix.
        var rawQueries = [
            card.title,
            card.name,
            card.original_title,
            card.original_name,
            stripSeasonSuffix(card.title || card.name || ''),
            stripSeasonSuffix(card.original_title || card.original_name || '')
        ]
        var queries = dedupeQueries(rawQueries)
        if (!queries.length) {
            Lampa.Noty.show(tr('shikimori_empty'))
            return
        }

        var prevCtrl = 'content'
        var prevActivity = null
        try {
            if (Lampa.Controller && Lampa.Controller.enabled) {
                var shikiEnPrev = Lampa.Controller.enabled()
                if (shikiEnPrev && typeof shikiEnPrev === 'object' && shikiEnPrev.name) prevCtrl = shikiEnPrev.name
            }
        } catch (e) {}
        try {
            if (Lampa.Activity && typeof Lampa.Activity.active === 'function') prevActivity = Lampa.Activity.active()
            else if (Lampa.Activity && Lampa.Activity.active) prevActivity = Lampa.Activity.active
        } catch (e) {}

        var modalNet = createNetwork(12000)
        var cancelled = false
        var cardDate = card.release_date || card.first_air_date || ''
        var cardYear = cardDate ? parseInt(String(cardDate).substr(0, 4), 10) : 0
        var gathered = []
        var seenIds = {}

        try {
            Lampa.Loading.start(function () {
                cancelled = true
                modalNet.clear()
                try { Lampa.Loading.stop() } catch (e) {}
                if (prevCtrl) try { Lampa.Controller.toggle(prevCtrl) } catch (e) {}
            })
        } catch (e) {
            try { Lampa.Loading.start() } catch (ee) {}
        }

        function animeNames(anime) {
            return dedupeQueries([anime && anime.name, anime && anime.russian].concat(
                anime && Array.isArray(anime.english) ? anime.english : [anime && anime.english],
                anime && Array.isArray(anime.synonyms) ? anime.synonyms : [anime && anime.synonyms]
            )).filter(Boolean)
        }

        function titleMatchesCard(anime) {
            var cardNames = dedupeQueries([
                card.title, card.name, card.original_title, card.original_name,
                stripSeasonSuffix(card.title || card.name || ''),
                stripSeasonSuffix(card.original_title || card.original_name || '')
            ]).map(normalize).filter(Boolean)
            var names = animeNames(anime)
            for (var i = 0; i < names.length; i++) {
                var full = normalize(names[i])
                var baseTitle = stripSeasonSuffix(names[i])
                // Shikimori sequel titles often end in a bare Arabic numeral (e.g. "... 2").
                if (seasonHint) baseTitle = baseTitle.replace(/\s+\d+$/, '')
                var base = normalize(baseTitle)
                if (cardNames.indexOf(full) >= 0 || (base && cardNames.indexOf(base) >= 0)) return true
            }
            return false
        }

        // Lampa commonly represents an entire TV franchise as one card.
        // In that case the card's first_air_date is season 1, while seasons[]
        // carries the dates needed to identify the latest represented season.
        function getCardSeasonHint() {
            var seasons = Array.isArray(card.seasons) ? card.seasons : []
            var latest = null
            seasons.forEach(function (season) {
                if (!season) return
                var number = parseInt(season.season_number, 10) || 0
                var year = season.air_date ? parseInt(String(season.air_date).substr(0, 4), 10) : 0
                if (number > 0 && (!latest || number > latest.number)) {
                    latest = { number: number, year: year || 0 }
                }
            })
            var count = parseInt(card.number_of_seasons, 10) || 0
            if (count > 1 && (!latest || count > latest.number)) {
                var lastYear = card.last_air_date ? parseInt(String(card.last_air_date).substr(0, 4), 10) || 0 : 0
                latest = { number: count, year: lastYear }
            } else if (latest && !latest.year && card.last_air_date) {
                latest.year = parseInt(String(card.last_air_date).substr(0, 4), 10) || 0
            }
            return latest && latest.number > 1 ? latest : null
        }

        function animeSeasonNumber(anime) {
            var names = animeNames(anime)
            for (var i = 0; i < names.length; i++) {
                var value = String(names[i])
                var match = value.match(/(?:season|сезон|part|часть)\s*(\d+)|(?:^|\s)(\d+)\s*(?:season|сезон|part|часть)\b/i)
                if (match) return parseInt(match[1] || match[2], 10) || 0
                match = value.match(/\s+(?:ii|iii|iv|v|vi|vii|viii)$/i)
                if (match) {
                    var roman = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 }
                    return roman[match[0].trim().toLowerCase()] || 0
                }
                match = value.match(/\s+(\d+)$/)
                if (match) return parseInt(match[1], 10) || 0
            }
            return 0
        }

        function animeYear(anime) {
            return anime && anime.aired_on ? parseInt(String(anime.aired_on).substr(0, 4), 10) || 0 : 0
        }

        var seasonHint = getCardSeasonHint()

        function candidateScore(anime) {
            if (!titleMatchesCard(anime)) return -1000
            var score = 100
            var number = animeSeasonNumber(anime)
            var year = animeYear(anime)
            if (seasonHint) {
                if (number && number === seasonHint.number) score += 100
                else if (number && number !== seasonHint.number) score -= 80
                if (seasonHint.year && year === seasonHint.year) score += 80
                else if (seasonHint.year && year) score -= Math.min(40, Math.abs(seasonHint.year - year) * 10)
            } else if (cardYear && year) {
                score += Math.max(0, 20 - Math.abs(cardYear - year) * 5)
            }
            return score
        }

        function finishSearch() {
            if (cancelled) return
            var currentActivity = null
            try {
                if (Lampa.Activity && typeof Lampa.Activity.active === 'function') currentActivity = Lampa.Activity.active()
                else if (Lampa.Activity && Lampa.Activity.active) currentActivity = Lampa.Activity.active
            } catch (e) {}
            if (currentActivity && prevActivity && currentActivity !== prevActivity) {
                cancelled = true
                try { Lampa.Loading.stop() } catch (e) {}
                return
            }
            try { Lampa.Loading.stop() } catch (e) {}
            if (!gathered.length) {
                Lampa.Noty.show(tr('shikimori_empty'))
                return
            }

            var sorted = gathered.slice().sort(function (a, b) {
                return candidateScore(b) - candidateScore(a)
            })
            var bestScore = candidateScore(sorted[0])
            var secondScore = sorted.length > 1 ? candidateScore(sorted[1]) : -1000
            var confident = titleMatchesCard(sorted[0]) &&
                ((!seasonHint && bestScore >= 100 && secondScore < 100) ||
                 (seasonHint && bestScore >= 180 && bestScore - secondScore >= 30))

            if (confident && sorted[0].id) {
                pushDetails(sorted[0])
                return
            }

            try {
                if (Lampa.Select && typeof Lampa.Select.show === 'function') {
                    Lampa.Select.show({
                        title: tr('shikimori_choose'),
                        items: sorted.map(function (a) {
                            var scoreStr = formatScore(a.score) || '—'
                            var rawSub = kindTitle(a.kind) + ' · ' +
                                (a.aired_on ? String(a.aired_on).substr(0, 4) : '—') + ' · ★ ' + scoreStr
                            if (seasonHint && animeSeasonNumber(a)) rawSub += ' · S' + animeSeasonNumber(a)
                            return {
                                title: esc((isRu() && a.russian) ? a.russian : a.name),
                                subtitle: esc(rawSub),
                                anime: a
                            }
                        }),
                        onSelect: function (item) {
                            try { Lampa.Select.close() } catch (e) {}
                            pushDetails(item.anime)
                        },
                        onBack: function () {
                            try { Lampa.Controller.toggle(prevCtrl || 'content') } catch (e) {}
                        }
                    })
                } else {
                    Lampa.Noty.show(tr('shikimori_empty'))
                }
            } catch (e) {
                try { Lampa.Noty.show(tr('shikimori_empty')) } catch (ee) {}
            }
        }

        function tryNext(i) {
            if (cancelled) return
            if (i >= queries.length) {
                finishSearch()
                return
            }
            shikiSearch(modalNet, queries[i], 1, function (animes) {
                if (cancelled) return
                if (Array.isArray(animes)) {
                    animes.forEach(function (anime) {
                        if (!anime || !anime.id || seenIds[String(anime.id)]) return
                        seenIds[String(anime.id)] = true
                        gathered.push(anime)
                    })
                }
                tryNext(i + 1)
            }, function () {
                if (!cancelled) tryNext(i + 1)
            })
        }

        tryNext(0)
    }

    // ---------- menu item ----------
    function openMainActivity() {
        Lampa.Activity.push({
            url: '',
            title: tr('shikimori'),
            component: 'shikimori_search',
            search: '',
            mode: 'ongoing',
            page: 1
        })
    }

    function addMenuItem() {
        var useNativeAdd = Lampa.Menu && typeof Lampa.Menu.addButton === 'function'

        function menuHasOurs() {
            if ($('.menu .shikimori-menu-item').length) return true
            var found = false
            try {
                $('.menu .menu__text').each(function () {
                    if ($(this).text() === tr('shikimori')) { found = true; return false }
                })
            } catch (e) {}
            return found
        }

        function appendToMenuDom(root) {
            var scope = root || $('.menu')
            var list = scope.find('.menu__list').eq(0)
            if (!list.length || menuHasOurs()) return
            var btn = $(
                '<li class="menu__item selector shikimori-menu-item">' +
                    '<div class="menu__ico">' + ICON_SVG + '</div>' +
                    '<div class="menu__text">' + esc(tr('shikimori')) + '</div>' +
                '</li>'
            )
            btn.on('hover:enter', openMainActivity)
            list.append(btn)
        }

        if (useNativeAdd) {
            if (!menuHasOurs()) {
                try { Lampa.Menu.addButton(ICON_SVG, tr('shikimori'), openMainActivity) } catch (e) {}
            }
        } else {
            appendToMenuDom()
            Lampa.Listener.follow('menu', function (e) {
                if (!e || e.type === 'ready') appendToMenuDom(e && e.body ? e.body : null)
            })
        }
    }

    // ---------- settings ----------
    function addSettings() {
        if (!Lampa.SettingsApi) return
        Lampa.SettingsApi.addComponent({
            component: 'shikimori',
            icon: ICON_SVG,
            name: 'Shikimori'
        })
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
        Lampa.SettingsApi.addParam({
            component: 'shikimori',
            param: { name: 'shikimori_anime_only', type: 'trigger', default: true },
            field: { name: tr('shikimori_anime_only') }
        })
        Lampa.SettingsApi.addParam({
            component: 'shikimori',
            param: { name: 'shikimori_adult', type: 'trigger', default: false },
            field: { name: tr('shikimori_adult') }
        })
        Lampa.SettingsApi.addParam({
            component: 'shikimori',
            param: {
                name: 'shikimori_host',
                type: 'select',
                values: {
                    auto: tr('shikimori_host_auto'),
                    'https://shikimori.one': 'shikimori.one',
                    'https://shikimori.io': 'shikimori.io'
                },
                default: 'auto'
            },
            field: { name: tr('shikimori_host_label') }
        })
    }

    // ---------- Shikimori ratings on native Lampa cards ----------
    var shikiRatingQueue = []
    var shikiRatingBusy = false

    // Use the same anime detection as the full-card button: TMDB often omits
    // Japanese language/country metadata but still supplies Animation genre.
    function isShikiRatingCandidate(data) {
        return isCardLikelyAnime(data)
    }

    function findExactShikiAnime(results, titles, year) {
        if (!Array.isArray(results)) return null
        var wanted = titles.map(normalize).filter(Boolean)
        var best = null
        var bestMatch = 0
        for (var i = 0; i < results.length; i++) {
            var anime = results[i]
            if (!anime) continue
            var aliases = [anime.name, anime.russian]
                .concat(Array.isArray(anime.english) ? anime.english : [anime.english])
                .concat(Array.isArray(anime.synonyms) ? anime.synonyms : [anime.synonyms])
            var names = dedupeQueries(aliases).map(normalize).filter(Boolean)
            var matchScore = 0
            for (var n = 0; n < wanted.length; n++) {
                if (!wanted[n]) continue
                for (var j = 0; j < names.length; j++) {
                    if (wanted[n] === names[j]) matchScore = Math.max(matchScore, 100)
                    else if (isSubstrTitleMatch(wanted[n], names[j])) matchScore = Math.max(matchScore, 60)
                }
            }
            if (!matchScore) continue
            var animeYear = anime.aired_on ? parseInt(String(anime.aired_on).substr(0, 4), 10) : 0
            if (year && animeYear) {
                var yearDiff = Math.abs(year - animeYear)
                if (yearDiff > 1) continue
                if (yearDiff === 0) matchScore += 15
            }
            if (matchScore > bestMatch) {
                var score = formatScore(anime.score)
                if (score && anime.id) {
                    bestMatch = matchScore
                    best = { score: score, id: anime.id }
                }
            }
        }
        return best
    }

    function attachShikiRating(job, result) {
        if (!job || !result || !job.render) return
        var root = $(job.render)
        var info = root.find('.info__rate').first()
        if (!info.length) {
            job.attachTries = (job.attachTries || 0) + 1
            if (job.attachTries <= 8) setTimeout(function () { attachShikiRating(job, result) }, 250)
            return
        }
        if (root.find('.shikimori-full-rating').length) return
        info.after(
            $('<div class="shikimori-full-rating">Shikimori <span>★ ' + esc(result.score) + '</span></div>')
        )
    }

    function processShikiRatingQueue() {
        if (shikiRatingBusy || !shikiRatingQueue.length) return
        shikiRatingBusy = true
        var job = shikiRatingQueue.shift()
        var key = 'shiki-rating:' + normalize(job.titles[0] || '') + ':' + (job.year || '')
        var cached = cacheGet(key)
        if (cached !== undefined) {
            if (cached && !cached.notFound) attachShikiRating(job, cached)
            shikiRatingBusy = false
            setTimeout(processShikiRatingQueue, 120)
            return
        }
        var net = createNetwork(10000)
        var index = 0
        function tryTitle() {
            if (index >= job.titles.length) {
                cacheSet(key, { notFound: true })
                net.clear()
                shikiRatingBusy = false
                setTimeout(processShikiRatingQueue, 180)
                return
            }
            var title = job.titles[index++]
            shikiSearch(net, title, 1, function (results) {
                var found = findExactShikiAnime(results, job.titles, job.year)
                if (found) {
                    cacheSet(key, found)
                    attachShikiRating(job, found)
                    net.clear()
                    shikiRatingBusy = false
                    setTimeout(processShikiRatingQueue, 180)
                } else tryTitle()
            }, function () { tryTitle() })
        }
        tryTitle()
    }

    function queueShikiRating(data, render) {
        if (!data || !render || !isShikiRatingCandidate(data)) return
        var root = $(render)
        if (root.find('.shikimori-full-rating').length || root.data('shikiRatingQueued')) return
        var titles = lampaCardTitles(data)
        if (!titles.length) return
        root.data('shikiRatingQueued', true)
        var date = data.first_air_date || data.release_date || data.last_air_date || ''
        var year = date ? parseInt(String(date).substr(0, 4), 10) : 0
        shikiRatingQueue.push({ render: render, titles: titles, year: year })
        processShikiRatingQueue()
    }

    // Follow the same lifecycle as the working Kinopoisk/IMDb plugin:
    // wait until Lampa has completed rendering the full card, then append the rating.
    function installLampaCardRatings() {
        if (!Lampa.Listener || typeof Lampa.Listener.follow !== 'function') return
        Lampa.Listener.follow('full', function (event) {
            if (!event || event.type !== 'complite' || !event.data || !event.data.movie) return
            var render = event.object && event.object.activity &&
                typeof event.object.activity.render === 'function'
                ? event.object.activity.render()
                : null
            if (render) queueShikiRating(event.data.movie, render)
        })
    }

    // ---------- initialization ----------
    function init() {
        Lampa.Lang.add(STRINGS)
        injectCss()
        Lampa.Component.add('shikimori_search', ShikimoriSearchComponent)
        Lampa.Component.add('shikimori_full', ShikimoriFullComponent)
        addMenuItem()
        addSettings()
        installLampaCardRatings()

        var shikiManifest = {
            type: 'video',
            version: VERSION,
            name: tr('shikimori_on_shiki'),
            description: '',
            onContextMenu: function (card) {
                var enabled = true
                try {
                    if (Lampa.Storage && typeof Lampa.Storage.field === 'function') {
                        enabled = Lampa.Storage.field('shikimori_context') !== false
                    }
                } catch (e) { enabled = true }
                if (!enabled) return false
                return { title: tr('shikimori_on_shiki') }
            },
            onContextLauch: function (card) {
                var enabled = true
                try {
                    if (Lampa.Storage && typeof Lampa.Storage.field === 'function') {
                        enabled = Lampa.Storage.field('shikimori_context') !== false
                    }
                } catch (e) { enabled = true }
                if (!enabled) return
                openShikimoriForCard(card)
            }
        }
        shikiManifest.onContextLaunch = shikiManifest.onContextLauch
        try {
            var prevManifest = Lampa.Manifest.plugins
            var shikiCanWrite = true
            try {
                var shikiCur = Lampa.Manifest.plugins
                Lampa.Manifest.plugins = shikiCur
            } catch (e) { shikiCanWrite = false }
            try {
                var shikiFrozenDesc = null
                try { shikiFrozenDesc = Object.getOwnPropertyDescriptor(Lampa.Manifest, 'plugins') } catch (ee) {}
                if (shikiFrozenDesc && shikiFrozenDesc.writable === false) shikiCanWrite = false
                if (typeof Object.isFrozen === 'function' && Object.isFrozen(Lampa.Manifest)) shikiCanWrite = false
            } catch (ee) {}
            if (!shikiCanWrite) {
                try { if (typeof console !== 'undefined' && console.log) console.log('Shikimori: Manifest.plugins is read-only, context menu not available') } catch (ee) {}
            } else if (Array.isArray(prevManifest)) {
                prevManifest.push(shikiManifest)
            } else {
                var shikiDesc = null
                try { shikiDesc = Object.getOwnPropertyDescriptor(Lampa.Manifest, 'plugins') } catch (e) {}
                if (shikiDesc && typeof shikiDesc.set === 'function') {
                    Lampa.Manifest.plugins = shikiManifest
                } else if (prevManifest && typeof prevManifest === 'object' && (prevManifest.onContextMenu || prevManifest.onContextLauch || prevManifest.onContextLaunch)) {
                    try {
                        var shikiTestArray = [prevManifest, shikiManifest]
                        Lampa.Manifest.plugins = shikiTestArray
                        if (!Array.isArray(Lampa.Manifest.plugins) || Lampa.Manifest.plugins.length !== 2) throw new Error('array not supported')
                    } catch (e) {
                        var shikiMerged = {
                            type: 'video',
                            name: shikiManifest.name,
                            description: shikiManifest.description,
                            onContextMenu: function (card) {
                                var prevRes = false
                                try {
                                    if (typeof prevManifest.onContextMenu === 'function') prevRes = prevManifest.onContextMenu(card)
                                    else if (prevManifest.onContextMenu) prevRes = !!prevManifest.onContextMenu
                                } catch (ee) { prevRes = false }
                                var ourRes = shikiManifest.onContextMenu(card)
                                if (ourRes) return ourRes
                                if (prevRes) {
                                    if (typeof prevRes === 'object') return prevRes
                                    var prevTitle = prevManifest.title || prevManifest.name || ''
                                    return { title: prevTitle, name: prevTitle }
                                }
                                return false
                            },
                            onContextLauch: function (card, item) {
                                var ourName = ''
                                try { ourName = tr('shikimori_on_shiki') } catch (ee) {}
                                var itemName = item && (item.title || item.name) ? String(item.title || item.name) : ''
                                if (itemName && itemName === ourName) {
                                    shikiManifest.onContextLauch(card)
                                } else if (!itemName) {
                                    if (shikiManifest.onContextMenu(card)) shikiManifest.onContextLauch(card)
                                    try { if (typeof prevManifest.onContextLauch === 'function') prevManifest.onContextLauch(card, item) } catch (ee) {}
                                    try { if (typeof prevManifest.onContextLaunch === 'function') prevManifest.onContextLaunch(card, item) } catch (ee) {}
                                } else {
                                    try { if (typeof prevManifest.onContextLauch === 'function') prevManifest.onContextLauch(card, item) } catch (ee) {}
                                    try { if (typeof prevManifest.onContextLaunch === 'function') prevManifest.onContextLaunch(card, item) } catch (ee) {}
                                }
                            }
                        }
                        shikiMerged.onContextLaunch = shikiMerged.onContextLauch
                        Lampa.Manifest.plugins = shikiMerged
                    }
                } else {
                    Lampa.Manifest.plugins = shikiManifest
                }
            }
        } catch (e) {
            try { Lampa.Manifest.plugins = shikiManifest } catch (ee) {}
        }

        // Optional button inside TMDB full card (with SVG icon + deduplication + anime filter)
        Lampa.Listener.follow('full', function (e) {
            if (!e || e.type !== 'complite') return
            var btnEnabled = false
            try {
                if (Lampa.Storage && typeof Lampa.Storage.field === 'function') btnEnabled = !!Lampa.Storage.field('shikimori_button')
            } catch (ee) {}
            if (!btnEnabled) return
            var movie = e.data && e.data.movie
            if (!movie) return
            var onlyAnime = true
            try {
                if (Lampa.Storage && typeof Lampa.Storage.field === 'function') onlyAnime = Lampa.Storage.field('shikimori_anime_only') !== false
            } catch (ee) {}
            if (onlyAnime && !isCardLikelyAnime(movie)) return

            var root = e.object && e.object.activity && e.object.activity.render && e.object.activity.render()
            if (!root) return
            var box = $(root).find('.full-start-new__buttons, .full-start__buttons').first()
            if (!box.length || box.find('.shiki-card-btn').length) return

            var btn = $(
                '<div class="full-start__button selector shiki-card-btn">' +
                    ICON_SVG +
                    '<span>' + esc(tr('shikimori_btn_short')) + '</span>' +
                '</div>'
            )
            btn.on('hover:enter', function () { openShikimoriForCard(movie) })
            box.append(btn)
            try { Lampa.Controller.collectionAppend(btn) } catch (ee) {}
        })
    }

    if (window.appready) init()
    else Lampa.Listener.follow('app', function (e) { if (e && e.type === 'ready') init() })
})()
