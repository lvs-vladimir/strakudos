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
        log("🏃 Старт стратегии КЛУБЫ (через dropdown на странице)...");
        
        // Восстанавливаем индекс ленты из памяти
        let feedIndex = 0;
        try {
            const savedIndex = localStorage.getItem('strakudos_feed_index');
            if (savedIndex) feedIndex = parseInt(savedIndex, 10) || 0;
        } catch(e) {}
        
        let feeds = [];
        let cyclesWithoutLikes = 0;
        let totalLiked = 0;
        
        // ПЕРВЫЙ ПРОХОД: открываем dropdown и собираем все ленты
        log("🔍 Первый проход: открываю dropdown и собираю список лент...");
        
        // Находим и кликаем на dropdown selector
        const selectorOpened = await clickFeedSelector();
        if (!selectorOpened) {
            log("❌ Не удалось открыть dropdown. Переключаюсь на умную стратегию.");
            await runSmartStrategy();
            return;
        }
        
        // Собираем опции из открытого dropdown
        feeds = getFeedOptions();
        log(`📊 Найдено ${feeds.length} лент в dropdown`);
        feeds.forEach((f, i) => log('  ' + (i+1) + '. [' + f.text + ']'));
        
        if (feeds.length <= 1) {
            log("⚠️ Найдена только 1 лента. Пробую ещё раз...");
            await sleep(1000);
            feeds = getFeedOptions();
            if (feeds.length <= 1) {
                log("❌ В dropdown только 1 лента. Переключаюсь на умную стратегию.");
                await runSmartStrategy();
                return;
            }
        }
        
        // Закрываем dropdown
        document.body.click();
        await sleep(500);
        
        // ГЛАВНЫЙ ЦИКЛ: по очереди выбираем ленты из dropdown
        while (!window.kudosBotShouldStop) {
            const feed = feeds[feedIndex];
            log(`=== 📰 ${feed.text} (${feedIndex + 1}/${feeds.length}) ===`);
            
            // Сохраняем текущий индекс
            try {
                localStorage.setItem('strakudos_feed_index', feedIndex.toString());
                localStorage.setItem('strakudos_feed_list', JSON.stringify(feeds.map(f => f.text)));
            } catch(e) {}
            
            // ШАГ 1: Открываем dropdown
            log("  [1] Открываю dropdown...");
            const opened = await clickFeedSelector();
            if (!opened) {
                log("  ⚠️ Не удалось открыть dropdown, пробую ещё раз...");
                await sleep(1000);
                continue;
            }
            
            // ШАГ 2: Находим и кликаем на нужную опцию
            log("  [2] Ищу опцию [" + feed.text + "]...");
            const currentOptions = getFeedOptions();
            
            // Ищем опцию по тексту (точное или частичное совпадение)
            let targetOption = currentOptions.find(o => 
                o.text.trim() === feed.text.trim()
            );
            
            // Если не нашли точное совпадение — ищем по части текста
            if (!targetOption) {
                targetOption = currentOptions.find(o => 
                    o.text.toLowerCase().includes(feed.text.toLowerCase()) ||
                    feed.text.toLowerCase().includes(o.text.toLowerCase())
                );
            }
            
            // Если всё ещё не нашли — ищем по порядковому номеру
            if (!targetOption && feedIndex < currentOptions.length) {
                targetOption = currentOptions[feedIndex];
                log(`  ⚠️ Опция не найдена по тексту, использую #${feedIndex + 1}`);
            }
            
            if (!targetOption) {
                log('  ❌ Опция [' + feed.text + '] не найдена в dropdown. Пропускаю...');
                feedIndex = (feedIndex + 1) % feeds.length;
                document.body.click(); // Закрываем dropdown
                await sleep(2000);
                continue;
            }
            
            // Кликаем на опцию
            log('  [3] Кликаю на [' + targetOption.text + ']...');
            directClick(targetOption.el);
            
            // Ждем обновления контента (SPA — без перезагрузки)
            log("  [4] Жду обновления контента...");
            await sleep(3000);
            
            // Проверяем что dropdown закрылся
            document.body.click();
            await sleep(500);
            
            // ШАГ 3: Лайкаем записи в текущей ленте
            log("  [5] Лайкаю записи...");
            await scrollToTop();
            await sleep(1000);
            
            const clicked = await scrollAndLike(30);
            totalLiked += clicked;
            
            log(`  ✅ Лайкнуто: ${clicked} (всего: ${totalLiked})`);
            
            if (clicked === 0) {
                cyclesWithoutLikes++;
                log(`  📭 Пустая лента (${cyclesWithoutLikes}/3)`);
                
                if (cyclesWithoutLikes >= 3) {
                    log("  💤 Все ленты пусты, делаю паузу 30с...");
                    await sleep(30000);
                    cyclesWithoutLikes = 0;
                }
            } else {
                cyclesWithoutLikes = 0;
            }
            
            // Переходим к следующей ленте
            feedIndex = (feedIndex + 1) % feeds.length;
            log(`  ➡️ Следующая лента...`);
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
