(function() {
    if (window.kudosBotRunning) {
        console.log("Бот уже запущен.");
        return;
    }
    window.kudosBotRunning = true;
    window.kudosBotShouldStop = false;
    
    // Восстанавливаем likedActivities из localStorage (чтобы не лайкать повторно при навигации)
    try {
        const saved = localStorage.getItem('strakudos_liked');
        window.likedActivities = saved ? new Set(JSON.parse(saved)) : new Set();
    } catch(e) {
        window.likedActivities = new Set();
    }

    const STRATEGY = window.kudosStrategy || 'smart';
    
    // Функция для сохранения likedActivities
    function saveLikedActivities() {
        try {
            localStorage.setItem('strakudos_liked', JSON.stringify([...window.likedActivities]));
        } catch(e) {}
    }

    function log(msg) {
        console.log("[KudosBot] " + msg);
        if (window.AndroidApp) window.AndroidApp.log(msg);
    }

    function updateStats(name) {
        if (window.AndroidApp) window.AndroidApp.onKudosGiven(name);
    }
    
    // Сохраняем likedActivities периодически
    setInterval(() => {
        saveLikedActivities();
    }, 30000); // Каждые 30 секунд

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

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

    async function refreshFeed() {
        log("Обновляю ленту...");
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(300);
        
        // Пробуем нажать кнопку обновления если есть
        const refreshBtn = document.querySelector('button[data-testid*="refresh" i], [class*="refresh" i] button');
        if (refreshBtn) {
            refreshBtn.click();
            log("Нажата кнопка обновления");
            await sleep(2000);
            return;
        }
        
        // Симулируем pull-to-refresh скроллом вверх
        log("Pull-to-refresh: скролл вверх...");
        window.scrollTo({ top: -200, behavior: 'smooth' });
        await sleep(1500);
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(2000);
    }

    async function processVisibleButtons() {
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

    // ===== STRATEGIES =====

    async function runSmartStrategy() {
        log("Старт УМНОЙ стратегии...");
        let cycle = 0;
        const min = () => window.kudosMinDelay || 5000;
        const max = () => window.kudosMaxDelay || 12000;

        while (!window.kudosBotShouldStop) {
            cycle++;
            log(`=== Цикл ${cycle} ===`);
            
            let clicked = await processVisibleButtons();
            
            if (clicked === 0) {
                let scrollAttempts = 0;
                let totalScrolled = 0;
                
                while (clicked === 0 && scrollAttempts < 8 && !window.kudosBotShouldStop) {
                    const scrollAmount = Math.floor(Math.random() * 200) + 300;
                    window.scrollBy({ top: scrollAmount, behavior: 'auto' });
                    totalScrolled += scrollAmount;
                    await sleep(Math.max(200, Math.floor(Math.random() * (max() - min())) + min()));
                    
                    clicked = await processVisibleButtons();
                    scrollAttempts++;
                }
                
                if (totalScrolled > 3000 || clicked === 0) {
                    log("Достигнут предел ленты");
                    await scrollToTop();
                    clicked = await processVisibleButtons();
                    
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

    async function runTopOnlyStrategy() {
        log("Старт стратегии ТОЛЬКО НОВЫЕ...");
        let refreshCount = 0;
        const min = () => window.kudosMinDelay || 5000;

        while (!window.kudosBotShouldStop) {
            window.scrollTo({ top: 0, behavior: 'auto' });
            await sleep(500);
            
            const clicked = await processVisibleButtons();
            
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
            
            // Скроллим вниз и проверяем, изменилась ли позиция
            lastScrollY = window.scrollY;
            window.scrollBy({ top: 600, behavior: 'auto' });
            await sleep(500);
            
            // Если скролл не изменился — достигнут конец страницы
            if (window.scrollY === lastScrollY) {
                noProgressCount++;
                log(`⬇️ Конец ленты (${noProgressCount}/3)`);
                
                if (noProgressCount >= 3) {
                    log("🔄 Достигнут конец ленты. Возвращаюсь в начало...");
                    await scrollToTop();
                    noProgressCount = 0;
                    // После возврата ждем загрузки новых постов
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
            
            let clicked = await processVisibleButtons();
            
            if (clicked === 0) {
                // Медленный скролл как человек
                const scrollAmount = Math.floor(Math.random() * 300) + 200;
                window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                
                const readTime = Math.floor(Math.random() * (max() - min())) + min();
                log(`Читаю ленту ${(readTime/1000).toFixed(1)} сек...`);
                await sleep(readTime);
                
                clicked = await processVisibleButtons();
                
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

    // ===== КЛУБЫ (РОТАЦИЯ) =====
    
    async function getClubIds() {
        log("Получаю список клубов...");
        const clubIds = [];
        
        try {
            // Пробуем найти клубы в меню/навигации на текущей странице
            const navLinks = document.querySelectorAll('a[href*="/clubs/"]');
            navLinks.forEach(link => {
                const match = link.href.match(/\/clubs\/(\d+)/);
                if (match && !clubIds.includes(match[1])) {
                    clubIds.push(match[1]);
                }
            });
            
            if (clubIds.length > 0) {
                log(`Найдено ${clubIds.length} клубов в навигации`);
                return clubIds;
            }
            
            // Если не нашли, переходим на страницу клубов
            log("Переход на страницу клубов...");
            window.location.href = "https://www.strava.com/clubs";
            
            // Ждем загрузки - это прервет выполнение бота
            // После перезагрузки страницы бот перезапустится
            await sleep(5000);
            
            // Собираем клубы со страницы
            const clubLinks = document.querySelectorAll('a[href^="/clubs/"], a[href*="strava.com/clubs/"]');
            clubLinks.forEach(link => {
                const match = link.href.match(/\/clubs\/(\d+)/);
                if (match && !clubIds.includes(match[1])) {
                    clubIds.push(match[1]);
                }
            });
            
            log(`Найдено ${clubIds.length} клубов`);
        } catch(e) {
            log("Ошибка получения клубов: " + e.message);
        }
        
        return clubIds;
    }
    
    async function likeFeed(maxCycles) {
        let cycle = 0;
        const min = () => window.kudosMinDelay || 3000;
        
        while (cycle < maxCycles && !window.kudosBotShouldStop) {
            cycle++;
            let clicked = await processVisibleButtons();
            
            if (clicked === 0) {
                // Скроллим вниз и ищем
                let scrollAttempts = 0;
                while (clicked === 0 && scrollAttempts < 10 && !window.kudosBotShouldStop) {
                    window.scrollBy({ top: 500, behavior: 'auto' });
                    await sleep(300);
                    clicked = await processVisibleButtons();
                    scrollAttempts++;
                }
                
                // Если ничего не нашли после 10 скроллов - лента закончилась
                if (clicked === 0) {
                    log("Лента пуста или все лайкнуто");
                    break;
                }
            }
            
            await sleep(Math.max(200, Math.floor(min() / 3)));
        }
    }
    
    async function runClubsStrategy() {
        log("Старт стратегии КЛУБЫ (ротация)...");
        
        // Сначала получаем список клубов
        // При первом запуске бота на странице dashboard/clubs
        // или clubs - собираем ID и сохраняем
        
        let clubIds = [];
        
        // Пробуем восстановить список клубов из localStorage
        try {
            const saved = localStorage.getItem('strakudos_clubs');
            if (saved) {
                clubIds = JSON.parse(saved);
                log(`Восстановлено ${clubIds.length} клубов из памяти`);
            }
        } catch(e) {}
        
        // Если список пуст, пробуем собрать с текущей страницы
        if (clubIds.length === 0) {
            // Пробуем найти клубы в боковом меню или навигации
            const links = document.querySelectorAll('a[href*="/clubs/"]');
            links.forEach(link => {
                const match = link.href.match(/\/clubs\/(\d+)/);
                if (match && !clubIds.includes(match[1])) {
                    clubIds.push(match[1]);
                }
            });
            
            if (clubIds.length > 0) {
                log(`Найдено ${clubIds.length} клубов`);
                try {
                    localStorage.setItem('strakudos_clubs', JSON.stringify(clubIds));
                } catch(e) {}
            }
        }
        
        // Составляем список фидов для ротации
        const feeds = [];
        feeds.push({ name: 'Основная лента', url: 'https://www.strava.com/dashboard' });
        
        clubIds.forEach(id => {
            feeds.push({ name: `Клуб ${id}`, url: `https://www.strava.com/clubs/${id}/dashboard` });
        });
        
        log(`Ротация между ${feeds.length} лентами`);
        
        let feedIndex = 0;
        
        while (!window.kudosBotShouldStop) {
            const feed = feeds[feedIndex];
            log(`=== ${feed.name} ===`);
            
            // Переходим на ленту
            window.location.href = feed.url;
            
            // Ждем загрузки - страница перезагрузится и бот перезапустится
            // Это нормальное поведение, MainActivity перезапустит бот
            await sleep(4000);
            
            // Лайкаем в текущей ленте (3 цикла, потом переключаемся)
            await likeFeed(3);
            
            feedIndex = (feedIndex + 1) % feeds.length;
            log(`Переключаюсь на следующую ленту...`);
            await sleep(2000);
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
