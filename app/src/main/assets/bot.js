(function() {
    if (window.kudosBotRunning) {
        console.log("Бот уже запущен.");
        return;
    }
    window.kudosBotRunning = true;
    window.kudosBotShouldStop = false;
    window.likedActivities = new Set();

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
        log("Возвращаюсь в начало ленты для проверки новых тренировок...");
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
        log("Обновляю ленту активностей...");
        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(300);
        
        // Пробуем найти и нажать кнопку обновления, если есть
        const refreshBtn = document.querySelector('button[data-testid*="refresh" i], [class*="refresh" i] button');
        if (refreshBtn) {
            refreshBtn.click();
            log("Нажата кнопка обновления ленты");
            await sleep(2000);
            return;
        }
        
        // Альтернативно - перезагружаем страницу dashboard
        if (window.location.href.includes('/dashboard')) {
            window.location.reload();
            log("Страница обновлена для получения новых тренировок");
            await sleep(3000);
        }
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

    async function startLoop() {
        log("Старт умной стратегии лайкания...");
        let cycle = 0;
        const min = () => window.kudosMinDelay || 5000;
        const max = () => window.kudosMaxDelay || 12000;

        while (!window.kudosBotShouldStop) {
            cycle++;
            log(`=== Цикл ${cycle} ===`);
            
            // ШАГ 1: Лайкаем все видимые в текущей позиции
            let clicked = await processVisibleButtons();
            
            // ШАГ 2: Если ничего не нашли - скроллим вниз небольшими шагами
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
                
                // ШАГ 3: Если проскроллили слишком много или не нашли - возвращаемся вверх
                if (totalScrolled > 3000 || clicked === 0) {
                    log("Достигнут предел ленты или нет новых тренировок");
                    
                    // Возвращаемся в начало
                    await scrollToTop();
                    
                    // Проверяем новые тренировки сверху
                    clicked = await processVisibleButtons();
                    
                    // Если все еще нет - обновляем страницу
                    if (clicked === 0 && cycle % 3 === 0) {
                        await refreshFeed();
                    } else {
                        // Ждем перед следующей проверкой
                        const waitTime = Math.max(3000, min() * 2);
                        log(`Жду ${(waitTime/1000).toFixed(1)} сек перед следующей проверкой...`);
                        await sleep(waitTime);
                    }
                }
            }
            
            // Короткая пауза между циклами
            if (!window.kudosBotShouldStop) {
                await sleep(Math.max(500, Math.floor(min() / 2)));
            }
        }
        
        log("Автоматизация остановлена.");
        window.kudosBotRunning = false;
    }

    startLoop();
})();
