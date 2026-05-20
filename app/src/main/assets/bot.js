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
        const all = document.querySelectorAll('button, [role="button"]');
        const result = [];
        all.forEach(btn => {
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
        let i = 0;
        while (window.scrollY > 100 && i < 30) {
            if (window.kudosBotShouldStop) return;
            window.scrollBy({ top: -1000, behavior: 'auto' });
            await sleep(100);
            i++;
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(500);
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
        // Стратегия 1: Ищем элемент с текстом "Подписки" или "Following" вверху
        const feeds = getPageFeeds();
        
        for (const feed of feeds) {
            const text = feed.text.toLowerCase();
            if (text === 'following' || text === 'подписки' || 
                text === 'my clubs' || text === 'мои группы') {
                log(`🎯 Найден селектор лент: "${feed.text}"`);
                directClick(feed.el);
                await sleep(1500); // Ждем открытия dropdown
                return true;
            }
        }
        
        // Стратегия 2: Ищем по data-testid
        const selectors = [
            '[data-testid="feed-selector-toggle"]',
            '[data-testid="feed-dropdown"]',
            '[data-testid="club-selector"]',
            '[class*="feed-selector" i]',
            '[class*="dropdown-toggle" i]',
            'button[class*="dropdown" i]',
        ];
        
        for (const sel of selectors) {
            try {
                const el = document.querySelector(sel);
                if (el) {
                    log(`🎯 Найден селектор по CSS: ${sel}`);
                    directClick(el);
                    await sleep(1500);
                    return true;
                }
            } catch(e) {}
        }
        
        // Стратегия 3: Ищем aria-expanded или aria-haspopup
        const toggleButtons = document.querySelectorAll('[aria-expanded], [aria-haspopup="true"]');
        for (const btn of toggleButtons) {
            const rect = btn.getBoundingClientRect();
            if (rect.top < 200 && rect.width > 80) {
                log(`🎯 Найден toggle button (aria)`);
                directClick(btn);
                await sleep(1500);
                return true;
            }
        }
        
        log("❌ Селектор лент не найден");
        return false;
    }
    
    function getFeedOptions() {
        const options = [];
        
        // Ищем открытый dropdown/menu
        const menuSelectors = [
            '[role="menu"]',
            '[role="listbox"]',
            '[class*="dropdown-menu" i]',
            '[class*="menu-list" i]',
            '[data-testid*="menu" i]',
            '[data-testid*="dropdown" i]',
        ];
        
        let menuEl = null;
        for (const sel of menuSelectors) {
            try {
                const el = document.querySelector(sel);
                if (el) {
                    const style = window.getComputedStyle(el);
                    if (style.display !== 'none' && style.visibility !== 'hidden') {
                        menuEl = el;
                        break;
                    }
                }
            } catch(e) {}
        }
        
        // Если нашли открытое меню, ищем опции внутри
        if (menuEl) {
            const items = menuEl.querySelectorAll('[role="menuitem"], [role="option"], a, li, button');
            for (const item of items) {
                const text = (item.textContent || '').trim();
                const href = item.getAttribute('href') || '';
                
                // Фильтруем только ленты
                const isFeed = href.includes('/dashboard') || 
                              (href.includes('/clubs/') && href.includes('/dashboard')) ||
                              text.toLowerCase() === 'following' ||
                              text.toLowerCase() === 'подписки' ||
                              text.toLowerCase() === 'my clubs' ||
                              text.toLowerCase() === 'мои группы' ||
                              text.toLowerCase() === 'your clubs' ||
                              text.toLowerCase() === 'мои клубы';
                
                if (isFeed && text.length > 0) {
                    options.push({ el: item, text, href });
                }
            }
        }
        
        // Также ищем все кликабельные элементы со ссылками на dashboard
        if (options.length === 0) {
            const allLinks = document.querySelectorAll('a[href*="/dashboard"], a[href*="/clubs/"]');
            for (const link of allLinks) {
                const text = (link.textContent || '').trim();
                const href = link.getAttribute('href') || '';
                
                // Пропускаем ссылки на поиск, настройки и т.д.
                if (href.includes('/search') || href.includes('/settings')) continue;
                
                if (href.includes('/dashboard') || (href.includes('/clubs/') && href.includes('/dashboard'))) {
                    if (!options.find(o => o.href === href)) {
                        options.push({ el: link, text, href });
                    }
                }
            }
        }
        
        return options;
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
    
    async function runClubsStrategy() {
        log("🏃 Старт стратегии КЛУБЫ...");
        
        // Собираем список лент
        let feeds = [];
        
        // Пробуем открыть dropdown
        const opened = await clickFeedSelector();
        
        if (opened) {
            // Собираем опции из открытого dropdown
            const options = getFeedOptions();
            log(`📋 Найдено ${options.length} лент в dropdown`);
            
            for (const opt of options) {
                if (!feeds.find(f => f.href === opt.href)) {
                    feeds.push({
                        text: opt.text || 'Лента',
                        href: opt.href,
                        el: opt.el
                    });
                }
            }
            
            // Закрываем dropdown (кликаем в пустое место)
            document.body.click();
            await sleep(500);
        }
        
        // Если не нашли через dropdown, пробуем найти на странице
        if (feeds.length === 0) {
            log("🔍 Ищу ленты на странице...");
            
            // Ищем все ссылки на ленты на странице
            const pageFeeds = getPageFeeds();
            for (const feed of pageFeeds) {
                // Получаем href из ближайшей ссылки
                let href = '';
                if (feed.el.tagName === 'A') {
                    href = feed.el.getAttribute('href') || '';
                } else {
                    const link = feed.el.closest('a');
                    if (link) href = link.getAttribute('href') || '';
                }
                
                if (!href) {
                    // Если нет href, пробуем onclick или data-атрибуты
                    href = feed.el.getAttribute('data-href') || 
                           feed.el.getAttribute('data-url') || '';
                }
                
                // Добавляем даже без href — попробуем просто кликнуть
                if (!feeds.find(f => f.text === feed.text)) {
                    feeds.push({
                        text: feed.text,
                        href: href,
                        el: feed.el
                    });
                }
            }
        }
        
        // Добавляем основную ленту если её нет
        const hasMainFeed = feeds.some(f => 
            f.text.toLowerCase() === 'following' || 
            f.text.toLowerCase() === 'подписки' ||
            f.href === '/dashboard' ||
            f.href === '/dashboard/following'
        );
        
        if (!hasMainFeed) {
            feeds.unshift({ text: 'Following', href: '/dashboard', el: null });
        }
        
        log(`📊 Всего лент: ${feeds.length}`);
        feeds.forEach((f, i) => log(`  ${i+1}. ${f.text} (${f.href || 'no href'})`));
        
        if (feeds.length <= 1) {
            log("⚠️ Найдена только 1 лента, переключаюсь на умную стратегию");
            await runSmartStrategy();
            return;
        }
        
        let feedIndex = 0;
        let emptyCycles = 0;
        
        while (!window.kudosBotShouldStop) {
            const feed = feeds[feedIndex];
            log(`\n=== 📰 ${feed.text} ===`);
            
            // Переключаемся на ленту
            if (feed.el) {
                // Если есть элемент — кликаем на него через dropdown
                await clickFeedSelector();
                await sleep(1000);
                
                // Переищем опции (DOM мог измениться)
                const currentOptions = getFeedOptions();
                const targetOption = currentOptions.find(o => 
                    o.text === feed.text || o.href === feed.href
                );
                
                if (targetOption) {
                    await switchToFeed(targetOption);
                } else {
                    log(`⚠️ Опция "${feed.text}" не найдена в dropdown, пробую прямой клик`);
                    directClick(feed.el);
                    await sleep(3000);
                }
                
                // Закрываем dropdown если открыт
                document.body.click();
                await sleep(500);
            } else if (feed.href && feed.href !== window.location.pathname) {
                // Если нет элемента но есть href — переходим по URL
                log(`🌐 Переход по URL: ${feed.href}`);
                window.location.href = 'https://www.strava.com' + feed.href;
                await sleep(4000);
            }
            
            // Лайкаем в текущей ленте
            await scrollToTop();
            await sleep(1000);
            
            const clicked = await scrollAndLike(20);
            
            if (clicked === 0) {
                emptyCycles++;
                log(`📭 Пустая лента (${emptyCycles}/3)`);
                
                if (emptyCycles >= 3) {
                    log("💤 Все ленты пусты, пауза 30с...");
                    await sleep(30000);
                    emptyCycles = 0;
                }
            } else {
                emptyCycles = 0;
            }
            
            // Переходим к следующей ленте
            feedIndex = (feedIndex + 1) % feeds.length;
            await sleep(2000);
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
