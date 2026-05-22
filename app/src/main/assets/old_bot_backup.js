// Strakudos Bot v1.7.3 - Fix: remove restartBot from onPageFinished, only onResume
console.log("[KudosBot] FILE LOADED - v1.8.10");
(function() {
    console.log("[KudosBot] Loading bot v1.8.9...");

    // Перехватчик fetch — исследуем как Strava отправляет лайки
    const origFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0] || '';
        const opts = args[1] || {};
        const method = opts.method || 'GET';
        if (method !== 'GET' && (url.includes('kudos') || url.includes('graphql') || url.includes('athlete') || url.includes('activity'))) {
            console.log('[KudosAPI] fetch ' + method + ' ' + url, JSON.stringify(opts.body || '').substring(0, 500));
        }
        return origFetch.apply(this, args);
    };

    // Перехватчик XMLHttpRequest
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        this._method = method;
        return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function(body) {
        if (this._url && (this._url.includes('kudos') || this._url.includes('graphql'))) {
            console.log('[KudosAPI] XHR ' + this._method + ' ' + this._url, JSON.stringify(body || '').substring(0, 500));
        }
        return origSend.call(this, body);
    };

    if (window.kudosBotRunning) {
        console.log("Бот уже запущен.");
        return;
    }
    window.kudosBotRunning = true;
    window.kudosBotShouldStop = false;

    try {
        const saved = localStorage.getItem('strakudos_liked');
        window.likedActivities = saved ? new Set(JSON.parse(saved)) : new Set();
    } catch(e) {
        window.likedActivities = new Set();
    }

    const STRATEGY = window.kudosStrategy || 'smart';

    function log(msg) {
        console.log("[KudosBot] " + msg);
        if (window.AndroidApp) window.AndroidApp.log(msg);
    }

    function updateStats(name) {
        if (window.AndroidApp) window.AndroidApp.onKudosGiven(name);
    }

    // Фоновый режим: Chrome замедляет setTimeout в 5-10x
    let __sleepResolve = null;
    window.__wakeBot = function() {
        if (__sleepResolve) {
            const r = __sleepResolve;
            __sleepResolve = null;
            r();
        }
    };

    // В фоне Chrome троттлит/замораживает setTimeout.
    // Вместо этого ждем пока Android вызовет __wakeBot() через evaluateJavascript.
    function sleep(ms) {
        const isBackground = document.hidden;
        if (!isBackground) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        // Фон: не используем setTimeout — ждем внешнего wake от Android
        return new Promise(resolve => { __sleepResolve = resolve; });
    }

    // Настройка скорости лайков в клубах
    function getClubsDelay() {
        const speed = window.clubsSpeed || 'medium';
        switch(speed) {
            case 'slow': return { min: 2000, max: 5000 };
            case 'medium': return { min: 1000, max: 2500 };
            case 'fast': return { min: 500, max: 1200 };
            case 'ultra': return { min: 200, max: 500 };
            default: return { min: 1000, max: 2500 };
        }
    }

    function saveLiked() {
        try {
            localStorage.setItem('strakudos_liked', JSON.stringify([...window.likedActivities]));
        } catch(e) {}
    }
    setInterval(saveLiked, 30000);

    function isInViewport(el) {
        const rect = el.getBoundingClientRect();
        return rect.top >= 60 && rect.bottom <= (window.innerHeight - 60);
    }

    function findKudosButtons() {
        // Ищем кнопки лайков ВНУТРИ карточек
        const result = [];
        const processed = new Set();
        const scanStats = { cards: 0, available: 0, liked: 0, memory: 0, own: 0, noKudos: 0 };
        const cards = document.querySelectorAll('[data-testid="web-feed-entry"], [data-testid="feed-entry"]');
        scanStats.cards = cards.length;
        log(`🔍 Карточек на странице: ${cards.length}`);

        for (const card of cards) {
            try {
                if (isOwnActivity(card)) {
                    scanStats.own++;
                    continue;
                }

                const buttons = card.querySelectorAll('button, [role="button"]');
                let foundKudosInCard = false;

                for (const btn of buttons) {
                    if (processed.has(btn)) continue;
                    processed.add(btn);

                    const testId = btn.getAttribute('data-testid') || '';
                    const aria = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
                    const text = (btn.textContent || '').toLowerCase().trim();
                    const rect = btn.getBoundingClientRect();

                    if (rect.width === 0 || rect.height === 0) continue;
                    if (rect.width > 220 || rect.height > 110) continue;

                    let isKudos = false;

                    // give_kudos_button — это широкая кнопка/попап зачётов, её нельзя нажимать
                    if (testId === 'give_kudos_button') {
                        continue;
                    }

                    if (testId === 'kudos_button' || testId === 'un-kudos_button') {
                        isKudos = true;
                    } else if (aria.includes('kudos') && !/\d/.test(aria) && !aria.includes('view') && rect.width <= 80) {
                        isKudos = true;
                    } else if ((aria.includes('like') || aria.includes('нрав')) && !/\d/.test(aria)) {
                        isKudos = true;
                    } else if (rect.width <= 70 && rect.height <= 70 && !text) {
                        const svg = btn.querySelector('svg');
                        if (svg) {
                            const svgHtml = (svg.innerHTML || '').toLowerCase();
                            const svgLabel = (svg.getAttribute('aria-label') || '').toLowerCase();
                            if (svgHtml.includes('heart') || svgHtml.includes('thumb') || svgLabel.includes('kudos')) {
                                isKudos = true;
                            }
                        }
                    }

                    if (!isKudos) continue;
                    if (/\d/.test(aria)) continue;
                    if (text.includes('people') || text.includes('liked this')) continue;

                    foundKudosInCard = true;

                    const isLiked = testId.includes('un-kudos')
                        || btn.getAttribute('aria-pressed') === 'true'
                        || btn.querySelector('svg')?.getAttribute('fill') === '#fc5200';

                    if (isLiked) {
                        scanStats.liked++;
                        log(`⏭️ Пропуск (уже лайкнуто DOM): testId=${testId || 'no-testid'}`);
                        continue;
                    }

                    const actId = getActivityId(btn);
                    if (actId && window.likedActivities.has(actId)) {
                        scanStats.memory++;
                        log(`⏭️ Пропуск (в памяти): actId=${actId}`);
                        continue;
                    }

                    scanStats.available++;
                    result.push({btn, actId});
                }

                if (!foundKudosInCard && cards.length > 0) {
                    scanStats.noKudos++;
                    const cardAthlete = card.querySelector('[data-testid="owners-name"]');
                    const name = cardAthlete ? cardAthlete.textContent.trim() : '?';
                    const allBtns = card.querySelectorAll('button');
                    const btnInfo = [];
                    for (const b of allBtns) {
                        const tid = b.getAttribute('data-testid') || '';
                        const ar = b.getAttribute('aria-label') || '';
                        const r = b.getBoundingClientRect();
                        btnInfo.push(`${tid || b.tagName}[${ar}] ${Math.round(r.width)}x${Math.round(r.height)}`);
                    }
                    log(`⚠️ Нет kudos кнопки в карточке [${name}]: ${btnInfo.join(', ')}`);
                }
            } catch(e) {
                log(`⚠️ Ошибка findKudosButtons: ${e.message}`);
            }
        }

        window.lastKudosScanStats = scanStats;
        log(`🔍 Найдено нелайкнутых кнопок: ${result.length}; уже=${scanStats.liked}, память=${scanStats.memory}, свои=${scanStats.own}`);
        return result;
    }

    function getActivityId(btn) {
        try {
            const card = btn.closest('[data-testid="web-feed-entry"]') ||
                        btn.closest('[data-testid="feed-entry"]');
            if (!card) return null;
            const link = card.querySelector('a[href*="/activities/"]');
            if (link) {
                const match = link.href.match(/\/activities\/(\d+)/);
                if (match) return match[1];
            }
            return card.getAttribute('data-testid') || card.id;
        } catch(e) { return null; }
    }

    function findAthleteName(btn) {
        try {
            const card = btn.closest('[data-testid="web-feed-entry"]') ||
                        btn.closest('.activity') ||
                        btn.closest('article') ||
                        btn.closest('div[class*="card" i]');
            if (!card) return "Неизвестный";
            const nameEl = card.querySelector('[data-testid="owners-name"]') ||
                          card.querySelector('a[href*="/athletes/"]') ||
                          card.querySelector('strong a');
            return nameEl ? nameEl.textContent.trim().substring(0, 25) : "Неизвестный";
        } catch(e) { return "Неизвестный"; }
    }

    function directClick(el) {
        try {
            el.click();
            return true;
        } catch(e) { return false; }
    }

    function safeClick(el) {
        try {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const elAtPoint = document.elementFromPoint(x, y);
            if (!elAtPoint) return false;
            const isTarget = (elAtPoint === el || el.contains(elAtPoint) || elAtPoint.contains(el));
            if (!isTarget) return false;
            el.click();
            return true;
        } catch(e) { return false; }
    }

    async function scrollToTop() {
        log("⬆️ Наверх...");
        // Скроллим window
        window.scrollTo({ top: 0, behavior: 'auto' });

        // Также скроллим все возможные контейнеры
        const scrollContainers = document.querySelectorAll('main, [class*="scroll" i], [class*="feed" i], [class*="content" i]');
        for (const container of scrollContainers) {
            if (container.scrollTop > 0) {
                container.scrollTo({ top: 0, behavior: 'auto' });
            }
        }

        await sleep(800);
    }

    async function likeVisible() {
        const buttons = findKudosButtons();
        let clicked = 0;
        for (const {btn, actId} of buttons) {
            if (window.kudosBotShouldStop) break;
            const card = btn.closest('[data-testid="web-feed-entry"]') || btn.closest('[data-testid="feed-entry"]');
            if (card && isOwnActivity(card)) {
                continue;
            }
            if (!isInViewport(btn)) continue;
            const rect = btn.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const elAtPoint = document.elementFromPoint(x, y);
            if (!elAtPoint || (!btn.contains(elAtPoint) && elAtPoint !== btn)) continue;

            const athlete = findAthleteName(btn);
            log(`Лайкаю: ${athlete}`);

            // API v3 режим — ставим лайк через REST API вместо кликов
            if (window.useApiV3 && actId) {
                // Сбрасываем счетчик rate limit при каждой попытке
                window.rateLimitCount = window.rateLimitCount || 0;

                const min = window.kudosMinDelay || 3000;
                const max = window.kudosMaxDelay || 8000;
                const delay = Math.floor(Math.random() * Math.max(0, max - min)) + min;
                if (delay > 500) {
                    log(`Пауза ${(delay/1000).toFixed(1)}с...`);
                    await sleep(delay);
                }
                if (window.kudosBotShouldStop) break;

                log(`API v3: ставлю лайк на активность ${actId}`);
                const result = await giveKudosViaAPI(actId);
                if (result.success) {
                    window.likedActivities.add(actId);
                    window.rateLimitCount = 0; // Сбрасываем счетчик при успехе
                    log(`✅ API Лайк: ${athlete} (HTTP ${result.status})`);
                    updateStats(athlete);
                    clicked++;
                    await sleep(Math.max(100, Math.floor(min / 3)));
                } else if (result.error === 'auth') {
                    log(`❌ API v3: не авторизован (войди в Strava)`);
                    // Переключаемся обратно на клики
                    window.useApiV3 = false;
                    log(`⚠️ Переключаюсь на обычные клики`);
                    if (safeClick(btn)) {
                        if (actId) window.likedActivities.add(actId);
                        log(`✅ Лайк: ${athlete}`);
                        updateStats(athlete);
                        clicked++;
                    }
                } else {
                    // Любая ошибка API — fallback на DOM клик
                    log(`❌ API: ошибка ${result.error} (HTTP ${result.status || '?'}), пробую DOM клик`);
                    window.useApiV3 = false;
                    log(`⚠️ Переключаюсь на обычные клики`);
                    if (safeClick(btn)) {
                        if (actId) window.likedActivities.add(actId);
                        log(`✅ Лайк (DOM fallback): ${athlete}`);
                        updateStats(athlete);
                        clicked++;
                    }
                }
                continue;
            }

            const min = window.kudosMinDelay || 3000;
            const max = window.kudosMaxDelay || 8000;
            const delay = Math.floor(Math.random() * Math.max(0, max - min)) + min;
            if (delay > 500) {
                log(`Пауза ${(delay/1000).toFixed(1)}с...`);
                await sleep(delay);
            }

            if (window.kudosBotShouldStop) break;
            if (safeClick(btn)) {
                if (actId) window.likedActivities.add(actId);
                log(`✅ Лайк: ${athlete}`);
                updateStats(athlete);
                clicked++;
                await sleep(Math.max(100, Math.floor(min / 3)));
            }
        }
        return clicked;
    }

    async function scrollAndLike(maxScrolls) {
        let total = 0;
        let scrolls = 0;
        let lastY = window.scrollY;

        while (scrolls < maxScrolls && !window.kudosBotShouldStop) {
            const clicked = await likeVisible();
            total += clicked;

            if (clicked === 0) {
                window.scrollBy({ top: 500, behavior: 'auto' });
                await sleep(400);
                scrolls++;

                // Проверяем, изменилась ли позиция скролла
                if (window.scrollY === lastY) {
                    log("📍 Конец страницы");
                    break;
                }
                lastY = window.scrollY;
            }
        }
        return total;
    }

    // ====== НАВИГАЦИЯ ПО КЛУБАМ ======

    function simulateClick(el) {
        try {
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            // Полная цепочка событий как у реального пользователя
            const eventInit = {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                screenX: x,
                screenY: y,
                pointerType: 'mouse'
            };

            // Pointer down
            el.dispatchEvent(new PointerEvent('pointerdown', eventInit));
            // Mouse down
            el.dispatchEvent(new MouseEvent('mousedown', eventInit));
            // Pointer up
            el.dispatchEvent(new PointerEvent('pointerup', eventInit));
            // Mouse up
            el.dispatchEvent(new MouseEvent('mouseup', eventInit));
            // Click
            el.dispatchEvent(new MouseEvent('click', eventInit));

        } catch(e) {
            try {
                el.click();
            } catch(e2) {
                // Fallback
            }
        }
    }

    function findClickableParent(el) {
        let parent = el;
        let depth = 0;
        while (parent && depth < 5) {
            if (parent.tagName === 'BUTTON' || parent.tagName === 'A' ||
                parent.getAttribute('role') === 'button' || parent.onclick ||
                parent.getAttribute('onclick')) {
                return parent;
            }
            parent = parent.parentElement;
            depth++;
        }
        return null;
    }

    function clickSandwichMenu() {
        log('Ищу кнопку меню навигации (гамбургер)...');

        // Стратегия 1: Ищем по aria-label (точное совпадение)
        const ariaSelectors = [
            'button[aria-label="Open menu" i]',
            'button[aria-label="Menu" i]',
            'button[aria-label="Navigation menu" i]',
            'button[aria-label="Toggle navigation" i]',
            'button[aria-label="Open navigation" i]',
            'button[aria-label="Open" i]',
            'button[aria-label="Toggle menu" i]',
            'button[aria-label="Open main menu" i]',
            'button[aria-label="Navigation" i]',
            'button[aria-label="Nav" i]'
        ];

        for (const sel of ariaSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                const clickable = findClickableParent(el) || el;
                log('Нашел кнопку меню по aria-label: ' + sel);
                simulateClick(clickable);
                return true;
            }
        }

        // Стратегия 2: Ищем по data-testid
        const testIds = ['nav-menu-toggle', 'menu-toggle', 'mobile-menu-toggle', 'header-menu'];
        for (const tid of testIds) {
            const el = document.querySelector('[data-testid="' + tid + '"]');
            if (el) {
                const clickable = findClickableParent(el) || el;
                log('Нашел кнопку меню по data-testid: ' + tid);
                simulateClick(clickable);
                return true;
            }
        }

        // Стратегия 3: Ищем по классу (только если есть слова menu/nav/hamburger)
        const buttons = document.querySelectorAll('button, [role="button"]');
        for (const btn of buttons) {
            const cls = (btn.className || '').toLowerCase();
            if (cls.includes('menu') || cls.includes('nav') || cls.includes('hamburger') || cls.includes('toggle')) {
                log('Нашел кнопку меню по классу: ' + btn.className.substring(0, 50));
                simulateClick(btn);
                return true;
            }
        }

        // Стратегия 4: Ищем по SVG с тремя линиями (hamburger icon)
        for (const btn of buttons) {
            const svg = btn.querySelector('svg');
            if (svg) {
                const svgContent = svg.innerHTML || '';
                const pathCount = svg.querySelectorAll('path, line, rect').length;
                // Hamburger icon обычно имеет 3 линии или специфичные path
                if ((pathCount >= 2 && pathCount <= 4) ||
                    svgContent.toLowerCase().includes('menu') ||
                    svgContent.includes('M3') || svgContent.includes('M4') ||
                    svgContent.includes('hamburger')) {
                    log('Нашел кнопку меню по SVG (hamburger icon)');
                    simulateClick(btn);
                    return true;
                }
            }
        }

        log('Не удалось найти кнопку меню навигации');
        return false;
    }

    function clickMenuItemByText(texts) {
        // Ищем внутри открытого меню (sidebar/drawer)
        // Сначала пробуем найти элементы внутри меню
        const menuContainers = document.querySelectorAll('[role="menu"], [role="dialog"], [class*="sidebar" i], [class*="drawer" i], [class*="navigation" i], nav, aside');
        const elementsToSearch = menuContainers.length > 0 ?
            Array.from(menuContainers).flatMap(c => Array.from(c.querySelectorAll('a, button, [role="menuitem"], li, span'))) :
            Array.from(document.querySelectorAll('a, button, [role="menuitem"], li, span, div'));

        // Ищем точное совпадение
        for (const el of elementsToSearch) {
            const text = el.textContent.trim();
            // Проверяем что элемент видим
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            for (const search of texts) {
                const searchLower = search.toLowerCase();
                const textLower = text.toLowerCase();
                // Точное совпадение или начинается с искомого слова (для избежания "Спортсмены" = "Клубы")
                if (textLower === searchLower ||
                    textLower.startsWith(searchLower + ' ') ||
                    textLower.startsWith(searchLower + '\n')) {
                    log('Кликаю пункт меню: [' + text + ']');
                    simulateClick(el);
                    return true;
                }
            }
        }

        // Fallback: ищем по href содержащему /clubs/
        const clubLinks = document.querySelectorAll('a[href*="/clubs/"], a[href="/clubs"], a[href="/clubs/search"]');
        for (const link of clubLinks) {
            log('Кликаю ссылку на Клубы по href: ' + link.getAttribute('href'));
            simulateClick(link);
            return true;
        }

        return false;
    }

    function getClubLinksFromPage() {
        const links = document.querySelectorAll('a[href*="/clubs/"]');
        const clubs = [];
        const seen = new Set();

        for (const link of links) {
            const href = link.getAttribute('href') || '';
            // Ищем ID или slug клуба: /clubs/12345, /clubs/wildsiberia, /clubs/barnaul-cycling
            // Исключаем /clubs/search, /clubs/join, и другие системные пути
            const match = href.match(/\/clubs\/([a-zA-Z0-9_-]+)/);
            if (match) {
                const clubSlug = match[1];
                // Исключаем системные пути (создать, поиск, присоединиться)
                if (clubSlug === 'search' || clubSlug === 'join' || clubSlug === 'create' || clubSlug === 'new') continue;
                if (!seen.has(clubSlug)) {
                    seen.add(clubSlug);
                    clubs.push('/clubs/' + clubSlug);
                }
            }
        }

        log('Найдено ссылок на клубы: ' + clubs.length);
        clubs.forEach(c => log('  - ' + c));

        return clubs;
    }

    function findActivityTab() {
        const tabTexts = [
            'Recent Activity', 'Последняя тренировка', 'Недавняя активность', 'Активность клуба',
            'Recent', 'Activity', 'Активность', 'Тренировки', 'Activities',
            'Лента', 'Feed', 'Club Feed', 'Лента клуба', 'Последние'
        ];

        const selectors = [
            'a[href*="/recent_activity"]',
            'a[href*="/activity"]',
            '[role="tab"]',
            '[data-testid*="tab"]',
            '.tabs a',
            '.tab',
            'nav a',
            '[class*="tab"]',
            'button[class*="tab"]',
            '[role="button"]'
        ];

        for (const sel of selectors) {
            const tabs = document.querySelectorAll(sel);
            log('findActivityTab: по селектору ' + sel + ' найдено ' + tabs.length + ' элементов');
            for (const tab of tabs) {
                const text = (tab.textContent || '').trim();
                for (const search of tabTexts) {
                    if (text.toLowerCase().includes(search.toLowerCase())) {
                        log('findActivityTab: нашел вкладку [' + text + '] по селектору ' + sel);
                        return tab;
                    }
                }
            }
        }

        // Fallback: ищем по всем элементам
        log('findActivityTab: fallback — ищу по всем элементам...');
        const all = document.querySelectorAll('a, button, [role="tab"], div, span');
        for (const el of all) {
            const text = (el.textContent || '').trim();
            for (const search of tabTexts) {
                if (text.toLowerCase().includes(search.toLowerCase())) {
                    log('findActivityTab: fallback нашел [' + text + ']');
                    return el;
                }
            }
        }

        return null;
    }

    function isTabActive(tab) {
        if (!tab) return false;

        // Проверяем классические признаки активности
        const ariaSelected = tab.getAttribute('aria-selected') === 'true';
        const isActive = tab.classList.contains('active') ||
                         tab.classList.contains('selected') ||
                         tab.classList.contains('current');
        const ariaCurrent = tab.getAttribute('aria-current') === 'page' ||
                            tab.getAttribute('aria-current') === 'true';

        // Проверяем URL — если href вкладки совпадает с текущим URL
        const href = tab.getAttribute('href') || '';
        const currentPath = window.location.pathname;
        const isUrlMatch = href && (
            currentPath === href ||
            currentPath.includes(href.replace(/^\//, '')) ||
            href.includes('recent_activity') && currentPath.includes('recent_activity') ||
            href.includes('activity') && currentPath.includes('activity')
        );

        // Проверяем стили — активная вкладка может иметь border-bottom, font-weight и т.д.
        const style = window.getComputedStyle(tab);
        const hasActiveStyle = style.borderBottomWidth !== '0px' ||
                               style.fontWeight === 'bold' ||
                               style.fontWeight === '700' ||
                               parseInt(style.fontWeight) >= 600;

        // Проверяем data-атрибуты
        const dataActive = tab.getAttribute('data-active') === 'true' ||
                          tab.getAttribute('data-selected') === 'true';

        const result = ariaSelected || isActive || ariaCurrent || isUrlMatch || hasActiveStyle || dataActive;

        if (result) {
            log('Вкладка активна (aria=' + ariaSelected + ', class=' + isActive + ', url=' + isUrlMatch + ', style=' + hasActiveStyle + ', data=' + dataActive + ')');
        }

        return result;
    }

    function hasActivityFeed() {
        // Сначала проверяем URL — должно быть /recent_activity
        if (!window.location.pathname.includes('/recent_activity')) {
            return false;
        }
        // Ищем тренировки по ВСЕЙ странице — широкий поиск
        const selectors = [
            '[data-testid="web-feed-entry"]',
            '[data-testid="feed-entry"]',
            '.activity',
            'article',
            '[class*="activity" i]',
            '[class*="feed-entry" i]',
            '[class*="workout" i]',
            '[class*="training" i]'
        ];
        for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) return true;
        }
        return false;
    }

    async function goToNextClub() {
        // Не инкрементируем здесь — это делается в основном цикле
        log('Возвращаюсь к списку клубов...');
        // Очищаем имя клуба в Android (уходим со страницы клуба)
        try {
            if (typeof AndroidApp !== 'undefined' && AndroidApp.setClubName) {
                AndroidApp.setClubName("");
            }
        } catch(e) {}
        window.location.href = 'https://www.strava.com/clubs/search';
        // В фоне навигация не мгновенная — ждем чтобы цикл не продолжился на старой странице
        await sleep(3000);
    }

    async function scrollAndLikeClubFeed(clubUrl) {
        let totalLiked = 0;
        let scrollAttempts = 0;
        let lastY = window.scrollY;
        const maxScrolls = 50;
        // Используем глобальный likedActivities (сохраняется между рестартами бота)
        const processedCardIds = window.likedActivities;

        log('Начинаю лайкать тренировки в клубе...');

        const speed = getClubsDelay();

        // Скроллим вверх
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(1000);

        while (scrollAttempts < 3 && !window.kudosBotShouldStop) {
            // Находим все карточки активностей
            const cards = document.querySelectorAll('[data-testid="web-feed-entry"], [data-testid="feed-entry"]');
            log('Найдено карточек: ' + cards.length);

        let newCardsCount = 0;
        let skippedCardsCount = 0;
        let consecutiveAlreadyLiked = 0; // Счетчик подряд уже-лайкнутых
        const MAX_CONSECUTIVE_LIKED = window.consecutiveLikedLimit || 10; // Лимит подряд уже-лайкнутых (настраивается в настройках)

        for (const card of cards) {
                if (window.kudosBotShouldStop) break;

                // Получаем уникальный ID карточки
                const cardId = getActivityIdFromCard(card);
                if (cardId && processedCardIds.has(cardId)) {
                    skippedCardsCount++;
                    consecutiveAlreadyLiked++;
                    if (consecutiveAlreadyLiked >= MAX_CONSECUTIVE_LIKED) {
                        log('  🔁 ' + consecutiveAlreadyLiked + ' подряд тренировок уже лайкнуты (в global likedActivities). Ухожу в следующий клуб.');
                        return -1; // Сигнал: пора уходить в следующий клуб
                    }
                    continue;
                }
                if (cardId) processedCardIds.add(cardId);
                newCardsCount++;
                consecutiveAlreadyLiked = 0; // Новая карточка — сбрасываем счётчик

                // Проверяем — это своя тренировка?
                if (isOwnActivity(card)) {
                    log('  Пропускаю свою тренировку');
                    continue;
                }

                // Проверяем — не старше ли 3 дней?
                if (!isRecentActivity(card)) {
                    log('  Пропускаю — тренировка старше 3 дней');
                    continue;
                }

                // Скроллим к карточке
                card.scrollIntoView({ behavior: 'auto', block: 'center' });
                await sleep(Math.floor(Math.random() * (speed.max - speed.min)) + speed.min);

                // Находим кнопку лайка ВНУТРИ этой карточки
                const buttons = card.querySelectorAll('button');
                let kudosBtn = null;

                for (const btn of buttons) {
                    const testId = btn.getAttribute('data-testid') || '';
                    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const cls = (btn.className || '').toLowerCase();
                    const text = (btn.textContent || '').toLowerCase().trim();
                    const rect = btn.getBoundingClientRect();

                    // Пропускаем кнопки без размера или слишком большие
                    if (rect.width === 0 || rect.height === 0) continue;
                    if (rect.width > 200 || rect.height > 100) continue;

                    // Проверяем является ли кнопка лайком (ТОЛЬКО настоящая кнопка, не popup!)
                    let isKudos = false;
                    if (testId === 'kudos_button' || testId === 'un-kudos_button') isKudos = true;
                    else if (aria.includes('give') && aria.includes('kudos')) isKudos = true;
                    else if (rect.width <= 60 && rect.height <= 60 && !text) {
                        const svg = btn.querySelector('svg');
                        if (svg && (svg.innerHTML.toLowerCase().includes('heart') || svg.innerHTML.toLowerCase().includes('thumb'))) {
                            isKudos = true;
                        }
                    }

                    // ❌ ЯВНО исключаем give_kudos_button — это открывает popup!
                    if (testId === 'give_kudos_button') isKudos = false;

                    if (!isKudos) continue;

                    // Проверяем не лайкнут ли уже
                    const isLiked = testId === 'un-kudos_button' ||
                                     cls.includes('liked') ||
                                     cls.includes('active') ||
                                     (btn.querySelector('svg')?.getAttribute('fill') === '#fc5200');

                    if (!isLiked) {
                        kudosBtn = btn;
                        break;
                    }
                }

                if (!kudosBtn) {
                    log('  В карточке нет кнопки лайка (уже лайкнуто?)');
                    consecutiveAlreadyLiked++;
                    if (consecutiveAlreadyLiked >= MAX_CONSECUTIVE_LIKED) {
                        log('  🔁 ' + consecutiveAlreadyLiked + ' подряд тренировок уже лайкнуты. Ухожу в следующий клуб.');
                        return -1; // Сигнал: пора уходить в следующий клуб
                    }
                    continue;
                }

                // Кнопка найдена и не лайкнута — сбрасываем счетчик
                consecutiveAlreadyLiked = 0;

                // Проверяем URL
                if (!window.location.pathname.includes('/clubs/')) {
                    log('⚠️ Ушли со страницы клуба, возвращаюсь...');
                    window.location.href = 'https://www.strava.com' + clubUrl + '/recent_activity';
                    await sleep(2000);
                    return totalLiked;
                }

                const athlete = findAthleteNameFromCard(card);
                const btnInfo = kudosBtn.getAttribute('data-testid') || kudosBtn.tagName;
                const btnRect = kudosBtn.getBoundingClientRect();
                log('Лайкаю: ' + athlete + ' [кнопка:' + btnInfo + ' размер:' + Math.round(btnRect.width) + 'x' + Math.round(btnRect.height) + ']');

                // Пауза перед кликом
                // В режиме клубов используем clubs_speed, иначе общие настройки
                let min, max;
                if (window.location.pathname.includes('/clubs/') && window.clubsSpeed) {
                    const clubDelay = getClubsDelay();
                    min = clubDelay.min;
                    max = clubDelay.max;
                } else {
                    min = window.kudosMinDelay || 3000;
                    max = window.kudosMaxDelay || 8000;
                }
                const delay = Math.floor(Math.random() * Math.max(0, max - min)) + min;
                if (delay > 500) {
                    log('Пауза ' + (delay/1000).toFixed(1) + 'с...');
                    await sleep(delay);
                }

                if (window.kudosBotShouldStop) break;

                let likeSuccess = false;
                const actId = getActivityIdFromCard(card);

                // API v3 режим — ставим лайк через REST API вместо кликов
                if (window.useApiV3 && actId) {
                    log('API v3: ставлю лайк на активность ' + actId);
                    const result = await giveKudosViaAPI(actId);
                    if (result.success) {
                        likeSuccess = true;
                        window.likedActivities.add(actId);
                        log('✅ API Лайк: ' + athlete + ' (HTTP ' + result.status + ')');
                        updateStats(athlete);
                        totalLiked++;
                        consecutiveAlreadyLiked = 0;
                        await sleep(2000);
                    } else {
                        // Любая ошибка API — fallback на DOM клик
                        log('❌ API v3: ошибка ' + (result.error || result.status) + ', пробую DOM клик');
                        window.useApiV3 = false;
                        log('⚠️ Переключаюсь на обычные клики');
                        // Не ставим likeSuccess — пусть DOM клик ниже сработает
                    }
                }

                if (!likeSuccess) {
                    // Обычный режим — кликаем
                    let clicked = false;
                    for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
                        try {
                            simulateClick(kudosBtn);
                            clicked = true;
                        } catch(e) {
                            try { kudosBtn.click(); clicked = true; } catch(e2) {}
                        }
                        if (!clicked) {
                            await sleep(500);
                            const freshBtns = card.querySelectorAll('button');
                            for (const fb of freshBtns) {
                                if ((fb.getAttribute('data-testid') || '').includes('kudos')) {
                                    kudosBtn = fb;
                                    break;
                                }
                            }
                        }
                    }

                    if (clicked) {
                        if (actId) window.likedActivities.add(actId);
                        log('✅ Лайк: ' + athlete);
                        updateStats(athlete);
                        totalLiked++;
                        consecutiveAlreadyLiked = 0;
                        await sleep(2000);
                    } else {
                        log('❌ Не удалось кликнуть');
                    }
                }
            }

            log('Новых карточек: ' + newCardsCount + ', пропущено (уже обработано): ' + skippedCardsCount + ', лайкнуто: ' + totalLiked);

            // Если НЕТ новых карточек — клуб полностью обработан или лента закончилась
            if (newCardsCount === 0) {
                log('Все видимые карточки уже обработаны, ухожу в следующий клуб');
                return -2; // Сигнал: все карточки уже обработаны
            }

            // Прокручиваем вниз для загрузки новых
            window.scrollBy({ top: 800, behavior: 'auto' });
            await sleep(2000);
            scrollAttempts++;

            if (window.scrollY === lastY) {
                log('Конец ленты');
                break;
            }
            lastY = window.scrollY;
        }

        log('Всего лайкнуто в клубе: ' + totalLiked + ', скроллов: ' + scrollAttempts);
        return totalLiked;
    }

    function findAthleteNameFromCard(card) {
        try {
            const nameEl = card.querySelector('[data-testid="owners-name"]') ||
                          card.querySelector('a[href*="/athletes/"]') ||
                          card.querySelector('strong a');
            return nameEl ? nameEl.textContent.trim().substring(0, 25) : "Неизвестный";
        } catch(e) { return "Неизвестный"; }
    }

    function getActivityIdFromCard(card) {
        try {
            const link = card.querySelector('a[href*="/activities/"]');
            if (link) {
                const match = link.href.match(/\/activities\/(\d+)/);
                if (match) return match[1];
            }
            return card.getAttribute('data-testid') || card.id;
        } catch(e) { return null; }
    }

    // МОБИЛЬНЫЙ API: эмулируем приложение Strava с JWT + Api-Key
    const STRAVA_API_KEY = '0aeb41212aef4bddb762dd34c45e941f';
    const STRAVA_JWT_SECRET = '988828734992e740390855f07e4ff76648a15e4b42cb1d648bd604c82303da9f0f59afdf07053b7a9c89bfacd67f1402450aa2c3f3a1e2a1765bd51a645cbc26';

    // Получаем athleteId из cookies, HTML или JavaScript
    function getAthleteId() {
        try {
            // 1. Пробуем из cookies strava_remember_token
            const match = document.cookie.match(/strava_remember_token=([^;]+)/);
            if (match) {
                const parts = match[1].split('_');
                if (parts.length >= 2) return parts[1];
            }

            // 2. Пробуем из cookies strava_remember_id
            const rememberId = document.cookie.match(/strava_remember_id=([^;]+)/);
            if (rememberId) return rememberId[1];

            // 3. Пробуем из meta тегов
            const meta = document.querySelector('meta[name="athlete-id"]');
            if (meta) return meta.getAttribute('content');

            // 4. Пробуем из window object
            if (window.__ATHLETE_ID__) return window.__ATHLETE_ID__;

            // 5. Пробуем из window.STRAVA
            if (window.STRAVA && window.STRAVA.ATHLETE_ID) return window.STRAVA.ATHLETE_ID;

            // 6. Пробуем из localStorage
            try {
                const ls = localStorage.getItem('strava_auth');
                if (ls) {
                    const auth = JSON.parse(ls);
                    if (auth.athlete_id) return auth.athlete_id;
                }
            } catch(e) {}

            // 7. Пробуем найти в HTML
            const html = document.documentElement.innerHTML;
            const idMatch = html.match(/"athlete_id":(\d+)/) || html.match(/"current_user_id":(\d+)/);
            if (idMatch) return idMatch[1];

            // 8. Пробуем из ссылок на профиль
            const profileLink = document.querySelector('a[href^="/athletes/"]');
            if (profileLink) {
                const href = profileLink.getAttribute('href');
                const idMatch2 = href.match(/\/athletes\/(\d+)/);
                if (idMatch2) return idMatch2[1];
            }

        } catch(e) {
            log('Ошибка получения athleteId: ' + e.message);
        }
        return null;
    }

    // Генерация JWT с Web Crypto API
    async function generateJWT(athleteId) {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Web Crypto API не доступен');
        }

        const now = Math.floor(Date.now() / 1000);
        const exp = now + 300; // 5 минут

        const header = { alg: 'HS256', typ: 'JWT' };
        const payload = { userId: athleteId.toString(), iat: now, exp: exp };

        const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

        const headerB64 = encode(header);
        const payloadB64 = encode(payload);
        const message = headerB64 + '.' + payloadB64;

        // HMAC-SHA256 с использованием Web Crypto API
        const encoder = new TextEncoder();
        const keyData = encoder.encode(STRAVA_JWT_SECRET);
        const messageData = encoder.encode(message);

        const cryptoKey = await crypto.subtle.importKey(
            'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
        const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
            .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

        return message + '.' + signatureB64;
    }

    // Мобильный API: ставим лайк как приложение Strava
    // Получаем CSRF token из meta tag
    function getCSRFToken() {
        try {
            const meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) return meta.content;

            // Пробуем из cookies
            const match = document.cookie.match(/csrf_token=([^;]+)/);
            if (match) return match[1];

            return null;
        } catch(e) {
            return null;
        }
    }

    async function giveKudosViaAPI(activityId) {
        const csrfToken = getCSRFToken();
        if (!csrfToken) {
            log('❌ API: CSRF token не найден');
            return { success: false, error: 'no_csrf' };
        }

        log('API: использую endpoint /feed/activity/' + activityId + '/kudo');

        try {
            const response = await fetch(`https://www.strava.com/feed/activity/${activityId}/kudo`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                    'x-csrf-token': csrfToken,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': 'https://www.strava.com/',
                    'Origin': 'https://www.strava.com'
                }
            });

            const text = await response.text();
            log('API: HTTP ' + response.status + ' ' + text.substring(0, 200));

            if (response.status === 200 && text.includes('"success":"true"')) {
                return { success: true, status: response.status };
            } else if (response.status === 429 || text.includes('"success":"false"')) {
                return { success: false, error: 'ratelimit', status: response.status };
            } else {
                return { success: false, error: 'http_' + response.status, status: response.status };
            }
        } catch(e) {
            log('API: ошибка ' + e.message);
            return { success: false, error: 'exception' };
        }
    }

    function getCurrentUserName() {
        // Получаем имя текущего пользователя со страницы
        try {
            // Ищем в шапке сайта (обычно там аватар + имя)
            const userLinks = document.querySelectorAll('a[href*="/athletes/"]');
            for (const link of userLinks) {
                const href = link.getAttribute('href') || '';
                // Исключаем ссылки на других атлетов (содержат ID)
                if (href.match(/\/athletes\/(\d+)$/)) {
                    // Это может быть текущий пользователь — берем текст
                    const text = link.textContent.trim();
                    if (text && text.length > 1 && text.length < 50) {
                        return text;
                    }
                }
            }

            // Ищем в меню навигации
            const menuItems = document.querySelectorAll('[class*="nav"] a, [class*="menu"] a, [class*="user"] a');
            for (const item of menuItems) {
                const text = item.textContent.trim();
                if (text && text.length > 1 && text.length < 50) {
                    return text;
                }
            }

            // Ищем в заголовке или профиле
            const profileEl = document.querySelector('[data-testid="profile-name"], .profile-name, [class*="username" i]');
            if (profileEl) {
                return profileEl.textContent.trim();
            }

            return null;
        } catch(e) {
            return null;
        }
    }

    function getActivityOwnerId(card) {
        try {
            const ownerLink = card.querySelector('[data-testid="owners-name"] a[href*="/athletes/"]')
                || card.querySelector('a[href*="/athletes/"]');
            if (!ownerLink) return null;
            const href = ownerLink.getAttribute('href') || ownerLink.href || '';
            const match = href.match(/\/athletes\/(\d+)/);
            return match ? match[1] : null;
        } catch(e) {
            return null;
        }
    }

    function isOwnActivity(card) {
        // Проверяем это тренировка текущего пользователя.
        // В обычной ленте свои активности могут иметь кнопку give_kudos_button,
        // которая открывает диалог зачётов. Их нужно пропускать до поиска кнопок.
        try {
            const currentAthleteId = getAthleteId ? getAthleteId() : null;
            const ownerId = getActivityOwnerId(card);
            if (currentAthleteId && ownerId && currentAthleteId.toString() === ownerId.toString()) {
                log(` Пропускаю свою тренировку (ownerId=${ownerId})`);
                return true;
            }

            const athleteName = findAthleteNameFromCard(card);
            const currentUser = getCurrentUserName();
            if (!currentUser || !athleteName) return false;

            if (athleteName.trim().toLowerCase() === currentUser.trim().toLowerCase()) {
                log(` Пропускаю свою тренировку: ${athleteName}`);
                return true;
            }

            return false;
        } catch(e) {
            return false;
        }
    }

    function isRecentActivity(card) {
        // Проверяем дату тренировки в карточке — не старше 3 дней (72 часа)
        try {
            // Ищем элемент с временем/датой (обычно рядом с именем атлета)
            const timeEl = card.querySelector('time') ||
                          card.querySelector('[data-testid*="time" i]') ||
                          card.querySelector('.timestamp') ||
                          card.querySelector('[class*="time" i]') ||
                          card.querySelector('span[class*="date" i]') ||
                          card.querySelector('span');

            if (!timeEl) return true; // Если не нашли дату — лайкаем на всякий случай

            const timeText = timeEl.textContent.trim().toLowerCase();

            // "just now", "now" — прямо сейчас
            if (timeText.includes('just now') || timeText === 'now') return true;

            // Содержит "ago" — "2 hours ago", "1 day ago", "3 days ago"
            if (timeText.includes('ago')) {
                // Извлекаем число
                const match = timeText.match(/(\d+)\s*(hour|hr|h|day|d)/);
                if (match) {
                    const num = parseInt(match[1]);
                    const unit = match[2];
                    if (unit.startsWith('h') || unit.startsWith('hr')) {
                        return num <= 72; // часы
                    } else if (unit.startsWith('d') || unit === 'day') {
                        return num <= 3; // дни
                    }
                }
                // "hours ago", "days ago" без числа (редко) — считаем свежим
                if (timeText.includes('hour') || timeText.includes('hr')) return true;
                if (timeText.includes('day')) {
                    // "a day ago" — 1 день
                    return !timeText.includes('days') || timeText.includes('1 day');
                }
                return true;
            }

            // Формат "2h", "5h", "1d", "2d" (сокращенный)
            const shortMatch = timeText.match(/^(\d+)([hd])$/);
            if (shortMatch) {
                const num = parseInt(shortMatch[1]);
                const unit = shortMatch[2];
                if (unit === 'h') return num <= 72;
                if (unit === 'd') return num <= 3;
            }

            // "yesterday" — 1 день
            if (timeText.includes('yesterday')) return true;

            // "today" — сегодня
            if (timeText.includes('today')) return true;

            // Формат "May 20", "Jun 15", "Dec 1" — сравниваем с текущей датой
            const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const monthMatch = timeText.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d+)/i);
            if (monthMatch) {
                const monthIdx = monthNames.indexOf(monthMatch[1].toLowerCase().substring(0, 3));
                const day = parseInt(monthMatch[2]);
                const now = new Date();
                const currentYear = now.getFullYear();
                const activityDate = new Date(currentYear, monthIdx, day);

                // Если дата в будущем (например, декабрь в январе), берем прошлый год
                if (activityDate > now) {
                    activityDate.setFullYear(currentYear - 1);
                }

                const diffHours = (now - activityDate) / (1000 * 60 * 60);
                return diffHours <= 72; // 3 дня = 72 часа
            }

            // Числовой формат "20.05", "05/20" (день.месяц или месяц/день)
            const numericMatch = timeText.match(/(\d{1,2})[\/\.\-](\d{1,2})/);
            if (numericMatch) {
                const now = new Date();
                const currentYear = now.getFullYear();
                // Пробуем оба формата: день.месяц и месяц.день
                let d1 = parseInt(numericMatch[1]);
                let d2 = parseInt(numericMatch[2]);

                // Если первое число > 12 — это скорее день
                let day, month;
                if (d1 > 12) {
                    day = d1; month = d2 - 1;
                } else if (d2 > 12) {
                    day = d2; month = d1 - 1;
                } else {
                    // Неоднозначно — пробуем оба варианта, берем ближайший к сегодня
                    const date1 = new Date(currentYear, d2 - 1, d1);
                    const date2 = new Date(currentYear, d1 - 1, d2);
                    const diff1 = Math.abs(now - date1);
                    const diff2 = Math.abs(now - date2);
                    const activityDate = diff1 < diff2 ? date1 : date2;
                    const diffHours = (now - activityDate) / (1000 * 60 * 60);
                    return diffHours <= 72;
                }

                const activityDate = new Date(currentYear, month, day);
                const diffHours = (now - activityDate) / (1000 * 60 * 60);
                return diffHours <= 72;
            }

            // Если не распарсили — лайкаем на всякий случай
            log('  Не распарсил дату: [' + timeText + '], лайкаю на всякий случай');
            return true;

        } catch(e) {
            log('  Ошибка при проверке даты: ' + e.message);
            return true; // При ошибке — лайкаем
        }
    }

    // ====== НАВИГАЦИЯ ПО ЛЕНТАМ ======

    function getPageFeeds() {
        // Ищем кнопку/ссылку выбора ленты в верхней части страницы
        const candidates = [];

        // Ищем элементы в верхней части страницы (первые 200px)
        const allElements = document.querySelectorAll('button, a, div, span, [role="button"]');
        for (const el of allElements) {
            const rect = el.getBoundingClientRect();
            if (rect.top > 200) continue; // Только верх страницы
            if (rect.width < 50 || rect.height < 20) continue;

            const text = (el.textContent || '').trim();
            const lower = text.toLowerCase();

            // Ищем текст типа "Following", "Подписки", "My Clubs", "Мои группы", имя клуба
            if (lower === 'following' || lower === 'подписки' ||
                lower === 'my clubs' || lower === 'мои группы' ||
                lower === 'your clubs' || lower === 'мои клубы' ||
                lower.includes('clubs') || lower.includes('клубы') ||
                lower.includes('feed') || lower.includes('лента')) {
                candidates.push({ el, text, rect });
            }
        }

        // Возвращаем кандидатов, отсортированных по Y (сверху вниз)
        return candidates.sort((a, b) => a.rect.top - b.rect.top);
    }

    async function clickFeedSelector() {
        log("🔍 Ищу селектор лент (кликабельный заголовок 'Подписки')...");

        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(500);

        // СТРАТЕГИЯ: Ищем кликабельный элемент с текстом ленты в заголовке
        // Это может быть: button, div[onclick], span внутри button, и т.д.

        const selectors = [
            'button', '[role="button"]', 'div[onclick]', 'a[onclick]',
            'div', 'span', 'h1', 'h2', 'h3', 'p', 'a'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);

            for (const el of elements) {
                const rect = el.getBoundingClientRect();
                // Только видимые элементы в верхней части страницы
                if (rect.top < 0 || rect.top > 300) continue;
                if (rect.width < 50 || rect.height < 15) continue;
                if (rect.width > 400) continue; // Не слишком широкие

                const text = (el.textContent || '').trim();
                const lower = text.toLowerCase();

                // Ищем текст который точно является названием ленты
                const isFeedTitle = lower === 'подписки' ||
                                    lower === 'following' ||
                                    lower === 'мои тренировки' ||
                                    lower === 'my activities' ||
                                    lower === 'feeds' ||
                                    lower.includes('altay') ||
                                    lower.includes('wild siberia') ||
                                    lower.includes('barnaul') ||
                                    lower.includes('барнаул') ||
                                    lower.includes('yolochka') ||
                                    lower.includes('лыжи');

                if (!isFeedTitle) continue;

                // Проверяем что элемент кликабельный
                const isClickable = el.tagName === 'BUTTON' ||
                                     el.tagName === 'A' ||
                                     el.getAttribute('role') === 'button' ||
                                     el.onclick ||
                                     el.getAttribute('onclick') ||
                                     el.style.cursor === 'pointer' ||
                                     window.getComputedStyle(el).cursor === 'pointer' ||
                                     el.getAttribute('aria-expanded') !== null ||
                                     el.getAttribute('tabindex') !== null;

                // Если сам элемент не кликабельный — проверим родителя
                if (!isClickable) {
                    let parent = el.parentElement;
                    let depth = 0;
                    while (parent && depth < 3) {
                        const parentClickable = parent.tagName === 'BUTTON' ||
                                                parent.tagName === 'A' ||
                                                parent.getAttribute('role') === 'button' ||
                                                parent.onclick ||
                                                parent.getAttribute('onclick') ||
                                                parent.getAttribute('aria-expanded') !== null;
                        if (parentClickable) {
                            log('   🎯 Найден кликабельный родитель для [' + text + ']: ' + parent.tagName);
                            directClick(parent);
                            await sleep(1500);
                            return true;
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                } else {
                    log('   🎯 Найден кликабельный элемент [' + text + ']: ' + el.tagName);
                    directClick(el);
                    await sleep(1500);
                    return true;
                }
            }
        }

        // Fallback: если не нашли кликабельный элемент — кликаем на первый видимый "Подписки"
        const allText = document.querySelectorAll('*');
        for (const el of allText) {
            const rect = el.getBoundingClientRect();
            if (rect.top < 0 || rect.top > 200) continue;

            const text = (el.textContent || '').trim().toLowerCase();
            if (text === 'подписки' || text === 'following') {
                log('   🎯 Fallback: кликаю на [' + el.textContent.trim() + ']');
                directClick(el);
                await sleep(1500);
                return true;
            }
        }

        log("❌ Селектор лент не найден.");
        return false;
    }

    function getFeedOptions() {
        const options = [];

        // ШАГ 1: Ищем открытый dropdown/menu
        let menuEl = null;

        // Пробуем разные селекторы для dropdown
        const menuSelectors = [
            '[role="menu"]',
            '[role="listbox"]',
            '[class*="dropdown-menu" i]',
            '[class*="menu-list" i]',
            '[class*="dropdown" i]',
            '[class*="popover" i]',
            '[class*="overlay" i]',
            '[data-testid*="menu" i]',
            '[data-testid*="dropdown" i]',
            '[data-testid*="popover" i]',
            'ul[class]',
            'div[class*="menu" i]',
            'div[class*="list" i]',
        ];

        for (const sel of menuSelectors) {
            try {
                const elements = document.querySelectorAll(sel);
                for (const el of elements) {
                    const style = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();

                    // Должен быть видимым и иметь разумные размеры
                    if (style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        el.children.length > 0 &&
                        rect.width > 50 &&
                        rect.height > 30) {
                        menuEl = el;
                        log(`📂 Найден dropdown контейнер: ${sel}, дочерних: ${el.children.length}, размер: ${Math.round(rect.width)}x${Math.round(rect.height)}`);
                        break;
                    }
                }
                if (menuEl) break;
            } catch(e) {}
        }

        // ШАГ 2: Если нашли контейнер — собираем опции
        if (menuEl) {
            // Ищем прямые дочерние элементы (li, button, a, div с role)
            const directChildren = menuEl.querySelectorAll(':scope > li, :scope > button, :scope > a, :scope > div, :scope > span');
            log(`  Прямых дочерних элементов: ${directChildren.length}`);

            for (const child of directChildren) {
                const text = (child.textContent || '').trim();

                // Пропускаем пустые
                if (!text || text.length === 0) continue;

                // Получаем href если есть
                let href = child.getAttribute('href') || '';
                if (!href) {
                    const linkInside = child.querySelector('a');
                    if (linkInside) href = linkInside.getAttribute('href') || '';
                }

                log('    📋 Опция: [' + text + '] (href=' + (href || 'none') + ')');
                options.push({ el: child, text, href });
            }

            // Если прямые дочерние не нашли — ищем вложенные li
            if (options.length === 0) {
                const listItems = menuEl.querySelectorAll('li');
                for (const li of listItems) {
                    const text = (li.textContent || '').trim();
                    if (!text || text.length === 0 || text.length > 100) continue;

                    let href = li.getAttribute('href') || '';
                    const linkInside = li.querySelector('a');
                    if (linkInside) href = linkInside.getAttribute('href') || '';

                    if (!options.find(o => o.text === text)) {
                        options.push({ el: li, text, href });
                    }
                }
            }
        }

        // ШАГ 3: Фильтруем — оставляем только те что похожи на названия лент
        // (исключаем настройки, профиль и т.д.)
        const filteredOptions = options.filter(opt => {
            const text = opt.text.toLowerCase();
            // Исключаем элементы управления (стрелки, иконки без текста)
            if (opt.text.length < 2) return false;
            // Исключаем технические элементы
            if (text.includes('loading') || text.includes('загрузка')) return false;
            return true;
        });

        // Убираем дубликаты по тексту
        const uniqueOptions = [];
        const seenTexts = new Set();
        for (const opt of filteredOptions) {
            if (!seenTexts.has(opt.text)) {
                seenTexts.add(opt.text);
                uniqueOptions.push(opt);
            }
        }

        log(`📊 Всего уникальных опций в dropdown: ${uniqueOptions.length}`);
        uniqueOptions.forEach((o, i) => log('  ' + (i+1) + '. [' + o.text + ']'));

        return uniqueOptions;
    }

    async function switchToFeed(feedOption) {
        log(`🔄 Переключаюсь на: ${feedOption.text}`);

        // Запоминаем текущую позицию скролла
        const oldScrollY = window.scrollY;
        const oldUrl = window.location.pathname;

        // Кликаем на опцию (прямой клик для dropdown элементов)
        directClick(feedOption.el);

        // Ждем пока контент загрузится
        await sleep(1000);

        // Проверяем, изменилось ли что-то
        const newScrollY = window.scrollY;
        const newUrl = window.location.pathname;

        if (newUrl !== oldUrl) {
            log(`✅ URL изменился: ${oldUrl} → ${newUrl}`);
            return true;
        }

        if (Math.abs(newScrollY - oldScrollY) > 50) {
            log(`✅ Скролл изменился`);
            return true;
        }

        // Проверяем, изменился ли DOM
        const hasNewContent = document.querySelector('[data-testid="web-feed-entry"]') !== null;
        if (hasNewContent) {
            log(`✅ Контент обновлен`);
            return true;
        }

        log(`⚠️ Переключение может не сработать`);
        return false;
    }

    // ===== ДИАГНОСТИКА СТРАНИЦЫ =====

    function diagnosePage() {
        log("🔬 ДИАГНОСТИКА СТРАНИЦЫ:");
        log(`  URL: ${window.location.href}`);
        log(`  Path: ${window.location.pathname}`);

        // Все кликабельные элементы
        const allClickable = document.querySelectorAll('a, button, [role="button"], [onclick]');
        log(`  Всего кликабельных: ${allClickable.length}`);

        // Элементы в верхней части (первые 300px)
        let topElements = [];
        for (const el of allClickable) {
            const rect = el.getBoundingClientRect();
            if (rect.top < 300 && rect.width > 30 && rect.height > 20) {
                const text = (el.textContent || '').trim().substring(0, 50);
                const href = el.getAttribute('href') || '';
                topElements.push({ text, href, tag: el.tagName, top: Math.round(rect.top), id: el.id, class: el.className?.substring(0, 50) });
            }
        }
        log(`  Элементов в верхней части: ${topElements.length}`);
        topElements.slice(0, 10).forEach(e => log('    - [' + e.text + '] (' + e.tag + ') href=' + e.href + ' top=' + e.top));

        // Все ссылки на клубы
        const clubLinks = document.querySelectorAll('a[href*="/clubs/"]');
        log(`  Ссылок на клубы: ${clubLinks.length}`);
        const uniqueClubs = new Map();
        for (const link of clubLinks) {
            const href = link.getAttribute('href') || '';
            const text = (link.textContent || '').trim().substring(0, 40);
            if (!uniqueClubs.has(href)) {
                uniqueClubs.set(href, text);
            }
        }
        uniqueClubs.forEach((text, href) => log('    - ' + href + ': [' + text + ']'));

        // Все ссылки на dashboard
        const dashLinks = document.querySelectorAll('a[href*="dashboard"]');
        log(`  Ссылок на dashboard: ${dashLinks.length}`);

        // Элементы с aria-expanded (dropdown toggles)
        const toggles = document.querySelectorAll('[aria-expanded]');
        log(`  Toggle элементов (aria-expanded): ${toggles.length}`);
        for (const t of toggles) {
            const text = (t.textContent || '').trim().substring(0, 40);
            const expanded = t.getAttribute('aria-expanded');
            log('    - [' + text + '] expanded=' + expanded);
        }

        return { topElements, clubLinks: Array.from(uniqueClubs.entries()) };
    }

    function findAllFeedsOnPage() {
        const feeds = [];

        // 1. Ищем в верхней части элементы с текстом "Подписки", "Following" и т.д.
        const allElements = document.querySelectorAll('a, button, div, span, li');
        for (const el of allElements) {
            const text = (el.textContent || '').trim();
            const lower = text.toLowerCase();
            const href = el.getAttribute('href') || '';

            // Ищем основную ленту
            if ((lower === 'following' || lower === 'подписки') && text.length < 20) {
                if (!feeds.find(f => f.type === 'main')) {
                    feeds.push({ type: 'main', text, href, el });
                }
            }
        }

        // 2. Ищем все ссылки на клубы (/clubs/ID/dashboard или /clubs/ID)
        const allLinks = document.querySelectorAll('a');
        for (const link of allLinks) {
            const href = link.getAttribute('href') || '';
            const text = (link.textContent || '').trim();

            // Пропускаем ссылки на поиск, настройки и т.д.
            if (href.includes('/search') || href.includes('/settings')) continue;

            // Ищем ссылки на ленты клубов
            const clubMatch = href.match(/\/clubs\/(\d+)(?:\/dashboard)?/);
            if (clubMatch) {
                const clubId = clubMatch[1];
                if (!feeds.find(f => f.clubId === clubId)) {
                    feeds.push({ type: 'club', clubId, text: text || `Club ${clubId}`, href, el: link });
                }
            }

            // Ищем ссылки на основной dashboard
            if ((href === '/dashboard' || href === '/dashboard/following') &&
                !feeds.find(f => f.type === 'main')) {
                feeds.push({ type: 'main', text: text || 'Following', href, el: link });
            }
        }

        // 3. Если основную ленту не нашли — добавляем принудительно
        if (!feeds.find(f => f.type === 'main')) {
            feeds.unshift({ type: 'main', text: 'Following', href: '/dashboard', el: null });
        }

        return feeds;
    }

    async function navigateToFeed(feed) {
        log(`🧭 Навигация на: ${feed.text} (${feed.href || 'no href'})`);

        if (feed.el) {
            // Пробуем кликнуть на элемент
            log(`  Пробую клик на элемент...`);

            // Скроллим к элементу если нужно
            const rect = feed.el.getBoundingClientRect();
            if (rect.top > window.innerHeight || rect.bottom < 0) {
                feed.el.scrollIntoView({ behavior: 'auto', block: 'center' });
                await sleep(500);
            }

            // Запоминаем URL до клика
            const beforeUrl = window.location.href;

            // Кликаем
            directClick(feed.el);
            await sleep(1000);

            // Проверяем, изменился ли URL
            if (window.location.href !== beforeUrl) {
                log(`  ✅ URL изменился: ${beforeUrl} → ${window.location.href}`);
                return true;
            }

            log(`  ⚠️ URL не изменился после клика`);
        }

        // Fallback: переход по URL
        if (feed.href && feed.href !== window.location.pathname) {
            const targetUrl = feed.href.startsWith('http') ? feed.href : 'https://www.strava.com' + feed.href;
            log(`  🌐 Переход по URL: ${targetUrl}`);
            window.location.href = targetUrl;
            await sleep(1500);
            return true;
        }

        log(`  ℹ️ Уже на нужной странице`);
        return true;
    }

    async function runClubsStrategy() {
        log('=== Запускаю стратегию: РОТАЦИЯ КЛУБОВ (через меню) ===');

        const url = window.location.pathname;

        // Проверка системных страниц - сброс и редирект
        if (url === '/clubs/new' || url === '/clubs/create' || url === '/clubs/join') {
            log('На системной странице ' + url + ', сбрасываю данные и перехожу на поиск');
            try {
                localStorage.removeItem('sk_visited');
                localStorage.removeItem('sk_index');
                localStorage.removeItem('sk_clubs');
            } catch(e) {}
            window.location.href = 'https://www.strava.com/clubs/search';
            await sleep(1000);
            return;
        }

        // === ФАЗА 1: Нужно открыть меню и перейти в Клубы ===
        if (!url.startsWith('/clubs')) {
            log('Открываю меню навигации...');
            const menuOpened = clickSandwichMenu();
            if (menuOpened) {
                await sleep(1000);

                // Проверяем, открылось ли меню (ищем пункты меню на странице)
                const menuItems = document.querySelectorAll('[role="menuitem"], nav a, aside a, [class*="sidebar"] a, [class*="drawer"] a');
                log('Найдено пунктов меню на странице: ' + menuItems.length);

                // Пробуем найти и кликнуть "Клубы" в меню
                const menuTexts = ['Клубы', 'Clubs', 'Мои клубы', 'My Clubs', 'Your Clubs'];
                if (clickMenuItemByText(menuTexts)) {
                    log('Кликнул на пункт Клубы, жду перехода...');
                    await sleep(2000);

                    // Проверяем, изменился ли URL
                    if (window.location.pathname.startsWith('/clubs')) {
                        log('Успешно перешел в Клубы!');
                        // URL изменился, бот будет перезапущен автоматически
                        return;
                    } else {
                        log('URL не изменился после клика, пробую прямой переход');
                    }
                } else {
                    log('Не удалось найти пункт "Клубы" в меню');
                }
            } else {
                log('Не удалось открыть меню навигации');
            }

            // Fallback: прямой переход
            log('Прямой переход на /clubs/search...');
            window.location.href = 'https://www.strava.com/clubs/search';
            await sleep(2000);
            return;
        }

        // === ФАЗА 2: На странице поиска/списка клубов ===
        if (url === '/clubs/search' || url === '/clubs') {
            log('На странице поиска клубов');

            // Загружаем сохраненный список
            let clubs = [];
            try {
                const saved = localStorage.getItem('sk_clubs');
                if (saved) clubs = JSON.parse(saved);
            } catch(e) {}

            let visited = [];
            try {
                const savedVisited = localStorage.getItem('sk_visited');
                if (savedVisited) visited = JSON.parse(savedVisited);
            } catch(e) {}
            const visitedSet = new Set(visited);

            let currentIndex = parseInt(localStorage.getItem('sk_index') || '0');

            // Проверяем — есть ли уже список клубов с непосещенными?
            const hasUnvisited = clubs.length > 0 && clubs.some(c => !visitedSet.has(c));

            if (!hasUnvisited) {
                // Нужно собрать/обновить список — скроллим
                log('Собираю клубы со страницы...');
                let scrollAttempts = 0;
                let lastScrollY = window.scrollY;
                const maxScrollAttempts = 20;

                while (scrollAttempts < maxScrollAttempts) {
                    const found = getClubLinksFromPage();
                    let newClubsFound = 0;

                    if (found.length > 0) {
                        for (const club of found) {
                            if (!clubs.includes(club)) {
                                clubs.push(club);
                                newClubsFound++;
                            }
                        }

                        if (newClubsFound > 0) {
                            localStorage.setItem('sk_clubs', JSON.stringify(clubs));
                            log('Найдено новых клубов: ' + newClubsFound + ', всего: ' + clubs.length);
                        }
                    }

                    // Прокручиваем вниз для загрузки еще
                    window.scrollBy({ top: 800, behavior: 'auto' });
                    await sleep(1000);
                    scrollAttempts++;

                    // Проверяем, изменился ли скролл
                    if (window.scrollY === lastScrollY) {
                        log('Конец списка клубов (скролл не изменился)');
                        break;
                    }
                    lastScrollY = window.scrollY;
                }
            } else {
                log('Список клубов уже есть (' + clubs.length + '), пропускаю скролл');
            }

            log('Всего клубов в списке: ' + clubs.length);

            // Если список пуст — ждем и пробуем снова
            if (clubs.length === 0) {
                log('Клубы не найдены. Жду 10с и пробую снова...');
                await sleep(3000);
                return;
            }

            // Проверяем, все ли клубы посещены
            const allVisited = clubs.every(club => visitedSet.has(club));
            if (allVisited) {
                log('Все ' + clubs.length + ' клубов уже посещены, сбрасываю для нового цикла');
                visited = [];
                visitedSet.clear();
                localStorage.setItem('sk_visited', JSON.stringify([]));
                currentIndex = 0;
            }

            // Если индекс за пределами — сбрасываем
            if (currentIndex >= clubs.length) {
                currentIndex = 0;
            }

            // Находим следующий непосещенный клуб
            let nextClub = null;
            let startIndex = currentIndex;
            let checked = 0;

            while (checked < clubs.length) {
                const idx = (startIndex + checked) % clubs.length;
                const club = clubs[idx];
                if (!visitedSet.has(club)) {
                    nextClub = club;
                    currentIndex = idx;
                    break;
                }
                checked++;
            }

            if (nextClub) {
                log('Перехожу в клуб #' + (currentIndex + 1) + ' из ' + clubs.length + ': ' + nextClub);
                localStorage.setItem('sk_index', currentIndex.toString());

                // ВСЕГДА прямой переход — надежнее чем клик по ссылке на скроллящейся странице
                log('Прямой переход в клуб: ' + nextClub);
                window.location.href = 'https://www.strava.com' + nextClub;
                await sleep(2000);
                return;
            } else {
                log('Все клубы пройдены! Сбрасываю и начинаю заново.');
                localStorage.removeItem('sk_clubs');
                localStorage.removeItem('sk_visited');
                localStorage.setItem('sk_index', '0');
                window.scrollTo(0, 0);
                await sleep(2000);
                return;
            }
        }

        // === ФАЗА 3: На странице конкретного клуба /clubs/XXX ===
        const clubMatch = url.match(/\/clubs\/([a-zA-Z0-9_-]+)/);
        if (clubMatch) {
            const clubId = clubMatch[1];
            // Пропускаем системные пути
            if (clubId === 'search' || clubId === 'join' || clubId === 'create' || clubId === 'new') {
                log('На системной странице /clubs/' + clubId + ', пропускаю');
                window.location.href = 'https://www.strava.com/clubs/search';
                await sleep(1000);
                return;
            }
            const clubUrl = '/clubs/' + clubId;
            log('В клубе #' + clubId);
            // Передаем имя клуба в Android
            try {
                if (typeof AndroidApp !== 'undefined' && AndroidApp.setClubName) {
                    AndroidApp.setClubName(clubId);
                }
            } catch(e) {}

            // Отмечаем как посещенный
            let visited = [];
            try {
                const savedVisited = localStorage.getItem('sk_visited');
                if (savedVisited) visited = JSON.parse(savedVisited);
            } catch(e) {}
            if (!visited.includes(clubUrl)) {
                visited.push(clubUrl);
                localStorage.setItem('sk_visited', JSON.stringify(visited));
            }

            // Инкрементируем индекс для следующего выбора (чтобы не заходить в тот же клуб)
            let currentIdx = parseInt(localStorage.getItem('sk_index') || '0');
            currentIdx = (currentIdx + 1); // Просто инкремент, корректировка произойдет в Фазе 2
            localStorage.setItem('sk_index', currentIdx.toString());
            log('Инкрементировал sk_index до ' + currentIdx + ' для следующего клуба');

            // Даем React время отрендерить DOM
            log('Жду загрузку DOM клуба...');
            await sleep(1000);

            // Проверяем URL — если не /recent_activity, нужно кликнуть вкладку
            if (!window.location.pathname.includes('/recent_activity')) {
                log('Не на вкладке тренировок (URL: ' + window.location.pathname + '), ищу вкладку...');

                // Ищем и кликаем вкладку активности
                const tab = findActivityTab();
                if (tab) {
                    log('Кликаю на вкладку: [' + tab.textContent.trim() + ']');
                    simulateClick(tab);
                    await sleep(2000);
                    // После клика страница загрузит /recent_activity, бот рестартует
                    return;
                }

                // Fallback: прямой переход на /recent_activity
                log('Вкладка не найдена, прямой переход на /recent_activity');
                window.location.href = 'https://www.strava.com' + clubUrl + '/recent_activity';
                await sleep(2000);
                return;
            }

            log('На вкладке тренировок (' + window.location.pathname + ')');

            // Главный цикл лайкания в клубе
            let totalClubLikes = 0;
            let emptyCycles = 0;
            let clubCycles = 0;
            const maxEmptyCycles = 1; // Быстро уходим если нет новых лайков
            const maxClubCycles = 3; // Лимит циклов на одном клубе

            while (!window.kudosBotShouldStop) {
                clubCycles++;
                if (clubCycles > maxClubCycles) {
                    log('Достигнут лимит ' + maxClubCycles + ' циклов на клубе, перехожу к следующему');
                    await goToNextClub();
                    return;
                }

                // Проверяем, есть ли тренировки в ленте
                const activities = document.querySelectorAll('[data-testid="web-feed-entry"], [data-testid="feed-entry"]');
                log('Найдено тренировок: ' + activities.length);

                if (activities.length === 0) {
                    log('Нет тренировок в клубе, возвращаюсь к списку');
                    await goToNextClub();
                    return;
                }

                // Лайкаем и прокручиваем
                const liked = await scrollAndLikeClubFeed(clubUrl);

                // Сигнал: 10+ подряд уже лайкнуты — уходим в следующий клуб
                if (liked < 0) {
                    log('Все тренировки в клубе уже лайкнуты, перехожу к следующему');
                    await goToNextClub();
                    return;
                }

                totalClubLikes += liked;
                log('Всего лайкнуто в клубе: ' + totalClubLikes);

                if (liked === 0) {
                    emptyCycles++;
                    log('Пустой цикл (' + emptyCycles + '/' + maxEmptyCycles + ')');
                    if (emptyCycles >= maxEmptyCycles) {
                        log('Лента в клубе закончилась, перехожу к следующему клубу');
                        await goToNextClub();
                        return;
                    }
                } else {
                    emptyCycles = 0;
                }

                // Пауза между циклами
                await sleep(1000);
            }

            return;
        }
    }

    // ====== ОСТАЛЬНЫЕ СТРАТЕГИИ ======

    function isCardInViewport(card) {
        try {
            const rect = card.getBoundingClientRect();
            return rect.bottom > 80 && rect.top < (window.innerHeight - 40);
        } catch(e) {
            return false;
        }
    }

    function getSmartCardId(card) {
        try {
            const id = getActivityIdFromCard(card);
            if (id) return id;
            return card.getAttribute('data-testid') || card.id || card.textContent.substring(0, 120);
        } catch(e) {
            return card.getAttribute('data-testid') || card.id || 'unknown';
        }
    }

    function getCardKudosState(card) {
        try {
            const buttons = card.querySelectorAll('button, [role="button"]');
            for (const btn of buttons) {
                const testId = btn.getAttribute('data-testid') || '';
                if (testId === 'give_kudos_button') continue;

                const aria = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
                const text = (btn.textContent || '').toLowerCase().trim();
                const rect = btn.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                if (rect.width > 220 || rect.height > 110) continue;

                let isKudos = false;
                if (testId === 'kudos_button' || testId === 'un-kudos_button') {
                    isKudos = true;
                } else if (aria.includes('kudos') && !/\d/.test(aria) && !aria.includes('view') && rect.width <= 80) {
                    isKudos = true;
                } else if ((aria.includes('like') || aria.includes('нрав')) && !/\d/.test(aria)) {
                    isKudos = true;
                }

                if (!isKudos) continue;
                if (/\d/.test(aria)) continue;
                if (text.includes('people') || text.includes('liked this')) continue;

                const actId = getActivityIdFromCard(card);
                const isLiked = testId.includes('un-kudos')
                    || btn.getAttribute('aria-pressed') === 'true'
                    || btn.querySelector('svg')?.getAttribute('fill') === '#fc5200';

                if (isLiked) return 'liked';
                if (actId && window.likedActivities.has(actId)) return 'memory';
                return 'available';
            }
            return 'none';
        } catch(e) {
            return 'none';
        }
    }

    function scanVisibleSmartCards(seenCards) {
        const stats = { newCards: 0, liked: 0, memory: 0, available: 0, own: 0, none: 0 };
        const cards = document.querySelectorAll('[data-testid="web-feed-entry"], [data-testid="feed-entry"]');
        for (const card of cards) {
            if (!isCardInViewport(card)) continue;
            const id = getSmartCardId(card);
            if (seenCards.has(id)) continue;
            seenCards.add(id);
            stats.newCards++;

            if (isOwnActivity(card)) {
                stats.own++;
                continue;
            }

            const state = getCardKudosState(card);
            if (state === 'liked') stats.liked++;
            else if (state === 'memory') stats.memory++;
            else if (state === 'available') stats.available++;
            else stats.none++;
        }
        return stats;
    }

    async function runSmartStrategy() {
        log("Старт УМНОЙ стратегии...");
        let cycle = 0;
        let consecutiveLiked = 0;
        const seenCards = new Set();
        const min = window.kudosMinDelay || 5000;
        const max = window.kudosMaxDelay || 12000;
        const likedLimit = window.consecutiveLikedLimit || 10;

        while (!window.kudosBotShouldStop) {
            cycle++;
            log(`=== Цикл ${cycle} ===`);

            let clicked = await likeVisible();
            if (clicked > 0) {
                consecutiveLiked = 0;
            }

            const initialStats = scanVisibleSmartCards(seenCards);
            if (initialStats.available > 0 || clicked > 0) {
                consecutiveLiked = 0;
            } else if ((initialStats.liked + initialStats.memory) > 0) {
                consecutiveLiked += initialStats.liked + initialStats.memory;
                log(`⏭️ Умная: подряд уже лайкнутых ${consecutiveLiked}/${likedLimit}`);
            }

            if (consecutiveLiked >= likedLimit) {
                log(`🔄 Умная: ${likedLimit} уже лайкнутых подряд. Обновляю страницу и начинаю сверху...`);
                window.kudosBotRunning = false;
                if (window.AndroidApp && window.AndroidApp.reloadPage) {
                    window.AndroidApp.reloadPage();
                    return;
                }
                await refreshFeed();
                return;
            }

            if (clicked === 0) {
                let scrollAttempts = 0;
                let totalScrolled = 0;
                let noScrollProgress = 0;

                while (clicked === 0 && scrollAttempts < 8 && !window.kudosBotShouldStop) {
                    const beforeY = window.scrollY;
                    const scrollAmount = Math.floor(Math.random() * 200) + 300;
                    window.scrollBy({ top: scrollAmount, behavior: 'auto' });
                    await sleep(Math.max(200, Math.floor(Math.random() * (max - min)) + min));

                    const afterY = window.scrollY;
                    totalScrolled += Math.max(0, afterY - beforeY);
                    if (afterY === beforeY) noScrollProgress++;
                    else noScrollProgress = 0;

                    clicked = await likeVisible();
                    if (clicked > 0) {
                        consecutiveLiked = 0;
                    }

                    const stats = scanVisibleSmartCards(seenCards);
                    if (stats.available > 0 || clicked > 0) {
                        consecutiveLiked = 0;
                    } else if ((stats.liked + stats.memory) > 0) {
                        consecutiveLiked += stats.liked + stats.memory;
                        log(`⏭️ Умная: подряд уже лайкнутых ${consecutiveLiked}/${likedLimit}`);
                    }

                    if (consecutiveLiked >= likedLimit) {
                        log(`🔄 Умная: ${likedLimit} уже лайкнутых подряд. Обновляю страницу и начинаю сверху...`);
                        window.kudosBotRunning = false;
                        if (window.AndroidApp && window.AndroidApp.reloadPage) {
                            window.AndroidApp.reloadPage();
                            return;
                        }
                        await refreshFeed();
                        return;
                    }

                    scrollAttempts++;
                    if (noScrollProgress >= 2) break;
                }

                if ((totalScrolled > 3000 || noScrollProgress >= 2) && clicked === 0) {
                    log("Достигнут предел ленты");
                    await scrollToTop();
                    clicked = await likeVisible();

                    if (clicked === 0 && cycle % 3 === 0) {
                        log("🔄 Умная стратегия: принудительно обновляю страницу Strava...");
                        window.kudosBotRunning = false;
                        if (window.AndroidApp && window.AndroidApp.reloadPage) {
                            window.AndroidApp.reloadPage();
                            return;
                        }
                        await refreshFeed();
                        return;
                    }

                    const waitTime = Math.max(3000, min * 2);
                    log(`Жду ${(waitTime/1000).toFixed(1)} сек...`);
                    await sleep(waitTime);
                }
            }

            if (!window.kudosBotShouldStop) {
                await sleep(Math.max(500, Math.floor(min / 2)));
            }
        }
    }

    async function refreshFeed() {
        log("Обновляю ленту...");
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(300);
        const refreshBtn = document.querySelector('button[data-testid*="refresh" i], [class*="refresh" i] button');
        if (refreshBtn) {
            refreshBtn.click();
            log("Нажата кнопка обновления");
            await sleep(2000);
            return;
        }
        window.scrollTo({ top: -200, behavior: 'smooth' });
        await sleep(1500);
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(2000);
    }

    async function runTopOnlyStrategy() {
        log("Старт ТОЛЬКО НОВЫЕ...");
        let refreshCount = 0;
        const min = () => window.kudosMinDelay || 5000;

        while (!window.kudosBotShouldStop) {
            window.scrollTo({ top: 0, behavior: 'auto' });
            await sleep(500);
            const clicked = await likeVisible();

            if (clicked === 0) {
                refreshCount++;
                if (refreshCount >= 3) {
                    await refreshFeed();
                    refreshCount = 0;
                } else {
                    log("Нет новых тренировок, жду...");
                    await sleep(Math.max(5000, min() * 2));
                }
            } else {
                refreshCount = 0;
            }

            if (!window.kudosBotShouldStop) {
                await sleep(Math.max(1000, min()));
            }
        }
    }

    async function runAggressiveStrategy() {
        log("Старт АГРЕССИВНОЙ стратегии...");
        let noProgress = 0;
        let lastY = 0;

        while (!window.kudosBotShouldStop) {
            const buttons = findKudosButtons();
            let clickedInCycle = 0;

            for (const {btn, actId} of buttons) {
                if (window.kudosBotShouldStop) break;
                const athlete = findAthleteName(btn);
                if (safeClick(btn)) {
                    if (actId) window.likedActivities.add(actId);
                    log(`✅ Лайк: ${athlete}`);
                    updateStats(athlete);
                    clickedInCycle++;
                }
                await sleep(200);
            }

            if (window.kudosBotShouldStop) break;

            lastY = window.scrollY;
            window.scrollBy({ top: 600, behavior: 'auto' });
            await sleep(500);

            if (window.scrollY === lastY) {
                noProgress++;
                log(`⬇️ Конец (${noProgress}/3)`);
                if (noProgress >= 3) {
                    log("🔄 Возвращаюсь в начало...");
                    await scrollToTop();
                    noProgress = 0;
                    await sleep(1000);
                }
            } else {
                noProgress = 0;
            }
        }
    }

    async function runHumanStrategy() {
        log("Старт ЧЕЛОВЕЧНОЙ стратегии...");
        let cycle = 0;
        let noProgress = 0;
        const min = window.kudosMinDelay || 8000;
        const max = window.kudosMaxDelay || 25000;

        while (!window.kudosBotShouldStop) {
            cycle++;
            let clicked = await likeVisible();

            if (clicked === 0) {
                const beforeY = window.scrollY;
                const beforeHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
                const scrollAmount = Math.floor(Math.random() * 300) + 200;
                window.scrollBy({ top: scrollAmount, behavior: 'smooth' });

                const readTime = Math.floor(Math.random() * (max - min)) + min;
                log(`Читаю ленту ${(readTime / 1000).toFixed(1)} сек...`);
                await sleep(readTime);

                const afterY = window.scrollY;
                const afterHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
                const nearBottom = (window.innerHeight + afterY) >= (afterHeight - 120);

                if (afterY === beforeY || (nearBottom && afterHeight <= beforeHeight + 50)) {
                    noProgress++;
                    log(`📍 Конец ленты? (${noProgress}/3)`);
                } else {
                    noProgress = 0;
                }

                clicked = await likeVisible();

                if (noProgress >= 3 && clicked === 0) {
                    log("🔄 Дошёл до конца ленты. Обновляю страницу и возвращаюсь вверх...");
                    window.kudosBotRunning = false;
                    if (window.AndroidApp && window.AndroidApp.reloadPage) {
                        window.AndroidApp.reloadPage();
                    } else {
                        window.scrollTo({ top: 0, behavior: 'auto' });
                        window.location.reload();
                    }
                    return;
                }

                if (clicked === 0 && cycle % 5 === 0) {
                    log("Делаю большую паузу...");
                    await sleep(Math.max(10000, min * 3));
                }
            } else {
                noProgress = 0;
            }

            if (!window.kudosBotShouldStop) {
                await sleep(Math.max(2000, Math.floor(min / 2)));
            }
        }
    }

    // ====== MAIN ======

    async function startLoop() {
        switch (STRATEGY) {
            case 'top_only':
                await runTopOnlyStrategy();
                break;
            case 'aggressive':
                await runAggressiveStrategy();
                break;
            case 'human':
                await runHumanStrategy();
                break;
            case 'clubs':
                await runClubsStrategy();
                break;
            case 'smart':
            default:
                await runSmartStrategy();
                break;
        }

        log("Автоматизация остановлена.");
        window.kudosBotRunning = false;
        // Очищаем имя клуба в Android
        try {
            if (typeof AndroidApp !== 'undefined' && AndroidApp.setClubName) {
                AndroidApp.setClubName("");
            }
        } catch(e) {}
    }

    startLoop();
})();
