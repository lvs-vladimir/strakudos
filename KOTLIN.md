# План переписывания Strakudos на чистую Kotlin-архитектуру

## Статус: выполнено

- Kotlin теперь управляет lifecycle, состоянием, настройками, логами и выбором стратегий.
- Все production-стратегии перенесены в Kotlin: smart, top-only, aggressive, human, clubs.
- `bot.js` оставлен тонким entrypoint, `dom_adapter.js` — thin DOM API, legacy JS сохранён как `old_bot_backup.js` только для fallback.
- Production bridge `AndroidApp` минимален: `log()` и `reportError()`; legacy/API diagnostics вынесены в отдельные bridges.
- `MainActivity` подключает компоненты, `BotController` управляет запуском/остановкой/рестартом, `WebViewController` выполняет WebView/JS-команды.
Android source layout переведён полностью на `app/src/main/kotlin`; старого Java-каталога и Java-файлов нет.

## 1. Цель переписывания

Сделать приложение стабильным, управляемым и расширяемым:

- нормальный старт/стоп/рестарт бота;
- автозапуск после загрузки Android x86;
- единый источник настроек;
- стратегии на Kotlin;
- JavaScript только как тонкий DOM-адаптер;
- меньше багов с `window.kudosBotRunning`, `localStorage`, повторным стартом;
- нормальные логи и диагностика;
- простая поддержка новых стратегий.

---

## 2. Текущие проблемы

Сейчас есть несколько слабых мест:

1. **`MainActivity.kt` перегружен**:
   - WebView;
   - запуск бота;
   - настройки;
   - API-тесты;
   - логи;
   - bridge;
   - reset liked data;
   - autostart;
   - service control.

2. **`bot.js` слишком большой**:
   - стратегии;
   - DOM-поиск;
   - API v3;
   - клубы;
   - reset state;
   - scroll/reload логика;
   - много глобальных переменных.

3. **Состояние хранится в разных местах**:
   - `SharedPreferences`;
   - `localStorage`;
   - `window.likedActivities`;
   - `isBotRunning`;
   - `window.kudosBotRunning`.

4. **Старт/стоп fragile**:
   - легко оставить старый `window.kudosBotRunning`;
   - повторный старт может не сработать;
   - reload WebView требует reinject;
   - foreground service не всегда значит, что бот реально работает.

5. **Стратегии трудно отлаживать**:
   - логика умной/человечной/клубной стратегии живёт внутри JS;
   - сложно тестировать без WebView;
   - тяжело понять, почему бот скроллит или обновляет страницу.

---

## 3. Рекомендуемая архитектура

Оставить Android на Kotlin, а JavaScript превратить в простой DOM-адаптер.

```text
Kotlin:

MainActivity
WebViewController
BotController
BotStateMachine
StrategyEngine
SmartStrategy
HumanStrategy
ClubsStrategy
TopOnlyStrategy
AggressiveStrategy
SettingsRepository
LogRepository
LikedActivityRepository
BootReceiver
KudosService

JavaScript:

dom_adapter.js
scanFeed()
clickKudos(activityId)
scrollBy(px)
scrollToTop()
reloadPage()
getPageInfo()
```

---

## 4. Новый принцип работы

### Сейчас JavaScript сам решает:

- что сканировать;
- куда скроллить;
- когда лайкать;
- когда обновлять страницу;
- когда остановиться.

### После переписывания Kotlin решает:

- какая стратегия активна;
- сколько подряд уже лайкнутых;
- когда скроллить;
- когда обновлять страницу;
- когда остановиться;
- когда перезапустить WebView.

JavaScript только возвращает данные и выполняет простые команды.

---

## 5. Основные Kotlin-компоненты

### 5.1 `BotController`

Главный управляющий класс.

Ответственность:

- `start()`;
- `stop()`;
- `restart()`;
- `pause()`;
- `resume()`;
- контроль `BotState`;
- запуск стратегии;
- связь с WebView.

Пример:

```kotlin
class BotController(
    private val webViewController: WebViewController,
    private val settingsRepository: SettingsRepository,
    private val logRepository: LogRepository,
    private val strategyFactory: StrategyFactory
)
```

---

### 5.2 `BotState`

Явная state machine:

```kotlin
enum class BotState {
    STOPPED,
    STARTING,
    RUNNING,
    PAUSED,
    RELOADING,
    ERROR
}
```

Это должно заменить хаос:

```js
window.kudosBotRunning
window.kudosBotShouldStop
```

и Kotlin-переменные:

```kotlin
isBotRunning
pendingBotRestart
```

---

### 5.3 `WebViewController`

Отвечает только за WebView.

Методы:

```kotlin
fun loadStrava()
fun reload()
fun injectDomAdapter()
fun evaluateJs(script: String, callback: ...)
fun isOnStravaFeed(): Boolean
fun scrollToTop()
fun clearBotState()
```

---

### 5.4 `SettingsRepository`

Единый доступ к настройкам.

```kotlin
data class BotSettings(
    val strategy: BotStrategyType,
    val minDelayMs: Int,
    val maxDelayMs: Int,
    val clubsSpeed: ClubsSpeed,
    val consecutiveLikedLimit: Int,
    val useApiV3: Boolean,
    val autostartEnabled: Boolean
)
```

---

### 5.5 `LogRepository`

Отдельно хранить логи.

Методы:

```kotlin
fun add(message: String)
fun clear()
fun getAll(): String
fun export(): String
```

---

### 5.6 `LikedActivityRepository`

Вместо хаоса `localStorage`.

```kotlin
interface LikedActivityRepository {
    fun isLiked(activityId: String): Boolean
    fun markLiked(activityId: String)
    fun reset()
    fun count(): Int
}
```

Хранить можно в `SharedPreferences` или Room.

Для начала достаточно `SharedPreferences`.

---

## 6. Стратегии Kotlin

Сделать интерфейс:

```kotlin
interface BotStrategy {
    suspend fun run(context: BotContext)
}
```

`BotContext`:

```kotlin
data class BotContext(
    val web: WebViewController,
    val settings: BotSettings,
    val likedRepo: LikedActivityRepository,
    val logs: LogRepository,
    val shouldStop: () -> Boolean
)
```

---

## 7. Умная стратегия после переписывания

Логика должна быть такая:

1. Сканировать видимые карточки.
2. Если есть нелайкнутые — лайкнуть.
3. Если карточка своя — пропустить.
4. Если карточка уже лайкнута — увеличить `consecutiveLiked`.
5. Если найден новый лайк — `consecutiveLiked = 0`.
6. Скроллить вниз.
7. Если `consecutiveLiked >= limit` — reload страницы и начать сверху.
8. Если достигнут конец ленты — reload страницы и начать сверху.

Псевдокод:

```kotlin
while (!shouldStop()) {
    val cards = web.scanVisibleCards()

    for (card in cards) {
        if (card.isOwn) continue

        if (card.isAlreadyLiked) {
            consecutiveLiked++
        } else {
            web.clickKudos(card.activityId)
            likedRepo.markLiked(card.activityId)
            consecutiveLiked = 0
        }

        if (consecutiveLiked >= settings.consecutiveLikedLimit) {
            web.reload()
            consecutiveLiked = 0
            break
        }
    }

    delay(randomDelay())
    web.scrollDown(randomPx())

    if (web.isEndOfFeed()) {
        web.reload()
    }
}
```

---

## 8. Человечная стратегия

Логика:

- медленнее;
- плавный scroll;
- длинные случайные паузы;
- иногда "читает" ленту;
- после конца ленты reload;
- тоже пропускает свои тренировки.

---

## 9. Клубная стратегия

Отдельный класс:

```kotlin
class ClubsStrategy : BotStrategy
```

Ответственность:

- открыть список клубов;
- собрать клубы;
- зайти в клуб;
- открыть вкладку активности;
- лайкать свежие активности;
- пропускать свои;
- пропускать старше 3 дней;
- если `consecutiveLikedLimit` достигнут — следующий клуб.

---

## 10. Новый `dom_adapter.js`

Он должен быть маленьким.

Пример API:

```js
window.StrakudosDom = {
    scanVisibleCards() { ... },
    clickKudos(activityId) { ... },
    scrollBy(px) { ... },
    scrollToTop() { ... },
    isEndOfFeed() { ... },
    reloadPage() { location.reload(); }
}
```

Возвращать Kotlin JSON:

```json
{
  "cards": [
    {
      "activityId": "123",
      "athleteId": "456",
      "athleteName": "Name",
      "isOwn": false,
      "isLiked": true,
      "hasKudosButton": true
    }
  ],
  "scrollY": 1200,
  "scrollHeight": 9000,
  "isEnd": false
}
```

---

## 11. Этапы переписывания

### Этап 1. Подготовка

Зафиксировать текущую рабочую версию.

Сделать отдельную ветку:

```bash
git checkout -b kotlin-refactor
```

---

### Этап 2. Вынести настройки

Создать:

```text
SettingsRepository.kt
BotSettings.kt
BotStrategyType.kt
```

Перенести из `MainActivity` и `SettingsActivity` работу с:

- strategy;
- min/max delay;
- clubs speed;
- consecutive limit;
- API v3;
- autostart;
- is_bot_running;
- kudos_count.

---

### Этап 3. Вынести логи

Создать:

```text
LogRepository.kt
```

Заменить прямые обращения к `SharedPreferences("logs")`.

---

### Этап 4. Вынести WebView

Создать:

```text
WebViewController.kt
```

Перенести:

- WebView settings;
- CookieManager;
- WebViewClient;
- reload;
- inject JS;
- evaluateJavascript;
- page finished handling.

---

### Этап 5. Вынести BotController

Создать:

```text
BotController.kt
BotState.kt
```

Перенести:

- startBot;
- stopBot;
- restartBot;
- pendingBotRestart;
- wake loop;
- service start/stop;
- state updates.

---

### Этап 6. Переписать `bot.js`

Разделить:

```text
dom_adapter.js
old_bot_backup.js
```

`dom_adapter.js` должен только:

- сканировать DOM;
- нажимать кнопку;
- скроллить;
- возвращать JSON.

Стратегии убрать из JS.

---

### Этап 7. Перенести стратегии в Kotlin

Создать:

```text
strategies/SmartStrategy.kt
strategies/HumanStrategy.kt
strategies/TopOnlyStrategy.kt
strategies/AggressiveStrategy.kt
strategies/ClubsStrategy.kt
```

---

### Этап 8. Переписать bridge

Сейчас bridge используется как:

```js
AndroidApp.log()
AndroidApp.onKudosGiven()
AndroidApp.setClubName()
AndroidApp.reloadPage()
```

После рефакторинга bridge должен быть минимальный:

```kotlin
class BotJsBridge {
    @JavascriptInterface
    fun log(message: String)

    @JavascriptInterface
    fun reportError(error: String)
}
```

Клики и сканирование Kotlin вызывает сам через `evaluateJavascript`.

---

### Этап 9. Автозапуск

Оставить:

```text
BootReceiver.kt
```

Сделать правильно:

- если `autostart_enabled == true`, открыть `MainActivity`;
- если `is_bot_running == true`, после загрузки страницы запустить `BotController.start()`.

---

### Этап 10. Тестирование

Проверить сценарии:

1. Первый запуск.
2. Вход в Strava.
3. Старт умной стратегии.
4. Стоп.
5. Повторный старт.
6. Reload страницы.
7. Свои тренировки пропускаются.
8. `give_kudos_button` не нажимается.
9. Человечная стратегия доходит до конца и reload.
10. Умная стратегия считает 10 подряд уже лайкнутых.
11. Клубы переходят дальше.
12. Сброс лайков чистит состояние.
13. Автозапуск после перезагрузки Android x86.

---

## 12. Рекомендуемый порядок работ

Делать так:

1. Не трогать всё сразу.
2. Сначала вынести `SettingsRepository` и `LogRepository`.
3. Потом `WebViewController`.
4. Потом `BotController`.
5. Потом сделать `dom_adapter.js`.
6. Потом перенести **одну стратегию** — умную.
7. Проверить.
8. Потом переносить остальные стратегии.

---

## 13. Минимальный безопасный MVP

Первый рабочий MVP Kotlin-версии:

- оставить UI как есть;
- WebView оставить как есть;
- перенести только:
  - `startBot`;
  - `stopBot`;
  - `restartBot`;
  - `SmartStrategy`;
- оставить JS только для DOM scan/click.

Это даст быстрый результат без большого риска.

---

## 14. Что не делать сразу

Не надо сразу:

- переписывать все стратегии одновременно;
- удалять старый `bot.js`;
- менять UI;
- добавлять Room;
- добавлять Coroutines везде, пока нет стабильного MVP;
- делать новый дизайн.

---

## 15. Итоговая цель архитектуры

После переписывания должно быть так:

```text
MainActivity только подключает компоненты.
BotController управляет жизненным циклом бота.
StrategyEngine выбирает стратегию.
SmartStrategy / HumanStrategy / ClubsStrategy решают что делать.
WebViewController выполняет JS-команды.
dom_adapter.js только читает DOM и кликает.
```

Это сделает проект намного стабильнее, чем текущий монолит `MainActivity + bot.js`.
