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
        log("🔍 Ищу селектор лент (стрелку рядом с Подписки)...");
        
        // СТРАТЕГИЯ 1: Ищем кнопку-стрелку РЯДОМ с текстом "Подписки"
        // Сначала найдем текст "Подписки" или "Following"
        const allElements = document.querySelectorAll('span, div, button, a, h1, h2, h3');
        let feedLabelEl = null;
        
        for (const el of allElements) {
            const text = (el.textContent || '').trim().toLowerCase();
            if (text === 'подписки' || text === 'following' || text === 'feeds') {
                const rect = el.getBoundingClientRect();
                if (rect.top < 200) {
                    feedLabelEl = el;
                    log(`   📌 Найден текст ленты: "${el.textContent.trim()}" на позиции top=${Math.round(rect.top)}`);
                    break;
                }
            }
        }
        
        if (feedLabelEl) {
            // Ищем кнопку-стрелку РЯДОМ с этим текстом (справа или в том же контейнере)
            const labelRect = feedLabelEl.getBoundingClientRect();
            const labelCenterX = labelRect.left + labelRect.width / 2;
            const labelCenterY = labelRect.top + labelRect.height / 2;
            
            // Ищем ближайшую кнопку/иконку справа
            const nearbyElements = document.querySelectorAll('button, svg, i, [class*="icon" i], [class*="arrow" i], [class*="chevron" i]');
            let closestBtn = null;
            let closestDist = Infinity;
            
            for (const btn of nearbyElements) {
                const rect = btn.getBoundingClientRect();
                // Должен быть справа от текста и на той же высоте
                const btnCenterX = rect.left + rect.width / 2;
                const btnCenterY = rect.top + rect.height / 2;
                
                const dist = Math.sqrt(
                    Math.pow(btnCenterX - labelCenterX, 2) + 
                    Math.pow(btnCenterY - labelCenterY, 2)
                );
                
                // Должен быть справа (x больше) и близко по Y
                if (btnCenterX > labelCenterX && 
                    Math.abs(btnCenterY - labelCenterY) < 50 &&
                    dist < 200 &&
                    dist < closestDist) {
                    closestDist = dist;
                    closestBtn = btn;
                }
            }
            
            if (closestBtn) {
                const btnRect = closestBtn.getBoundingClientRect();
                log(`   🎯 Найдена стрелка/кнопка рядом! Расстояние: ${Math.round(closestDist)}px`);
                directClick(closestBtn);
                await sleep(1500);
                return true;
            }
            
            // Если не нашли стрелку — пробуем кликнуть на родительский контейнер
            const parent = feedLabelEl.parentElement;
            if (parent && (parent.tagName === 'BUTTON' || parent.onclick || parent.getAttribute('role') === 'button')) {
                log(`   🎯 Кликаю на родителя текста ленты`);
                directClick(parent);
                await sleep(1500);
                return true;
            }
            
            // Пробуем кликнуть на сам текст (иногда весь блок кликабельный)
            log(`   🎯 Кликаю на текст ленты (fallback)`);
            directClick(feedLabelEl);
            await sleep(1500);
            return true;
        }
        
        // СТРАТЕГИЯ 2: Ищем любые кнопки с иконками стрелок вверху страницы
        const arrowButtons = document.querySelectorAll('button, [role="button"]');
        for (const btn of arrowButtons) {
            const rect = btn.getBoundingClientRect();
            if (rect.top > 200) continue;
            
            const html = btn.innerHTML.toLowerCase();
            const hasArrow = html.includes('chevron') || 
                            html.includes('arrow') || 
                            html.includes('▼') || 
                            html.includes('▾') ||
                            html.includes('caret') ||
                            btn.getAttribute('aria-expanded') !== null;
            
            if (hasArrow && rect.width < 60 && rect.height < 60) {
                log(`   🎯 Найдена кнопка-стрелка`);
                directClick(btn);
                await sleep(1500);
                return true;
            }
        }
        
        // СТРАТЕГИЯ 3: Ищем aria-expanded
        const toggleButtons = document.querySelectorAll('[aria-expanded]');
        for (const btn of toggleButtons) {
            const rect = btn.getBoundingClientRect();
            if (rect.top < 200) {
                log(`   🎯 Найден toggle (aria-expanded)`);
                directClick(btn);
                await sleep(1500);
                return true;
            }
        }
        
        // СТРАТЕГИЯ 4: Просто ищем кнопки с data-testid
        const selectors = [
            '[data-testid="feed-selector-toggle"]',
            '[data-testid="feed-dropdown"]',
            '[data-testid="club-selector"]',
            '[class*="feed-selector" i]',
            '[class*="dropdown-toggle" i]',
        ];
        
        for (const sel of selectors) {
            try {
                const el = document.querySelector(sel);
                if (el) {
                    log(`   🎯 Найден селектор по CSS: ${sel}`);
                    directClick(el);
                    await sleep(1500);
                    return true;
                }
            } catch(e) {}
        }
        
        log("❌ Селектор лент не найден");
        return false;
    }
    
    function getFeedOptions() {
        const options = [];
        
        // Ищем открытый dropdown/menu - очень широкий поиск
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
        
        let menuEl = null;
        for (const sel of menuSelectors) {
            try {
                const elements = document.querySelectorAll(sel);
                for (const el of elements) {
                    const style = window.getComputedStyle(el);
                    // Элемент должен быть видимым и иметь дочерние элементы
                    if (style.display !== 'none' && style.visibility !== 'hidden' && el.children.length > 0) {
                        // Проверяем что это dropdown а не случайный элемент
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 100 && rect.height > 50) {
                            menuEl = el;
                            log(`📂 Найден dropdown контейнер: ${sel}, дочерних: ${el.children.length}`);
                            break;
                        }
                    }
                }
                if (menuEl) break;
            } catch(e) {}
        }
        
        // Если нашли контейнер, собираем ВСЕ элементы внутри
        if (menuEl) {
            const allChildren = menuEl.querySelectorAll('*');
            log(`🔍 Сканирую ${allChildren.length} элементов в dropdown...`);
            
            for (const child of allChildren) {
                const text = (child.textContent || '').trim();
                const href = child.getAttribute('href') || '';
                
                // Пропускаем пустые и слишком длинные
                if (!text || text.length === 0 || text.length > 100) continue;
                
                // Это может быть кликабельный элемент?
                const isClickable = child.tagName === 'A' || 
                                   child.tagName === 'BUTTON' ||
                                   child.tagName === 'LI' ||
                                   child.getAttribute('role') === 'menuitem' ||
                                   child.getAttribute('role') === 'option' ||
                                   child.getAttribute('onclick') ||
                                   child.closest('a') ||
                                   child.closest('button');
                
                if (isClickable) {
                    // Получаем href из самого элемента или ближайшей ссылки
                    let actualHref = href;
                    if (!actualHref) {
                        const parentLink = child.closest('a');
                        if (parentLink) actualHref = parentLink.getAttribute('href') || '';
                    }
                    
                    // Проверяем что это похоже на опцию ленты (не настройки, не профиль и т.д.)
                    const lowerText = text.toLowerCase();
                    const isFeedOption = actualHref.includes('/dashboard') || 
                                         actualHref.includes('/clubs/') ||
                                         lowerText === 'following' ||
                                         lowerText === 'подписки' ||
                                         lowerText.includes('club') ||
                                         lowerText.includes('клуб');
                    
                    if (isFeedOption || actualHref) {
                        // Проверяем дубликаты
                        if (!options.find(o => o.text === text && o.href === actualHref)) {
                            log(`   📋 Опция: "${text}" href=${actualHref}`);
                            options.push({ el: child, text, href: actualHref });
                        }
                    }
                }
            }
        }
        
        // Также ищем все ВИДИМЫЕ ссылки на /clubs/ и /dashboard во всем документе
        // (на случай если dropdown не был найден как контейнер)
        if (options.length === 0) {
            log("🔍 Dropdown не найден, ищу ссылки на всей странице...");
            const allLinks = document.querySelectorAll('a');
            for (const link of allLinks) {
                const style = window.getComputedStyle(link);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                
                const href = link.getAttribute('href') || '';
                const text = (link.textContent || '').trim();
                
                if (!text || text.length === 0 || text.length > 100) continue;
                
                // Ищем ссылки на ленты
                const isFeed = href.includes('/dashboard') || 
                              href.includes('/clubs/');
                
                if (isFeed && !href.includes('/search') && !href.includes('/settings')) {
                    if (!options.find(o => o.href === href)) {
                        options.push({ el: link, text, href });
                    }
                }
            }
        }
        
        log(`📊 Всего найдено опций: ${options.length}`);
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
        topElements.slice(0, 10).forEach(e => log(`    - "${e.text}" (${e.tag}) href=${e.href} top=${e.top}`));
        
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
        uniqueClubs.forEach((text, href) => log(`    - ${href}: "${text}"`));
        
        // Все ссылки на dashboard
        const dashLinks = document.querySelectorAll('a[href*="dashboard"]');
        log(`  Ссылок на dashboard: ${dashLinks.length}`);
        
        // Элементы с aria-expanded (dropdown toggles)
        const toggles = document.querySelectorAll('[aria-expanded]');
        log(`  Toggle элементов (aria-expanded): ${toggles.length}`);
        for (const t of toggles) {
            const text = (t.textContent || '').trim().substring(0, 40);
            const expanded = t.getAttribute('aria-expanded');
            log(`    - "${text}" expanded=${expanded}`);
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
        log("🏃 Старт стратегии КЛУБЫ...");
        
        // Запускаем диагностику
        const diag = diagnosePage();
        
        // Собираем ВСЕ ленты на странице
        let feeds = findAllFeedsOnPage();
        
        log(`📊 Всего лент найдено: ${feeds.length}`);
        feeds.forEach((f, i) => {
            const extra = f.clubId ? ` (club #${f.clubId})` : '';
            log(`  ${i+1}. [${f.type}] ${f.text} → ${f.href || 'no href'}${extra}`);
        });
        
        if (feeds.length <= 1) {
            log("⚠️ Найдена только 1 лента. Возможно, нужно открыть меню клубов.");
            log("🔍 Пробую найти и открыть боковое меню...");
            
            // Пробуем открыть боковое меню (hamburger)
            const menuBtn = document.querySelector('button[aria-label*="menu" i], button[class*="hamburger" i], [data-testid*="menu" i], button svg[class*="menu" i]');
            if (menuBtn) {
                log("  Найдена кнопка меню, открываю...");
                directClick(menuBtn);
                await sleep(2000);
                
                // После открытия меню заново ищем ленты
                feeds = findAllFeedsOnPage();
                log(`  После открытия меню найдено лент: ${feeds.length}`);
            }
        }
        
        // Если всё ещё 1 лента — пробуем навигацию через /clubs/search
        if (feeds.length <= 1) {
            log("⚠️ Всё ещё только 1 лента. Перехожу на страницу клубов...");
            window.location.href = 'https://www.strava.com/clubs/search';
            await sleep(4000);
            
            // После загрузки страницы клубов заново ищем
            feeds = findAllFeedsOnPage();
            log(`  После перехода на /clubs/search найдено лент: ${feeds.length}`);
        }
        
        // Финальная проверка
        if (feeds.length <= 1) {
            log("❌ Не удалось найти клубы. Переключаюсь на умную стратегию.");
            await runSmartStrategy();
            return;
        }
        
        let feedIndex = 0;
        let emptyCycles = 0;
        let totalLiked = 0;
        
        while (!window.kudosBotShouldStop) {
            const feed = feeds[feedIndex];
            log(`\n=== 📰 [${feed.type.toUpperCase()}] ${feed.text} ===`);
            
            // Проверяем, не на нужной ли уже странице
            const currentPath = window.location.pathname;
            const isCurrent = (feed.type === 'main' && currentPath.includes('dashboard')) ||
                             (feed.type === 'club' && currentPath.includes(`/clubs/${feed.clubId}`));
            
            if (!isCurrent) {
                // Переходим на ленту
                const navSuccess = await navigateToFeed(feed);
                if (!navSuccess) {
                    log("  ❌ Не удалось перейти, пропускаю...");
                    feedIndex = (feedIndex + 1) % feeds.length;
                    await sleep(2000);
                    continue;
                }
            } else {
                log("  ℹ️ Уже на нужной странице");
            }
            
            // Лайкаем в текущей ленте
            await scrollToTop();
            await sleep(1500); // Ждем полной загрузки контента
            
            const clicked = await scrollAndLike(25);
            totalLiked += clicked;
            
            log(`  ✅ Лайкнуто в этой ленте: ${clicked} (всего: ${totalLiked})`);
            
            if (clicked === 0) {
                emptyCycles++;
                log(`  📭 Пустая лента (${emptyCycles}/3)`);
                
                if (emptyCycles >= 3) {
                    log("  💤 Все ленты пусты, пауза 30с...");
                    await sleep(30000);
                    emptyCycles = 0;
                }
            } else {
                emptyCycles = 0;
            }
            
            // Переходим к следующей ленте
            feedIndex = (feedIndex + 1) % feeds.length;
            log(`  ➡️ Переключаюсь на следующую ленту...`);
            await sleep(3000);
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
