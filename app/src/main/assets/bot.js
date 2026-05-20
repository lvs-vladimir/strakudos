(function() {
    if (window.kudosBotRunning) {
        console.log("Бот уже запущен.");
        return;
    }
    window.kudosBotRunning = true;
    window.kudosBotShouldStop = false;
    
    // Восстанавливаем likedActivities из localStorage
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

    function saveLikedActivities() {
        try {
            localStorage.setItem('strakudos_liked', JSON.stringify([...window.likedActivities]));
        } catch(e) {}
    }

    // Сохраняем likedActivities периодически
    setInterval(() => {
        saveLikedActivities();
    }, 30000);

    function isInViewport(el) {
        const rect = el.getBoundingClientRect();
        return rect.top >= 60 && rect.bottom <= (window.innerHeight - 60);
    }

    function closeModals() {
        const selectors = [
            '[class*="modal" i]', '[class*="dialog" i]', '[class*="overlay" i]',
            '[role="dialog"]', '[data-testid*="modal" i]', '[class*="lightbox" i]'
        ];
        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    const closeBtn = el.querySelector('button[class*="close" i], button[aria-label*="close" i], [data-testid*="close" i]');
                    if (closeBtn) closeBtn.click();
                    el.style.display = 'none';
                }
            });
        });
    }

    function findAthleteName(btn) {
        try {
            const card = btn.closest('[data-testid="web-feed-entry"]') || 
                        btn.closest('.activity') || 
                        btn.closest('.feed-entry') || 
                        btn.closest('article') ||
                        btn.closest('div[class*="card" i]') ||
                        btn.closest('[class*="entry" i]');
            
            if (!card) return "Неизвестный";
            
            const nameEl = card.querySelector('[data-testid="owners-name"]') || 
                          card.querySelector('a[href*="/athletes/"]') ||
                          card.querySelector('[class*="athlete" i] a') ||
                          card.querySelector('strong a');
            
            return nameEl ? nameEl.textContent.trim().substring(0, 25) : "Неизвестный";
        } catch(e) {
            return "Неизвестный";
        }
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
        } catch(e) {
            return null;
        }
    }

    function findKudosButtons() {
        const allButtons = document.querySelectorAll('button, [role="button"]');
        const result = [];
        allButtons.forEach(btn => {
            try {
                if (!btn || btn.disabled) return;
                const testId = btn.getAttribute('data-testid') || '';
                const title = (btn.getAttribute('title') || '').toLowerCase();
                const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                const html = (btn.innerHTML || '').toLowerCase();
                const cls = (btn.className || '').toLowerCase();
                
                const isKudos = (testId === 'kudos_button') || 
                               title.includes('kudos') || 
                               aria.includes('kudos') || 
                               html.includes('kudos') ||
                               cls.includes('kudos');
                                 
                if (!isKudos) return;
                
                const isLiked = (testId === 'un-kudos_button') || 
                                 title.includes('remove') || 
                                 aria.includes('remove') ||
                                 cls.includes('active') ||
                                 cls.includes('selected') ||
                                 html.includes('un-kudos') ||
                                 html.includes('liked') ||
                                 (btn.querySelector('svg')?.getAttribute('fill') === '#fc5200');
                
                if (!isLiked) {
                    const actId = getActivityId(btn);
                    if (actId && window.likedActivities.has(actId)) return;
                    result.push({btn, actId});
                }
            } catch(e) {}
        });
        return result;
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
        } catch(e) {
            return false;
        }
    }

    async function scrollToTop() {
        log("Возвращаюсь в начало ленты...");
        let scrolls = 0;
        while (window.scrollY > 100 && scrolls < 30) {
            if (window.kudosBotShouldStop) return;
            window.scrollBy({ top: -800, behavior: 'auto' });
            await sleep(150);
            scrolls++;
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(500);
    }

    async function likeVisibleActivities() {
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
            
            const min = window.kudosMinDelay || 5000;
            const max = window.kudosMaxDelay || 12000;
            const range = Math.max(0, max - min);
            const delay = Math.max(50, Math.floor(Math.random() * range) + min);
            
            if (delay > 500) {
                log(`Пауза ${(delay/1000).toFixed(2)} сек...`);
                await sleep(delay);
            }
            
            if (window.kudosBotShouldStop) break;
            closeModals();
            
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
        let totalClicked = 0;
        let scrolls = 0;
        
        while (scrolls < maxScrolls && !window.kudosBotShouldStop) {
            const clicked = await likeVisibleActivities();
            totalClicked += clicked;
            
            if (clicked === 0) {
                window.scrollBy({ top: 600, behavior: 'auto' });
                await sleep(500);
                scrolls++;
            }
        }
        
        return totalClicked;
    }

    // ===== ОПРЕДЕЛЕНИЕ ТЕКУЩЕЙ ЛЕНТЫ =====
    
    function detectCurrentFeed() {
        const url = window.location.pathname;
        
        if (url.includes('/clubs/') && url.includes('/dashboard')) {
            const match = url.match(/\/clubs\/(\d+)/);
            if (match) return { type: 'club', id: match[1] };
        }
        
        if (url === '/dashboard' || url === '/dashboard/following' || url === '/') {
            return { type: 'following' };
        }
        
        return { type: 'unknown' };
    }

    // ===== РАБОТА С ВЫПАДАЮЩИМ СПИСКОМ ЛЕНТ =====
    
    function findFeedSelector() {
        // Пробуем разные селекторы для кнопки выбора ленты
        const selectors = [
            '[data-testid*="feed-selector" i]',
            '[data-testid*="feed" i] button',
            '[class*="feed-selector" i]',
            '[class*="feed-dropdown" i]',
            'button[class*="dropdown" i]',
            '[aria-label*="feed" i]',
            '[aria-label*="лент" i]',
            // На Strava часто используется просто кнопка с текстом
            'button:has-text("Following")',
            'button:has-text("Подписки")',
        ];
        
        for (const sel of selectors) {
            try {
                const el = document.querySelector(sel);
                if (el) return el;
            } catch(e) {}
        }
        
        // Ищем по текстовому содержимому
        const allButtons = document.querySelectorAll('button, a, [role="button"]');
        for (const btn of allButtons) {
            const text = btn.textContent?.toLowerCase() || '';
            if (text.includes('following') || text.includes('подписки') || 
                text.includes('feed') || text.includes('лента') ||
                text.includes('clubs') || text.includes('клубы')) {
                return btn;
            }
        }
        
        return null;
    }
    
    function findFeedOptions() {
        const options = [];
        
        // Ищем все элементы выпадающего списка
        const selectors = [
            '[role="menuitem"]',
            '[role="option"]',
            '[data-testid*="feed-option" i]',
            '[class*="dropdown-item" i]',
            '[class*="menu-item" i]',
            'li a[href*="/clubs/"]',
            'li a[href="/dashboard"]',
            'li a[href="/dashboard/following"]',
        ];
        
        for (const sel of selectors) {
            try {
                const elements = document.querySelectorAll(sel);
                elements.forEach(el => {
                    const href = el.getAttribute('href') || el.closest('a')?.getAttribute('href') || '';
                    const text = el.textContent?.trim() || '';
                    
                    if (href.includes('/clubs/') || href === '/dashboard' || href === '/dashboard/following' || 
                        text.toLowerCase().includes('following') || text.toLowerCase().includes('клуб')) {
                        if (!options.find(o => o.href === href)) {
                            options.push({ element: el, href: href, text: text });
                        }
                    }
                });
            } catch(e) {}
        }
        
        // Если не нашли в стандартных селекторах, ищем все ссылки на клубы и dashboard
        if (options.length === 0) {
            const allLinks = document.querySelectorAll('a');
            for (const link of allLinks) {
                const href = link.getAttribute('href') || '';
                const text = link.textContent?.trim() || '';
                
                if (href.includes('/clubs/') || href === '/dashboard' || href === '/dashboard/following') {
                    if (!options.find(o => o.href === href)) {
                        options.push({ element: link, href: href, text: text || 'Feed' });
                    }
                }
            }
        }
        
        return options;
    }
    
    async function openFeedSelector() {
        const selector = findFeedSelector();
        if (!selector) {
            log("Выпадающий список лент не найден");
            return false;
        }
        
        log("Открываю список лент...");
        safeClick(selector);
        await sleep(1000);
        return true;
    }
    
    async function closeFeedSelector() {
        // Кликаем в пустое место чтобы закрыть dropdown
        document.body.click();
        await sleep(300);
    }
    
    async function switchToFeed(href) {
        // Для SPA используем History API или кликаем на ссылку
        log(`Переключаюсь на: ${href}`);
        
        // Пробуем найти ссылку и кликнуть
        const links = document.querySelectorAll(`a[href="${href}"]`);
        for (const link of links) {
            if (safeClick(link)) {
                await sleep(2000); // Ждем загрузки контента
                return true;
            }
        }
        
        // Если не получилось кликнуть, используем History API
        if (window.history && window.history.pushState) {
            window.history.pushState({}, '', href);
            // Триггерим событие popstate чтобы React Router обновил view
            window.dispatchEvent(new PopStateEvent('popstate'));
            await sleep(2000);
            return true;
        }
        
        // Последний вариант - просто меняем location (вызывает перезагрузку)
        window.location.href = 'https://www.strava.com' + href;
        await sleep(3000);
        return true;
    }

    // ===== СТРАТЕГИЯ КЛУБОВ С НАВИГАЦИЕЙ ПО UI =====
    
    async function runClubsStrategy() {
        log("Старт стратегии КЛУБЫ (UI навигация)...");
        
        // Пробуем открыть выпадающий список
        const opened = await openFeedSelector();
        
        let feeds = [];
        
        if (opened) {
            // Собираем все доступные ленты из выпадающего списка
            const options = findFeedOptions();
            log(`Найдено ${options.length} лент в списке`);
            
            feeds = options.map(opt => ({
                href: opt.href,
                text: opt.text || opt.href,
                element: opt.element
            }));
            
            await closeFeedSelector();
        }
        
        // Если не нашли через UI, пробуем через URL
        if (feeds.length === 0) {
            log("Не удалось найти ленты в UI, пробуем через URL...");
            feeds = [
                { href: '/dashboard', text: 'Following' }
            ];
            
            // Ищем клубы на странице
            const clubLinks = document.querySelectorAll('a[href*="/clubs/"]');
            const clubIds = new Set();
            clubLinks.forEach(link => {
                const href = link.getAttribute('href') || '';
                const match = href.match(/\/clubs\/(\d+)/);
                if (match && !clubIds.has(match[1])) {
                    clubIds.add(match[1]);
                    feeds.push({ 
                        href: `/clubs/${match[1]}/dashboard`, 
                        text: link.textContent?.trim() || `Club ${match[1]}` 
                    });
                }
            });
        }
        
        if (feeds.length === 0) {
            log("Не найдено ни одной ленты. Переключаюсь на умную стратегию.");
            await runSmartStrategy();
            return;
        }
        
        log(`Ротация между ${feeds.length} лентами: ${feeds.map(f => f.text).join(', ')}`);
        
        let feedIndex = 0;
        let cyclesWithoutLikes = 0;
        
        while (!window.kudosBotShouldStop) {
            const feed = feeds[feedIndex];
            log(`=== ${feed.text} (${feed.href}) ===`);
            
            // Переключаемся на ленту
            const currentFeed = detectCurrentFeed();
            const isCurrentFeed = (currentFeed.type === 'following' && feed.href.includes('dashboard')) ||
                                 (currentFeed.type === 'club' && feed.href.includes(currentFeed.id));
            
            if (!isCurrentFeed) {
                // Открываем селектор и выбираем нужную ленту
                await openFeedSelector();
                await sleep(500);
                
                // Ищем ссылку на нужную ленту в открытом dropdown
                const options = findFeedOptions();
                const targetOption = options.find(opt => opt.href === feed.href || 
                    opt.href.includes(feed.href.replace('/dashboard', '')));
                
                if (targetOption) {
                    safeClick(targetOption.element);
                    log(`Выбрана лента: ${feed.text}`);
                } else {
                    // Если не нашли в dropdown, используем прямую навигацию
                    await switchToFeed(feed.href);
                }
                
                await sleep(2000);
                await closeFeedSelector();
            } else {
                log("Уже на нужной ленте");
            }
            
            // Лайкаем в текущей ленте
            await scrollToTop();
            await sleep(1000);
            
            const clicked = await scrollAndLike(15); // Максимум 15 скроллов на ленту
            
            if (clicked === 0) {
                cyclesWithoutLikes++;
                log(`В ленте нет новых записей (${cyclesWithoutLikes}/3)`);
                
                if (cyclesWithoutLikes >= 3) {
                    log("Все ленты пусты, делаю паузу...");
                    await sleep(30000); // 30 секунд пауза
                    cyclesWithoutLikes = 0;
                }
            } else {
                cyclesWithoutLikes = 0;
            }
            
            // Переходим к следующей ленте
            feedIndex = (feedIndex + 1) % feeds.length;
            log(`Переключаюсь на следующую ленту...`);
            await sleep(2000);
        }
    }

    // ===== ОСТАЛЬНЫЕ СТРАТЕГИИ =====

    async function runSmartStrategy() {
        log("Старт УМНОЙ стратегии...");
        let cycle = 0;
        const min = () => window.kudosMinDelay || 5000;
        const max = () => window.kudosMaxDelay || 12000;

        while (!window.kudosBotShouldStop) {
            cycle++;
            log(`=== Цикл ${cycle} ===`);
            
            let clicked = await likeVisibleActivities();
            
            if (clicked === 0) {
                let scrollAttempts = 0;
                let totalScrolled = 0;
                
                while (clicked === 0 && scrollAttempts < 8 && !window.kudosBotShouldStop) {
                    const scrollAmount = Math.floor(Math.random() * 200) + 300;
                    window.scrollBy({ top: scrollAmount, behavior: 'auto' });
                    totalScrolled += scrollAmount;
                    await sleep(Math.max(200, Math.floor(Math.random() * (max() - min())) + min()));
                    
                    clicked = await likeVisibleActivities();
                    scrollAttempts++;
                }
                
                if (totalScrolled > 3000 || clicked === 0) {
                    log("Достигнут предел ленты");
                    await scrollToTop();
                    clicked = await likeVisibleActivities();
                    
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
        
        log("Pull-to-refresh: скролл вверх...");
        window.scrollTo({ top: -200, behavior: 'smooth' });
        await sleep(1500);
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(2000);
    }

    async function runTopOnlyStrategy() {
        log("Старт стратегии ТОЛЬКО НОВЫЕ...");
        let refreshCount = 0;
        const min = () => window.kudosMinDelay || 5000;

        while (!window.kudosBotShouldStop) {
            window.scrollTo({ top: 0, behavior: 'auto' });
            await sleep(500);
            
            const clicked = await likeVisibleActivities();
            
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
        let noProgressCount = 0;
        let lastScrollY = 0;
        
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
            
            lastScrollY = window.scrollY;
            window.scrollBy({ top: 600, behavior: 'auto' });
            await sleep(500);
            
            if (window.scrollY === lastScrollY) {
                noProgressCount++;
                log(`⬇️ Конец ленты (${noProgressCount}/3)`);
                
                if (noProgressCount >= 3) {
                    log("🔄 Достигнут конец ленты. Возвращаюсь в начало...");
                    await scrollToTop();
                    noProgressCount = 0;
                    await sleep(3000);
                }
            } else {
                noProgressCount = 0;
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
            
            let clicked = await likeVisibleActivities();
            
            if (clicked === 0) {
                const scrollAmount = Math.floor(Math.random() * 300) + 200;
                window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                
                const readTime = Math.floor(Math.random() * (max() - min())) + min();
                log(`Читаю ленту ${(readTime/1000).toFixed(1)} сек...`);
                await sleep(readTime);
                
                clicked = await likeVisibleActivities();
                
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

    // ===== MAIN LOOP =====

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
