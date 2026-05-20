(function() {
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

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
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
        // Расширенный поиск кнопок лайков
        const selectors = [
            'button', '[role="button"]', 'a', 'div[onclick]', 'span[onclick]'
        ];
        
        const result = [];
        const processed = new Set();
        
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach(btn => {
                try {
                    if (!btn || btn.disabled) return;
                    if (processed.has(btn)) return;
                    processed.add(btn);
                    
                    const testId = btn.getAttribute('data-testid') || '';
                    const title = (btn.getAttribute('title') || '').toLowerCase();
                    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const html = (btn.innerHTML || '').toLowerCase();
                    const cls = (btn.className || '').toLowerCase();
                    const text = (btn.textContent || '').toLowerCase();
                    
                    // Проверяем является ли кнопка лайком
                    let isKudos = false;
                    
                    // По data-testid
                    if (testId === 'kudos_button') isKudos = true;
                    else if (testId.includes('kudos')) isKudos = true;
                    
                    // По title/aria-label
                    else if (title.includes('kudos')) isKudos = true;
                    else if (aria.includes('kudos')) isKudos = true;
                    else if (aria.includes('give kudos')) isKudos = true;
                    else if (aria.includes('лайк')) isKudos = true;
                    
                    // По классу
                    else if (cls.includes('kudos')) isKudos = true;
                    else if (cls.includes('like')) isKudos = true;
                    
                    // По HTML содержимому
                    else if (html.includes('kudos')) isKudos = true;
                    else if (html.includes('thumbsup')) isKudos = true;
                    
                    // По SVG иконке (сердце)
                    else {
                        const svg = btn.querySelector('svg');
                        if (svg) {
                            const svgHtml = svg.innerHTML.toLowerCase();
                            if (svgHtml.includes('heart') || 
                                svgHtml.includes('path') ||
                                svgHtml.includes('m12') ||
                                svgHtml.includes('favorite')) {
                                // Проверяем что это кнопка рядом с активностью
                                const card = btn.closest('[data-testid*="entry" i]') || 
                                            btn.closest('.activity') || 
                                            btn.closest('article') ||
                                            btn.closest('[class*="card" i]') ||
                                            btn.closest('[class*="feed" i]');
                                if (card) isKudos = true;
                            }
                        }
                    }
                    
                    // Проверяем что кнопка рядом с активностью (для кнопок без явных признаков)
                    if (!isKudos && sel !== 'a') {
                        const card = btn.closest('[data-testid*="entry" i]') || 
                                    btn.closest('.activity') || 
                                    btn.closest('article') ||
                                    btn.closest('[class*="card" i]');
                        if (card) {
                            // Проверяем что это кнопка/ссылка внизу карточки
                            const parentRect = card.getBoundingClientRect();
                            const btnRect = btn.getBoundingClientRect();
                            const isInCard = btnRect.top >= parentRect.top && btnRect.bottom <= parentRect.bottom;
                            const isSmall = btnRect.width < 100 && btnRect.height < 60;
                            if (isInCard && isSmall && !text.includes('comment') && !text.includes('коммент')) {
                                isKudos = true;
                            }
                        }
                    }
                    
                    if (!isKudos) return;
                    
                    // Проверяем не лайкнут ли уже
                    const isLiked = (testId === 'un-kudos_button') || 
                                     title.includes('remove') || 
                                     aria.includes('remove') ||
                                     aria.includes('un-kudos') ||
                                     cls.includes('active') ||
                                     cls.includes('selected') ||
                                     html.includes('un-kudos') ||
                                     html.includes('liked') ||
                                     text.includes('liked') ||
                                     text.includes('лайкнуто') ||
                                     (btn.querySelector('svg')?.getAttribute('fill') === '#fc5200');
                    
                    if (!isLiked) {
                        const actId = getActivityId(btn);
                        if (actId && window.likedActivities.has(actId)) return;
                        result.push({btn, actId});
                    }
                } catch(e) {}
            });
        }
        
        return result;
    }

    function getActivityId(btn) {
        try {
            const card = btn.closest('[data-testid="web-feed-entry"]') || 
                        btn.closest('.activity') || 
                        btn.closest('article');
            if (!card) return null;
            const link = card.querySelector('a[href*="/activities/"]');
            if (link) {
                const match = link.href.match(/\/activities\/(\d+)/);
                if (match) return match[1];
            }
            return card.getAttribute('data-testid') || card.className;
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
            if (!isInViewport(btn)) continue;
            const rect = btn.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const elAtPoint = document.elementFromPoint(x, y);
            if (!elAtPoint || (!btn.contains(elAtPoint) && elAtPoint !== btn)) continue;
            
            const athlete = findAthleteName(btn);
            log(`Лайкаю: ${athlete}`);
            
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
            const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            el.dispatchEvent(event);
        } catch(e) {
            try { el.click(); } catch(e2) {}
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
        const links = document.querySelectorAll('a[href^="/clubs/"]');
        const clubs = [];
        const seen = new Set();
        
        for (const link of links) {
            const href = link.getAttribute('href') || '';
            // Берем только прямые ссылки на клубы: /clubs/12345
            const match = href.match(/^\/clubs\/(\d+)$/);
            if (match) {
                const clubId = match[1];
                if (!seen.has(clubId)) {
                    seen.add(clubId);
                    clubs.push('/clubs/' + clubId);
                }
            }
        }
        
        return clubs;
    }
    
    function findActivityTab() {
        const tabTexts = [
            'Recent Activity', 'Последняя тренировка', 'Recent', 'Activity',
            'Тренировки', 'Activities', 'Лента', 'Feed', 'Club Feed', 'Последние'
        ];
        
        const selectors = [
            'a[href*="/recent_activity"]',
            'a[href*="/activity"]',
            '[role="tab"]',
            '[data-testid*="tab"]',
            '.tabs a',
            '.tab',
            'nav a',
            '[class*="tab"]'
        ];
        
        for (const sel of selectors) {
            const tabs = document.querySelectorAll(sel);
            for (const tab of tabs) {
                const text = (tab.textContent || '').trim();
                for (const search of tabTexts) {
                    if (text.toLowerCase().includes(search.toLowerCase())) {
                        return tab;
                    }
                }
            }
        }
        
        // Fallback: ищем по всем элементам
        const all = document.querySelectorAll('a, button, [role="tab"], div, span');
        for (const el of all) {
            const text = (el.textContent || '').trim();
            for (const search of tabTexts) {
                if (text.toLowerCase().includes(search.toLowerCase())) {
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
        // Потом проверяем наличие элементов ленты
        const activities = document.querySelectorAll('[data-testid="web-feed-entry"], [data-testid="feed-entry"]');
        return activities.length > 0;
    }
    
    function goToNextClub() {
        // Не инкрементируем здесь — это делается в основном цикле
        log('Возвращаюсь к списку клубов...');
        window.location.href = 'https://www.strava.com/clubs/search';
    }
    
    async function scrollAndLikeClubFeed() {
        let totalLiked = 0;
        let scrollAttempts = 0;
        let lastY = window.scrollY;
        const maxScrolls = 30; // Увеличено для прокрутки длинных лент
        const processedThisSession = new Set(); // Тренировки, обработанные в этой сессии (не лайкать повторно)
        
        log('Начинаю лайкать тренировки в клубе...');
        
        // Скроллим вверх чтобы найти кнопки лайков
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(1500);
        
        // Проверяем есть ли тренировки
        if (!hasActivityFeed()) {
            log('Нет тренировок в ленте');
            return 0;
        }
        
        while (scrollAttempts < maxScrolls && !window.kudosBotShouldStop) {
            // Лайкаем видимые
            const buttons = findKudosButtons();
            log('Найдено кнопок лайков: ' + buttons.length);
            let likedInCycle = 0;
            let skippedInCycle = 0;
            
            for (let i = 0; i < buttons.length; i++) {
                const item = buttons[i];
                const btn = item.btn;
                const actId = item.actId;
                if (window.kudosBotShouldStop) break;
                
                // Пропускаем если уже обрабатывали в этой сессии (для предотвращения дублирования)
                if (actId && processedThisSession.has(actId)) {
                    skippedInCycle++;
                    continue;
                }
                
                // Проверяем что элемент в пределах экрана
                const btnRect = btn.getBoundingClientRect();
                if (btnRect.width === 0 || btnRect.height === 0) continue;
                
                // Элемент должен быть видимым на экране (или близко к краю)
                const isOnScreen = btnRect.top < window.innerHeight && btnRect.bottom > 0;
                if (!isOnScreen) continue;
                
                const athlete = findAthleteName(btn);
                
                // Скроллим к кнопке если она близко к краю
                if (btnRect.top < 200 || btnRect.bottom > window.innerHeight - 200) {
                    btn.scrollIntoView({ behavior: 'auto', block: 'center' });
                    await sleep(600);
                }
                
                log('Лайкаю: ' + athlete + ' (кнопка: ' + Math.round(btnRect.left) + ',' + Math.round(btnRect.top) + ')');
                
                const min = window.kudosMinDelay || 3000;
                const max = window.kudosMaxDelay || 8000;
                const delay = Math.floor(Math.random() * Math.max(0, max - min)) + min;
                if (delay > 500) {
                    log('Пауза ' + (delay/1000).toFixed(1) + 'с...');
                    await sleep(delay);
                }
                
                if (window.kudosBotShouldStop) break;
                
                // Пробуем кликнуть — сначала simulateClick, потом safeClick
                let clicked = false;
                try {
                    simulateClick(btn);
                    clicked = true;
                } catch(e) {
                    try {
                        btn.click();
                        clicked = true;
                    } catch(e2) {}
                }
                
                if (!clicked) {
                    clicked = safeClick(btn);
                }
                
                if (clicked) {
                    if (actId) {
                        window.likedActivities.add(actId);
                        processedThisSession.add(actId); // Отмечаем что обработали
                    }
                    log('✅ Лайк: ' + athlete);
                    updateStats(athlete);
                    likedInCycle++;
                    totalLiked++;
                    await sleep(Math.max(100, Math.floor(min / 3)));
                } else {
                    log('❌ Не удалось кликнуть на лайк');
                }
            }
            
            log('Лайкнуто в цикле: ' + likedInCycle + ', пропущено (дубли): ' + skippedInCycle + ', всего: ' + totalLiked);
            
            // ВСЕГДА прокручиваем после каждого цикла, чтобы найти новые тренировки
            window.scrollBy({ top: 1000, behavior: 'auto' });
            await sleep(1500);
            scrollAttempts++;
            
            // Проверяем, изменился ли скролл
            if (window.scrollY === lastY) {
                log('Конец ленты в клубе (скролл не изменился)');
                break;
            }
            lastY = window.scrollY;
            
            // Если за цикл не лайкнули ничего нового — проверим, есть ли еще незалайканные
            if (likedInCycle === 0) {
                // Проверяем, есть ли еще тренировки без лайков
                const remaining = findKudosButtons().filter(b => !b.actId || !window.likedActivities.has(b.actId));
                if (remaining.length === 0) {
                    log('Все тренировки в текущей видимой области залайканы');
                }
            }
        }
        
        log('Всего лайкнуто в клубе: ' + totalLiked);
        return totalLiked;
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
        await sleep(3000);
        
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
            await sleep(2500);
            
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
            await sleep(4000);
            return true;
        }
        
        log(`  ℹ️ Уже на нужной странице`);
        return true;
    }

    async function runClubsStrategy() {
        log('=== Запускаю стратегию: РОТАЦИЯ КЛУБОВ (через меню) ===');
        
        const url = window.location.pathname;
        
        // === ФАЗА 1: Нужно открыть меню и перейти в Клубы ===
        if (!url.startsWith('/clubs')) {
            log('Открываю меню навигации...');
            const menuOpened = clickSandwichMenu();
            if (menuOpened) {
                await sleep(3000);
                
                // Проверяем, открылось ли меню (ищем пункты меню на странице)
                const menuItems = document.querySelectorAll('[role="menuitem"], nav a, aside a, [class*="sidebar"] a, [class*="drawer"] a');
                log('Найдено пунктов меню на странице: ' + menuItems.length);
                
                // Пробуем найти и кликнуть "Клубы" в меню
                const menuTexts = ['Клубы', 'Clubs', 'Мои клубы', 'My Clubs', 'Your Clubs'];
                if (clickMenuItemByText(menuTexts)) {
                    log('Кликнул на пункт Клубы, жду перехода...');
                    await sleep(5000);
                    
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
            await sleep(5000);
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
            
            // Собираем клубы со страницы
            const found = getClubLinksFromPage();
            log('Найдено клубов на странице: ' + found.length);
            
            if (found.length > 0) {
                // Добавляем новые клубы в список
                for (const club of found) {
                    if (!clubs.includes(club)) {
                        clubs.push(club);
                    }
                }
                localStorage.setItem('sk_clubs', JSON.stringify(clubs));
                log('Всего в списке: ' + clubs.length);
            }
            
            // Если список пуст - прокручиваем чтобы загрузить больше
            if (clubs.length === 0 || (currentIndex >= clubs.length && found.length === 0)) {
                log('Прокручиваю для загрузки клубов...');
                window.scrollTo(0, document.body.scrollHeight);
                await sleep(3000);
                
                const newFound = getClubLinksFromPage();
                for (const club of newFound) {
                    if (!clubs.includes(club)) {
                        clubs.push(club);
                    }
                }
                
                if (clubs.length > 0) {
                    localStorage.setItem('sk_clubs', JSON.stringify(clubs));
                    currentIndex = 0;
                    localStorage.setItem('sk_index', '0');
                } else {
                    log('Клубы не найдены. Сброс и попытка через 30с...');
                    localStorage.removeItem('sk_clubs');
                    localStorage.removeItem('sk_visited');
                    localStorage.removeItem('sk_index');
                    await sleep(30000);
                    window.location.reload();
                    return;
                }
            }
            
            // Проверяем, все ли клубы посещены
            const allVisited = clubs.every(club => visitedSet.has(club));
            if (allVisited) {
                log('Все клубы уже посещены, сбрасываю для нового цикла');
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
                
                // Ищем ссылку на странице
                const link = document.querySelector('a[href="' + nextClub + '"]');
                if (link) {
                    log('Кликаю на ссылку клуба на странице');
                    simulateClick(link);
                } else {
                    log('Ссылка не найдена на странице, прямой переход');
                    window.location.href = 'https://www.strava.com' + nextClub;
                }
                await sleep(5000);
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
        const clubMatch = url.match(/\/clubs\/(\d+)/);
        if (clubMatch) {
            const clubId = clubMatch[1];
            const clubUrl = '/clubs/' + clubId;
            log('В клубе #' + clubId);
            
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
            
            // Проверяем URL — если не /recent_activity, нужно кликнуть вкладку
            if (!window.location.pathname.includes('/recent_activity')) {
                log('Не на вкладке тренировок (URL: ' + window.location.pathname + '), ищу вкладку...');
                
                // Ищем и кликаем вкладку активности
                const tab = findActivityTab();
                if (tab) {
                    log('Кликаю на вкладку: [' + tab.textContent.trim() + ']');
                    simulateClick(tab);
                    await sleep(5000);
                    // После клика страница загрузит /recent_activity, бот рестартует
                    return;
                }
                
                // Fallback: прямой переход на /recent_activity
                log('Вкладка не найдена, прямой переход на /recent_activity');
                window.location.href = 'https://www.strava.com' + clubUrl + '/recent_activity';
                await sleep(5000);
                return;
            }
            
            log('На вкладке тренировок (' + window.location.pathname + ')');
            
            // Главный цикл лайкания в клубе
            let totalClubLikes = 0;
            let emptyCycles = 0;
            const maxEmptyCycles = 3; // После 3 циклов без лайков — переходим к следующему клубу
            
            while (!window.kudosBotShouldStop) {
                // Проверяем, есть ли тренировки в ленте
                const activities = document.querySelectorAll('[data-testid="web-feed-entry"], [data-testid="feed-entry"]');
                log('Найдено тренировок: ' + activities.length);
                
                if (activities.length === 0) {
                    log('Нет тренировок в клубе, возвращаюсь к списку');
                    goToNextClub();
                    return;
                }
                
                // Лайкаем и прокручиваем
                const liked = await scrollAndLikeClubFeed();
                totalClubLikes += liked;
                log('Всего лайкнуто в клубе: ' + totalClubLikes);
                
                if (liked === 0) {
                    emptyCycles++;
                    log('Пустой цикл (' + emptyCycles + '/' + maxEmptyCycles + ')');
                    if (emptyCycles >= maxEmptyCycles) {
                        log('Лента в клубе закончилась, перехожу к следующему клубу');
                        goToNextClub();
                        return;
                    }
                } else {
                    emptyCycles = 0;
                }
                
                // Пауза между циклами
                await sleep(3000);
            }
            
            return;
        }
    }

    // ====== ОСТАЛЬНЫЕ СТРАТЕГИИ ======

    async function runSmartStrategy() {
        log("Старт УМНОЙ стратегии...");
        let cycle = 0;
        const min = () => window.kudosMinDelay || 5000;
        const max = () => window.kudosMaxDelay || 12000;

        while (!window.kudosBotShouldStop) {
            cycle++;
            log(`=== Цикл ${cycle} ===`);
            
            let clicked = await likeVisible();
            
            if (clicked === 0) {
                let scrollAttempts = 0;
                let totalScrolled = 0;
                
                while (clicked === 0 && scrollAttempts < 8 && !window.kudosBotShouldStop) {
                    const scrollAmount = Math.floor(Math.random() * 200) + 300;
                    window.scrollBy({ top: scrollAmount, behavior: 'auto' });
                    totalScrolled += scrollAmount;
                    await sleep(Math.max(200, Math.floor(Math.random() * (max() - min())) + min()));
                    
                    clicked = await likeVisible();
                    scrollAttempts++;
                }
                
                if (totalScrolled > 3000 || clicked === 0) {
                    log("Достигнут предел ленты");
                    await scrollToTop();
                    clicked = await likeVisible();
                    
                    if (clicked === 0 && cycle % 3 === 0) {
                        await refreshFeed();
                    } else {
                        const waitTime = Math.max(3000, min() * 2);
                        log(`Жду ${(waitTime/1000).toFixed(1)} сек...`);
                        await sleep(waitTime);
                    }
                }
            }
            
            if (!window.kudosBotShouldStop) {
                await sleep(Math.max(500, Math.floor(min() / 2)));
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
                    await sleep(3000);
                }
            } else {
                noProgress = 0;
            }
        }
    }

    async function runHumanStrategy() {
        log("Старт ЧЕЛОВЕЧНОЙ стратегии...");
        let cycle = 0;
        const min = () => window.kudosMinDelay || 8000;
        const max = () => window.kudosMaxDelay || 25000;

        while (!window.kudosBotShouldStop) {
            cycle++;
            let clicked = await likeVisible();
            
            if (clicked === 0) {
                const scrollAmount = Math.floor(Math.random() * 300) + 200;
                window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                
                const readTime = Math.floor(Math.random() * (max() - min())) + min();
                log(`Читаю ленту ${(readTime/1000).toFixed(1)} сек...`);
                await sleep(readTime);
                
                clicked = await likeVisible();
                
                if (clicked === 0 && cycle % 5 === 0) {
                    log("Делаю большую паузу...");
                    await sleep(Math.max(10000, min() * 3));
                }
            }
            
            if (!window.kudosBotShouldStop) {
                await sleep(Math.max(2000, Math.floor(min() / 2)));
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
    }

    startLoop();
})();
