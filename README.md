# Strakudos

**Strakudos** — Android-приложение для автоматизации Kudos в Strava через встроенный WebView.

- **Версия:** 1.9.8
- **Пакет:** `com.strava.kudos`
- **Автор:** lvs-vladimir
- **Лицензия:** MIT

> Приложение работает поверх веб-интерфейса Strava: Kotlin управляет состоянием, стратегиями и настройками, JavaScript используется только как тонкий DOM-адаптер.

---

## Возможности

- 5 стратегий автоматизации Kudos.
- Полностью Kotlin-based lifecycle/state/strategy engine.
- Thin JavaScript DOM adapter вместо JS-бота.
- Поддержка grouped activities: каждый участник групповой активности определяется и лайкается отдельно.
- Таймер паузы для умной стратегии после полного цикла.
- Настраиваемые задержки Smart/Top/Aggressive/Human стратегий.
- Отдельные скорости Club strategy.
- Foreground Service для работы в фоне.
- Touch overlay во время работы бота.
- Live системные логи с копированием и сбросом.
- Сброс счётчика, истории лайков и истории клубов.
- Автозапуск после запуска Android.

---

## Стратегии

| Стратегия | Описание |
| --- | --- |
| **Умная** | Сканирует ленту, лайкает подходящие активности, пропускает свои и уже обработанные, скроллит вниз до конца цикла или лимита уже лайкнутых. |
| **Только новые** | Работает в верхней зоне ленты, без глубокого скролла. |
| **Агрессивная** | Быстрая стратегия с минимальными задержками и крупными шагами прокрутки. |
| **Человечная** | Большие случайные паузы и медленная прокрутка для более естественного поведения. |
| **Клубы** | Обходит вашу ленту и ленты клубов, автоматически переключается между клубами. |

### Таймер умной стратегии

В меню **Стратегия** можно включить таймер умной стратегии:

- `Пауза после одного цикла` — вкл/выкл.
- `Пауза, минут` — длительность паузы от `1` до `1440` минут.

Цикл умной стратегии завершается, когда:

- достигнут конец ленты;
- достигнут лимит подряд уже лайкнутых активностей.

После паузы приложение принудительно обновляет страницу, ждёт полной загрузки WebView, возвращает фокус наверх страницы и только затем запускает новый цикл.

На главном экране отображается countdown:

```text
ПАУЗА
Следующий запуск умной стратегии через MM:SS
```

---

## Настройки

### Экран «Стратегия»

- выбор стратегии;
- минимальная задержка, мс;
- максимальная задержка, мс;
- таймер умной стратегии;
- текущая сводка настроек.

Задержка применяется между шагами стратегии. Для умной стратегии DOM scan оптимизирован: сканируются только карточки около видимой зоны, поэтому малые значения вроде `200–500` мс реально используются.

### Экран «Настройки»

- скорость лайков в клубах:
  - медленно: `2–5 сек`;
  - средне: `1–2.5 сек`;
  - быстро: `0.5–1.2 сек`;
  - очень быстро: `0.3–0.5 сек`;
- лимит подряд уже лайкнутых;
- автозапуск;
- сброс счётчика лайков, истории лайков и клубной истории.

### Системные логи

Экран **Системные логи** обновляется в реальном времени через `SharedPreferences.OnSharedPreferenceChangeListener`.

Кнопки находятся внизу экрана:

- `СКОПИРОВАТЬ` — копирует логи и открывает системный share dialog;
- `СБРОС` — очищает логи.

---

## Архитектура

```text
app/src/main/kotlin/com/strava/kudos/
├── MainActivity.kt              # главный экран, WebView, UI lifecycle
├── BotController.kt             # start/stop/restart, BotState, foreground service
├── StrategyEngine.kt            # выбор Kotlin-стратегии
├── BotStrategy.kt               # интерфейс стратегии и BotContext
├── BaseKotlinStrategy.kt        # общий scheduler/click/findCandidate logic
├── SmartStrategy.kt             # умная стратегия + cycle timer
├── TopOnlyStrategy.kt           # стратегия только новых активностей
├── AggressiveStrategy.kt        # быстрая стратегия
├── HumanStrategy.kt             # человечная стратегия
├── ClubsStrategy.kt             # клубная ротация
├── WebViewController.kt         # WebView settings/evaluate/reload helpers
├── DomAdapter.kt                # Kotlin wrapper для DOM adapter JSON API
├── SettingsRepository.kt        # настройки SharedPreferences
├── LogRepository.kt             # системные логи
├── LikedActivityRepository.kt   # история обработанных активностей
└── ClubRotationRepository.kt    # история клубной ротации

app/src/main/assets/
├── bot.js                       # thin entrypoint
├── dom_adapter.js               # thin DOM API, version 5
└── old_bot_backup.js            # legacy fallback
```

### Production flow

```text
MainActivity
  -> BotController
    -> StrategyEngine
      -> Kotlin strategy
        -> DomAdapter.kt
          -> dom_adapter.js
            -> Strava DOM
```

### JavaScript слой

`dom_adapter.js` не содержит стратегической логики. Он только выполняет DOM-команды:

- `scanVisibleCards()`;
- `scanAllCards()`;
- `clickKudos(activityId)`;
- `scrollBy(px)`;
- `scrollToTop()`;
- `reloadPage()`;
- `getPageInfo()`;
- `getClubLinks()`;
- `goToUrl(url)`;
- `openClubActivityTab()`.

Legacy JS сохранён только как fallback.

---

## WebView

WebView настроен на работу со Strava:

- JavaScript enabled;
- DOM storage enabled;
- cookies и third-party cookies enabled;
- cache mode `LOAD_NO_CACHE`;
- mobile Chrome-like User-Agent;
- аппаратный layer type.

---

## Сборка

### Требования

- Android Studio или установленный Gradle wrapper;
- Android SDK `compileSdk 34`;
- JDK с поддержкой Java 8 target;
- устройство/эмулятор Android `minSdk 24`;
- ADB для установки на устройство.

### Debug APK

```bash
./gradlew assembleDebug
```

APK создаётся здесь:

```text
app/build/outputs/apk/debug/strakudos-v1.9.8.apk
```

### Установка через ADB

```bash
adb install -r app/build/outputs/apk/debug/strakudos-v1.9.8.apk
```

### Проверки перед коммитом

```bash
node --check app/src/main/assets/bot.js
node --check app/src/main/assets/dom_adapter.js
node --check app/src/main/assets/old_bot_backup.js
./gradlew compileDebugKotlin
./gradlew lintDebug
```

---

## Использование

1. Установите APK.
2. Откройте приложение.
3. Войдите в Strava внутри WebView.
4. Откройте боковое меню и выберите стратегию.
5. Настройте задержки/таймеры.
6. Нажмите `СТАРТ`.
7. Для остановки нажмите серую кнопку `СТОП` на главном экране или стоп в уведомлении.

---

## GitHub push с локальным PAT

Для локальной машины можно хранить GitHub PAT в ignored-файле:

```text
.secrets/github_pat
```

`.gitignore` уже исключает:

```text
.secrets/
.github/instructions/memory.instruction.md
```

Рекомендуемый безопасный push:

```bash
python3 - <<'PY'
from pathlib import Path
src = Path('.secrets/github_pat')
p = Path('/tmp/opencode/git-askpass-strakudos.sh')
p.write_text('#!/bin/sh\ncase "$1" in\n  *Username*) printf "%s" "x-access-token" ;;\n  *Password*) cat "' + str(src.resolve()) + '" | tr -d "\\n" ;;\n  *) printf "%s" "" ;;\nesac\n')
p.chmod(0o700)
PY
GIT_ASKPASS="/tmp/opencode/git-askpass-strakudos.sh" GIT_TERMINAL_PROMPT=0 git push origin main
rm -f "/tmp/opencode/git-askpass-strakudos.sh"
```

Токен нельзя коммитить, вставлять в remote URL или сохранять в git config.

---

## Безопасность

- Пароль Strava не хранится приложением.
- Авторизация Strava остаётся внутри WebView cookies.
- Настройки, счётчики, история лайков и логи хранятся локально в SharedPreferences.
- PAT GitHub должен храниться только локально в `.secrets/github_pat` и не попадать в репозиторий.
- Используйте автоматизацию осторожно, чтобы не нарушать правила Strava.

---

## Статус текущей версии

- Kotlin strategies — production default.
- JavaScript strategy logic — legacy fallback only.
- Java source layout удалён; production source находится в `app/src/main/kotlin`.
- Grouped activities поддерживаются.
- Smart timer, fast visible DOM scan и live logs включены.

---

## Лицензия

MIT License.

---

## Контакты

- GitHub: <https://github.com/lvs-vladimir/strakudos>
- Автор: lvs-vladimir
