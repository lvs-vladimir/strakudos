package com.strava.kudos

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog

class ApiTestRunner(
    private val context: Context,
    private val webView: WebView,
    private val logRepository: LogRepository,
    private val mainHandler: Handler = Handler(Looper.getMainLooper())
) {
    fun run(activityId: String) {
Toast.makeText(context, "Запускаю API тест...", Toast.LENGTH_SHORT).show()
logRepository.add("Запуск API теста для активности $activityId", system = true)
Log.d(TAG, "runApiTest: activityId=$activityId")

// Собираем результаты тестов
val testResults = mutableListOf<String>()

// Простой тест 1: API v3 PUT
val jsTest1 = """
    (function() {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('PUT', 'https://www.strava.com/api/v3/activities/$activityId/kudos', true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.withCredentials = true;
            xhr.onload = function() {
                ApiTestAndroidApp.log('Тест 1 (API v3 PUT): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                ApiTestAndroidApp.onApiTestResult('Тест 1 (API v3 PUT): HTTP ' + xhr.status);
            };
            xhr.onerror = function() {
                ApiTestAndroidApp.log('Тест 1 (API v3 PUT): ОШИБКА сети');
                ApiTestAndroidApp.onApiTestResult('Тест 1 (API v3 PUT): ОШИБКА сети');
            };
            xhr.send();
            return 'Тест 1 отправлен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 1: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 1: Исключение - ' + e.message);
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 2: API v3 PUT + Api-Key
val jsTest2 = """
    (function() {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('PUT', 'https://www.strava.com/api/v3/activities/$activityId/kudos', true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('Api-Key', '0aeb41212aef4bddb762dd34c45e941f');
            xhr.withCredentials = true;
            xhr.onload = function() {
                ApiTestAndroidApp.log('Тест 2 (API v3 + Api-Key): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                ApiTestAndroidApp.onApiTestResult('Тест 2 (API v3 + Api-Key): HTTP ' + xhr.status);
            };
            xhr.onerror = function() {
                ApiTestAndroidApp.log('Тест 2 (API v3 + Api-Key): ОШИБКА сети');
                ApiTestAndroidApp.onApiTestResult('Тест 2 (API v3 + Api-Key): ОШИБКА сети');
            };
            xhr.send();
            return 'Тест 2 отправлен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 2: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 2: Исключение - ' + e.message);
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 3: Web POST endpoint
val jsTest3 = """
    (function() {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.strava.com/activities/$activityId/kudos', true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.withCredentials = true;
            xhr.onload = function() {
                ApiTestAndroidApp.log('Тест 3 (Web POST): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                ApiTestAndroidApp.onApiTestResult('Тест 3 (Web POST): HTTP ' + xhr.status);
            };
            xhr.onerror = function() {
                ApiTestAndroidApp.log('Тест 3 (Web POST): ОШИБКА сети');
                ApiTestAndroidApp.onApiTestResult('Тест 3 (Web POST): ОШИБКА сети');
            };
            xhr.send();
            return 'Тест 3 отправлен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 3: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 3: Исключение - ' + e.message);
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 4: DOM click
val jsTest4 = """
    (function() {
        try {
            var btns = document.querySelectorAll('[data-testid="kudos_button"], [data-testid="un-kudos_button"]');
            if (btns.length > 0) {
                var btn = btns[0];
                var rect = btn.getBoundingClientRect();
                var x = rect.left + rect.width/2;
                var y = rect.top + rect.height/2;
                ['pointerdown','mousedown','pointerup','mouseup','click'].forEach(function(t) {
                    var ev = new MouseEvent(t, {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y});
                    btn.dispatchEvent(ev);
                });
                ApiTestAndroidApp.log('Тест 4 (DOM Click): Клик выполнен на кнопке лайка');
                ApiTestAndroidApp.onApiTestResult('Тест 4 (DOM Click): Клик выполнен');
            } else {
                ApiTestAndroidApp.log('Тест 4 (DOM Click): Кнопки лайка не найдены');
                ApiTestAndroidApp.onApiTestResult('Тест 4 (DOM Click): Кнопки не найдены');
            }
            return 'Тест 4 выполнен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 4: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 4: Исключение - ' + e.message);
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 5: GraphQL mutation toggleKudo
val jsTest5 = """
    (function() {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.strava.com/graphql', true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.withCredentials = true;
            xhr.onload = function() {
                ApiTestAndroidApp.log('Тест 5 (GraphQL toggleKudo): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 150));
                ApiTestAndroidApp.onApiTestResult('Тест 5 (GraphQL toggleKudo): HTTP ' + xhr.status);
            };
            xhr.onerror = function() {
                ApiTestAndroidApp.log('Тест 5 (GraphQL toggleKudo): ОШИБКА сети');
                ApiTestAndroidApp.onApiTestResult('Тест 5 (GraphQL): ОШИБКА сети');
            };
            xhr.send(JSON.stringify({
                operationName: 'ToggleKudo',
                variables: {activityId: '$activityId'},
                query: 'mutation ToggleKudo($activityId: ID!) { toggleKudo(activityId: $activityId) { id hasKudoed kudosCount } }'
            }));
            return 'Тест 5 отправлен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 5: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 5: Исключение - ' + e.message);
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 6: GraphQL mutation kudosCreate
val jsTest6 = """
    (function() {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.strava.com/graphql', true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.withCredentials = true;
            xhr.onload = function() {
                ApiTestAndroidApp.log('Тест 6 (GraphQL kudosCreate): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 150));
                ApiTestAndroidApp.onApiTestResult('Тест 6 (GraphQL kudosCreate): HTTP ' + xhr.status);
            };
            xhr.onerror = function() {
                ApiTestAndroidApp.log('Тест 6 (GraphQL kudosCreate): ОШИБКА сети');
                ApiTestAndroidApp.onApiTestResult('Тест 6 (GraphQL): ОШИБКА сети');
            };
            xhr.send(JSON.stringify({
                operationName: 'KudosCreate',
                variables: {activityId: '$activityId'},
                query: 'mutation KudosCreate($activityId: ID!) { kudosCreate(input: {activityId: $activityId}) { id hasKudoed kudosCount } }'
            }));
            return 'Тест 6 отправлен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 6: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 6: Исключение - ' + e.message);
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 7: Проверка cookies и CSRF
val jsTest7 = """
    (function() {
        try {
            var cookies = document.cookie.split(';');
            var logMsg = 'Тест 7 (Cookies): Найдено ' + cookies.length + ' cookies. ';
            var csrf = null;
            var token = null;
            cookies.forEach(function(c) {
                var parts = c.trim().split('=');
                var name = parts[0];
                var val = parts[1] ? parts[1].substring(0, 30) : '';
                if (name.indexOf('csrf') !== -1 || name.indexOf('_token') !== -1) {
                    csrf = val;
                    logMsg += name + '=' + val + '; ';
                }
                if (name === 'strava_remember_token') {
                    token = val;
                    logMsg += 'token найден; ';
                }
            });

            // Ищем CSRF в meta tags
            var meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) {
                logMsg += 'CSRF meta=' + meta.content.substring(0, 20) + '; ';
            }

            // Ищем в HTML
            var html = document.documentElement.innerHTML;
            var m = html.match(/csrf[_-]token[\"\']?\s*[:=]\s*[\"\']([^\"\']+)/);
            if (m) {
                logMsg += 'CSRF в HTML=' + m[1].substring(0, 20) + '; ';
            }

            ApiTestAndroidApp.log(logMsg);
            ApiTestAndroidApp.onApiTestResult('Тест 7 (Cookies): ' + (csrf ? 'CSRF найден' : 'CSRF не найден'));
            return 'Тест 7 выполнен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 7: Исключение - ' + e.message);
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 8: GET /api/v3/activities/{id} (проверка доступности API)
val jsTest8 = """
    (function() {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', 'https://www.strava.com/api/v3/activities/$activityId', true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.withCredentials = true;
            xhr.onload = function() {
                ApiTestAndroidApp.log('Тест 8 (API v3 GET): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                ApiTestAndroidApp.onApiTestResult('Тест 8 (API v3 GET): HTTP ' + xhr.status);
            };
            xhr.onerror = function() {
                ApiTestAndroidApp.log('Тест 8 (API v3 GET): ОШИБКА сети');
                ApiTestAndroidApp.onApiTestResult('Тест 8 (API v3 GET): ОШИБКА сети');
            };
            xhr.send();
            return 'Тест 8 отправлен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 8: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 8: Исключение - ' + e.message);
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 9: POST /activity/{id}/kudo (без 's')
val jsTest9 = """
    (function() {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.strava.com/activity/$activityId/kudo', true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.withCredentials = true;
            xhr.onload = function() {
                ApiTestAndroidApp.log('Тест 9 (/activity/kudo): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                ApiTestAndroidApp.onApiTestResult('Тест 9 (/activity/kudo): HTTP ' + xhr.status);
            };
            xhr.onerror = function() {
                ApiTestAndroidApp.log('Тест 9 (/activity/kudo): ОШИБКА сети');
                ApiTestAndroidApp.onApiTestResult('Тест 9 (/activity/kudo): ОШИБКА сети');
            };
            xhr.send();
            return 'Тест 9 отправлен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 9: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 9: Исключение - ' + e.message);
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 10: POST с CSRF token из meta tag
val jsTest10 = """
    (function() {
        try {
            var csrf = null;
            var meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) csrf = meta.content;

            if (!csrf) {
                ApiTestAndroidApp.log('Тест 10 (CSRF POST): CSRF token не найден');
                ApiTestAndroidApp.onApiTestResult('Тест 10: CSRF не найден');
                return 'CSRF не найден';
            }

            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.strava.com/activities/$activityId/kudos', true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('X-CSRF-Token', csrf);
            xhr.withCredentials = true;
            xhr.onload = function() {
                ApiTestAndroidApp.log('Тест 10 (CSRF POST activities/kudos): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                ApiTestAndroidApp.onApiTestResult('Тест 10 (CSRF POST): HTTP ' + xhr.status);
            };
            xhr.onerror = function() {
                ApiTestAndroidApp.log('Тест 10 (CSRF POST): ОШИБКА сети');
                ApiTestAndroidApp.onApiTestResult('Тест 10: ОШИБКА сети');
            };
            xhr.send();
            return 'Тест 10 отправлен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 10: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 10: Исключение');
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 11: POST с CSRF token и X-Requested-With
val jsTest11 = """
    (function() {
        try {
            var csrf = null;
            var meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) csrf = meta.content;

            if (!csrf) {
                ApiTestAndroidApp.log('Тест 11 (CSRF+XRW): CSRF token не найден');
                ApiTestAndroidApp.onApiTestResult('Тест 11: CSRF не найден');
                return 'CSRF не найден';
            }

            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.strava.com/activities/$activityId/kudos', true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('X-CSRF-Token', csrf);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.withCredentials = true;
            xhr.onload = function() {
                ApiTestAndroidApp.log('Тест 11 (CSRF+XRW POST): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                ApiTestAndroidApp.onApiTestResult('Тест 11 (CSRF+XRW): HTTP ' + xhr.status);
            };
            xhr.onerror = function() {
                ApiTestAndroidApp.log('Тест 11 (CSRF+XRW): ОШИБКА сети');
                ApiTestAndroidApp.onApiTestResult('Тест 11: ОШИБКА сети');
            };
            xhr.send();
            return 'Тест 11 отправлен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 11: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 11: Исключение');
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// Тест 12: POST /kudos с CSRF
val jsTest12 = """
    (function() {
        try {
            var csrf = null;
            var meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) csrf = meta.content;

            if (!csrf) {
                ApiTestAndroidApp.log('Тест 12 (/kudos POST): CSRF token не найден');
                ApiTestAndroidApp.onApiTestResult('Тест 12: CSRF не найден');
                return 'CSRF не найден';
            }

            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.strava.com/kudos', true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('X-CSRF-Token', csrf);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.withCredentials = true;
            xhr.onload = function() {
                ApiTestAndroidApp.log('Тест 12 (/kudos POST): HTTP ' + xhr.status + ' - ' + xhr.responseText.substring(0, 100));
                ApiTestAndroidApp.onApiTestResult('Тест 12 (/kudos): HTTP ' + xhr.status);
            };
            xhr.onerror = function() {
                ApiTestAndroidApp.log('Тест 12 (/kudos POST): ОШИБКА сети');
                ApiTestAndroidApp.onApiTestResult('Тест 12: ОШИБКА сети');
            };
            xhr.send('activity_id=$activityId');
            return 'Тест 12 отправлен';
        } catch(e) {
            ApiTestAndroidApp.log('Тест 12: Исключение - ' + e.message);
            ApiTestAndroidApp.onApiTestResult('Тест 12: Исключение');
            return 'Ошибка: ' + e.message;
        }
    })();
"""

// ТЕСТ 13: Перехват реальных AJAX запросов через DOM click!
val jsTest13 = """
    (function() {
        ApiTestAndroidApp.log('=== ТЕСТ 13: Перехват network requests ===');

        // Сохраняем оригинальные функции
        var origOpen = XMLHttpRequest.prototype.open;
        var origSend = XMLHttpRequest.prototype.send;
        var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        var origFetch = window.fetch;

        var capturedRequests = [];

        // Перехватываем XHR
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            this._capturedMethod = method;
            this._capturedUrl = url;
            this._capturedHeaders = {};
            return origOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
            if (this._capturedHeaders) {
                this._capturedHeaders[header] = value;
            }
            return origSetHeader.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function(body) {
            var self = this;
            var logMsg = 'CAPTURED XHR: ' + this._capturedMethod + ' ' + this._capturedUrl;
            if (body) logMsg += ' | body=' + body.toString().substring(0, 100);
            logMsg += ' | headers=' + JSON.stringify(this._capturedHeaders).substring(0, 200);
            ApiTestAndroidApp.log(logMsg);
            capturedRequests.push({type:'xhr', method:this._capturedMethod, url:this._capturedUrl});

            // Перехватываем onload
            var origOnload = this.onload;
            this.onload = function() {
                ApiTestAndroidApp.log('CAPTURED XHR RESPONSE: HTTP ' + self.status + ' | ' + self.responseText.substring(0, 200));
                if (origOnload) origOnload.apply(self, arguments);
            };

            return origSend.apply(this, arguments);
        };

        // Перехватываем fetch
        window.fetch = function(url, options) {
            var method = (options && options.method) || 'GET';
            var logMsg = 'CAPTURED FETCH: ' + method + ' ' + url;
            if (options && options.body) logMsg += ' | body=' + options.body.toString().substring(0, 100);
            ApiTestAndroidApp.log(logMsg);
            capturedRequests.push({type:'fetch', method:method, url:url.toString()});
            return origFetch.apply(this, arguments);
        };

        ApiTestAndroidApp.log('Network interceptor установлен. Ищу кнопку лайка...');

        // Теперь кликаем на кнопку лайка
        var btns = document.querySelectorAll('[data-testid="kudos_button"], [data-testid="un-kudos_button"]');
        if (btns.length > 0) {
            var btn = btns[0];
            ApiTestAndroidApp.log('Найдено ' + btns.length + ' кнопок. Кликаю на первую...');
            var rect = btn.getBoundingClientRect();
            var x = rect.left + rect.width/2;
            var y = rect.top + rect.height/2;

            // Клик с задержками чтобы перехватить все запросы
            setTimeout(function() {
                btn.dispatchEvent(new MouseEvent('pointerdown', {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y}));
            }, 100);
            setTimeout(function() {
                btn.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y}));
            }, 150);
            setTimeout(function() {
                btn.dispatchEvent(new MouseEvent('pointerup', {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y}));
            }, 200);
            setTimeout(function() {
                btn.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y}));
            }, 250);
            setTimeout(function() {
                btn.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window, clientX:x, clientY:y}));
            }, 300);

            // Ждем 2 секунды и смотрим результаты
            setTimeout(function() {
                ApiTestAndroidApp.log('=== Захвачено ' + capturedRequests.length + ' запросов ===');
                capturedRequests.forEach(function(req, i) {
                    ApiTestAndroidApp.log('  [' + i + '] ' + req.type + ': ' + req.method + ' ' + req.url);
                });

                // Восстанавливаем оригинальные функции
                XMLHttpRequest.prototype.open = origOpen;
                XMLHttpRequest.prototype.send = origSend;
                XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
                window.fetch = origFetch;

                if (capturedRequests.length === 0) {
                    ApiTestAndroidApp.log('Тест 13: НИ ОДИН запрос не захвачен! Возможно Strava использует другой механизм (React synthetic events, custom fetch, Service Worker, WebSocket)');
                    ApiTestAndroidApp.onApiTestResult('Тест 13: 0 запросов захвачено');
                } else {
                    ApiTestAndroidApp.onApiTestResult('Тест 13: Захвачено ' + capturedRequests.length + ' запросов');
                }
            }, 2000);

            return 'Тест 13: Перехватчик установлен, клик выполнен';
        } else {
            ApiTestAndroidApp.log('Тест 13: Кнопки лайка не найдены на странице');
            ApiTestAndroidApp.onApiTestResult('Тест 13: Кнопки не найдены');

            // Восстанавливаем оригинальные функции
            XMLHttpRequest.prototype.open = origOpen;
            XMLHttpRequest.prototype.send = origSend;
            XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
            window.fetch = origFetch;

            return 'Тест 13: Кнопки не найдены';
        }
    })();
"""

// Запускаем все тесты
webView.evaluateJavascript(jsTest1) { result -> Log.d(TAG, "API Test 1: $result") }

android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
    webView.evaluateJavascript(jsTest2) { result -> Log.d(TAG, "API Test 2: $result") }
}, 2000)

android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
    webView.evaluateJavascript(jsTest3) { result -> Log.d(TAG, "API Test 3: $result") }
}, 4000)

android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
    webView.evaluateJavascript(jsTest4) { result -> Log.d(TAG, "API Test 4: $result") }
}, 6000)

android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
    webView.evaluateJavascript(jsTest5) { result -> Log.d(TAG, "API Test 5: $result") }
}, 8000)

android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
    webView.evaluateJavascript(jsTest6) { result -> Log.d(TAG, "API Test 6: $result") }
}, 10000)

android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
    webView.evaluateJavascript(jsTest7) { result -> Log.d(TAG, "API Test 7: $result") }
}, 12000)

android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
    webView.evaluateJavascript(jsTest8) { result -> Log.d(TAG, "API Test 8: $result") }
}, 14000)

android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
    webView.evaluateJavascript(jsTest13) { result -> Log.d(TAG, "API Test 13: $result") }
}, 16000)

// Показываем результаты через 20 секунд
android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
    mainHandler.post {
        val logs = logRepository.getAll("")
        val apiResults = logs?.lines()?.filter { it.contains("Тест") || it.contains("CAPTURED") || it.contains("захвачено") }?.takeLast(20)?.joinToString("\n") ?: "Нет результатов"

        AlertDialog.Builder(context)
            .setTitle("Результаты API теста")
            .setMessage(apiResults + "\n\nПолные логи в меню → Логи → СКОПИРОВАТЬ")
            .setPositiveButton("OK") { dialog, _ -> dialog.dismiss() }
            .setNeutralButton("Открыть Логи") { _, _ ->
                context.startActivity(Intent(context, LogsActivity::class.java))
            }
            .show()
    }
}, 20000)

    }

    companion object {
        private const val TAG = "ApiTestRunner"
    }
}
