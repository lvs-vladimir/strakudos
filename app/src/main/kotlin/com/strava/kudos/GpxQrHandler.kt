package com.strava.kudos

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.*
import org.json.JSONObject

class GpxQrHandler(
    private val context: Context,
    private val settingsRepository: SettingsRepository,
    private val logRepository: LogRepository
) {
    private val executor = Executors.newSingleThreadExecutor()
    private val activityNames = mutableMapOf<String, String>()
    private val pendingIds = mutableSetOf<String>()

    fun enqueue(activityId: String, activityTitle: String = "") {
        if (settingsRepository.isGpxQrGenerated(activityId)) {
            Log.d(TAG, "enqueue: already generated $activityId")
            return
        }
        if (activityId.length >= 20) {
            Log.d(TAG, "enqueue: id too long $activityId")
            return
        }
        if (!pendingIds.add(activityId)) {
            Log.d(TAG, "enqueue: already pending $activityId")
            return
        }

        if (activityTitle.isNotBlank()) {
            activityNames[activityId] = activityTitle
        }

        logRepository.add("GPX QR: обработка $activityId", system = true)
        executor.execute { processActivity(activityId) }
    }

    private fun processActivity(activityId: String) {
        try {
            val cookie = getStravaCookie()
            if (cookie == null) {
                logRepository.add("GPX QR: нет cookie Strava", system = true)
                return
            }

            val gpxData = downloadGpx(activityId, cookie)
            if (gpxData == null) {
                logRepository.add("GPX QR: ошибка скачивания GPX", system = true)
                return
            }

            val minDistanceKm = settingsRepository.getGpxQrMinDistanceKm()
            if (minDistanceKm > 0) {
                val gpxDistanceKm = calculateGpxDistanceKm(gpxData)
                if (gpxDistanceKm < minDistanceKm) {
                    logRepository.add("GPX QR: дистанция ${"%.1f".format(gpxDistanceKm)}км < ${minDistanceKm}км, пропускаем", system = true)
                    settingsRepository.addGpxQrGeneratedId(activityId)
                    return
                }
            }

            val dateStr = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
            val title = activityNames.remove(activityId) ?: "activity_$activityId"
            val safeTitle = title.replace(Regex("[^a-zA-Zа-яА-Я0-9\\s\\-]"), " ").trim()
                .replace(Regex("\\s+"), "_").take(80)
            val filename = "${safeTitle}_${dateStr}.gpx"

            val gpxUrl = uploadGpxToServer(filename, gpxData)
            if (gpxUrl == null) {
                logRepository.add("GPX QR: ошибка загрузки GPX на сервер", system = true)
                return
            }

            val qrFile = generateQrImage(activityId, gpxUrl)

            val csrfToken = fetchCsrfToken()
            val uploadOk = uploadQrToStrava(activityId, qrFile, cookie, csrfToken)
            if (uploadOk) {
                settingsRepository.addGpxQrGeneratedId(activityId)
                logRepository.add("GPX QR: успешно для $activityId ($gpxUrl)", system = true)
            } else {
                logRepository.add("GPX QR: ошибка загрузки QR-фото в тренировку $activityId", system = true)
            }
        } catch (e: Exception) {
            logRepository.add("GPX QR: ошибка: ${e.message}", system = true)
            Log.e(TAG, "processActivity error", e)
        } finally {
            pendingIds.remove(activityId)
        }
    }

    private fun getStravaCookie(): String? {
        return CookieManager.getInstance().getCookie("https://www.strava.com")
    }

    private fun downloadGpx(activityId: String, cookie: String): ByteArray? {
        return try {
            val url = URL("https://www.strava.com/activities/$activityId/export_gpx")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Cookie", cookie)
            conn.setRequestProperty("User-Agent", USER_AGENT)
            conn.connectTimeout = 30000
            conn.readTimeout = 30000
            val responseCode = conn.responseCode
            if (responseCode != 200) {
                logRepository.add("GPX QR: HTTP $responseCode при скачивании GPX", system = true)
                return null
            }
            conn.inputStream.readBytes()
        } catch (e: Exception) {
            logRepository.add("GPX QR: downloadGpx error: ${e.message}", system = true)
            null
        }
    }

    private fun uploadGpxToServer(filename: String, data: ByteArray): String? {
        return try {
            val password = settingsRepository.getGpxUploadPassword()
            val url = URL("https://proxu.pro/upload/$filename")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "PUT"
            conn.setRequestProperty("Authorization", basicAuth("uploader", password))
            conn.doOutput = true
            conn.connectTimeout = 30000
            conn.readTimeout = 30000
            conn.outputStream.write(data)
            conn.outputStream.flush()
            conn.outputStream.close()
            val responseCode = conn.responseCode
            if (responseCode in 200..299) {
                "https://proxu.pro/files/$filename"
            } else {
                logRepository.add("GPX QR: HTTP $responseCode при загрузке GPX на сервер", system = true)
                null
            }
        } catch (e: Exception) {
            logRepository.add("GPX QR: uploadGpx error: ${e.message}", system = true)
            null
        }
    }

    private fun generateQrImage(activityId: String, gpxUrl: String): File {
        val size = 1024
        val writer = QRCodeWriter()
        val bitMatrix = writer.encode(gpxUrl, BarcodeFormat.QR_CODE, size, size)

        val qrBitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        for (x in 0 until size) {
            for (y in 0 until size) {
                qrBitmap.setPixel(x, y, if (bitMatrix[x, y]) Color.BLACK else Color.WHITE)
            }
        }

        val textH = 70
        val margin = 40
        val gap = 12
        val totalW = size + margin * 2
        val totalH = margin + textH + gap + size + margin
        val textBitmap = Bitmap.createBitmap(totalW, totalH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(textBitmap)
        canvas.drawColor(Color.WHITE)

        // QR code below text
        canvas.drawBitmap(qrBitmap, margin.toFloat(), (margin + textH + gap).toFloat(), null)

        // text above QR
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = Color.BLACK
            textSize = 48f
            textAlign = Paint.Align.CENTER
            isFakeBoldText = true
        }
        canvas.drawText("GPX файл маршрута", (totalW / 2).toFloat(), (margin + textH - 12).toFloat(), paint)

        val stream = ByteArrayOutputStream()
        textBitmap.compress(Bitmap.CompressFormat.JPEG, 92, stream)
        textBitmap.recycle()
        qrBitmap.recycle()

        val qrFile = File(context.cacheDir, "gpx_qr_${activityId}.jpg")
        FileOutputStream(qrFile).use { it.write(stream.toByteArray()) }
        return qrFile
    }

    private fun calculateGpxDistanceKm(gpxData: ByteArray): Double {
        return try {
            val content = gpxData.toString(Charsets.UTF_8)
            val regex = Regex("""<trkpt\s+lat="([\d.]+)"\s+lon="([\d.]+)"[^>]*>""")
            val matches = regex.findAll(content).toList()
            if (matches.size < 2) {
                Log.d(TAG, "GPX distance: too few track points (${matches.size})")
                return 0.0
            }
            val R = 6371.0
            var total = 0.0
            for (i in 1 until matches.size) {
                val lat1 = matches[i - 1].groupValues[1].toDoubleOrNull() ?: continue
                val lon1 = matches[i - 1].groupValues[2].toDoubleOrNull() ?: continue
                val lat2 = matches[i].groupValues[1].toDoubleOrNull() ?: continue
                val lon2 = matches[i].groupValues[2].toDoubleOrNull() ?: continue
                val dLat = Math.toRadians(lat2 - lat1)
                val dLon = Math.toRadians(lon2 - lon1)
                val a = sin(dLat / 2) * sin(dLat / 2) +
                        cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                        sin(dLon / 2) * sin(dLon / 2)
                val c = 2 * atan2(sqrt(a), sqrt(1 - a))
                total += R * c
            }
            Log.d(TAG, "GPX distance: ${"%.2f".format(total)}km from ${matches.size} points")
            total
        } catch (e: Exception) {
            Log.e(TAG, "calculateGpxDistance error: ${e.message}")
            0.0
        }
    }

    private fun fetchCsrfToken(): String {
        return try {
            val cookie = getStravaCookie() ?: return ""
            val url = URL("https://www.strava.com/dashboard")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Cookie", cookie)
            conn.setRequestProperty("User-Agent", USER_AGENT)
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            val html = conn.inputStream.reader().readText()
            val match = Regex("""<meta\s+name="csrf-token"\s+content="([^"]+)"""")
                .find(html)
            match?.groupValues?.getOrNull(1) ?: ""
        } catch (e: Exception) {
            Log.e(TAG, "fetchCsrfToken error: ${e.message}")
            ""
        }
    }

    private fun uploadQrToStrava(activityId: String, qrFile: File, cookie: String, csrfToken: String): Boolean {
        return try {
            val athleteId = settingsRepository.getAthleteId() ?: parseAthleteId(cookie)
            if (athleteId == null) {
                logRepository.add("GPX QR: athlete_id не найден", system = true)
                return false
            }

            val uuid = UUID.randomUUID().toString()
            val takenAt = System.currentTimeMillis()
            val metadata = JSONObject().apply {
                put("athlete_id", athleteId)
                put("uuid", uuid)
                put("taken_at", takenAt)
                put("media_type", 1)
                put("location", JSONObject.NULL)
            }

            val metaUrl = URL("https://www.strava.com/photos/metadata")
            val metaConn = metaUrl.openConnection() as HttpURLConnection
            metaConn.requestMethod = "PUT"
            metaConn.setRequestProperty("Cookie", cookie)
            metaConn.setRequestProperty("User-Agent", USER_AGENT)
            metaConn.setRequestProperty("Content-Type", "application/json;charset=UTF-8")
            metaConn.setRequestProperty("X-CSRF-Token", csrfToken)
            metaConn.setRequestProperty("X-Requested-With", "XMLHttpRequest")
            metaConn.setRequestProperty("Referer", "https://www.strava.com/activities/$activityId/edit")
            metaConn.setRequestProperty("Origin", "https://www.strava.com")
            metaConn.doOutput = true
            metaConn.connectTimeout = 30000
            metaConn.readTimeout = 30000

            val metaBody = metadata.toString()
            metaConn.outputStream.write(metaBody.toByteArray(Charsets.UTF_8))
            metaConn.outputStream.flush()
            metaConn.outputStream.close()

            val metaResponseCode = metaConn.responseCode
            if (metaResponseCode != 200) {
                val errBody = try { metaConn.errorStream?.reader()?.readText() ?: "" } catch (e: Exception) { "" }
                logRepository.add("GPX QR: metadata PUT $metaResponseCode: $errBody", system = true)
                return false
            }

            val metaResponseText = metaConn.inputStream.reader().readText()
            val metaJson = JSONObject(metaResponseText)
            val keysStr = buildString { metaJson.keys().forEach { append("$it,") } }
            Log.d(TAG, "metadata response keys: $keysStr")
            for (k in metaJson.keys()) {
                val v = metaJson.get(k)
                if (v is String && v.length > 200) {
                    Log.d(TAG, "metadata.$k = (String, len=${v.length})")
                } else {
                    Log.d(TAG, "metadata.$k = $v")
                }
            }

            val s3Url = metaJson.optString("uri", "")
            val s3Method = metaJson.optString("method", "PUT")
            val s3Headers = metaJson.optJSONObject("header")
            if (s3Url.isEmpty()) {
                logRepository.add("GPX QR: S3 URL пустой", system = true)
                return false
            }

            val s3Conn = URL(s3Url).openConnection() as HttpURLConnection
            s3Conn.requestMethod = s3Method
            if (s3Headers != null) {
                for (key in s3Headers.keys()) {
                    s3Conn.setRequestProperty(key, s3Headers.getString(key))
                }
            }
            s3Conn.setRequestProperty("Origin", "https://www.strava.com")
            s3Conn.setRequestProperty("Referer", "https://www.strava.com/")
            s3Conn.setRequestProperty("X-CSRF-Token", csrfToken)
            s3Conn.setRequestProperty("X-Requested-With", "XMLHttpRequest")
            s3Conn.doOutput = true
            s3Conn.connectTimeout = 30000
            s3Conn.readTimeout = 30000

            val qrBytes = qrFile.readBytes()
            s3Conn.outputStream.write(qrBytes)
            s3Conn.outputStream.flush()
            s3Conn.outputStream.close()

            val s3ResponseCode = s3Conn.responseCode
            if (s3ResponseCode in 200..299) {
                logRepository.add("GPX QR: фото загружено в S3, статус $s3ResponseCode (размер ${qrBytes.size} байт)", system = true)
                // save activity to commit photo (эмуляция кнопки "Сохранить")
                var saveOk = false
                try {
                    val editHtml = fetchEditPage(activityId, cookie)
                    if (editHtml == null) {
                        logRepository.add("GPX QR: не удалось получить edit-страницу", system = true)
                        return false
                    }
                    val formFields = extractFormFields(editHtml)
                    val authenticityToken = formFields.remove("authenticity_token") ?: csrfToken

                    val formBody = buildString {
                        append("utf8=%E2%9C%93")
                        append("&_method=patch")
                        append("&authenticity_token=$authenticityToken")
                        for ((key, value) in formFields) {
                            if (key.startsWith("utf8") || key.startsWith("_method") || key.startsWith("authenticity_token") || key.startsWith("commit") || key.startsWith("photo")) continue
                            val encodedKey = java.net.URLEncoder.encode(key, "UTF-8")
                            val encodedValue = java.net.URLEncoder.encode(value, "UTF-8")
                            append("&$encodedKey=$encodedValue")
                        }
                        append("&photos[$uuid][rank]=0")
                        append("&photos[$uuid][media_type]=1")
                        append("&photos[$uuid][caption]=")
                        append("&default_photo_id=$uuid")
                        append("&commit=%D0%A1%D0%BE%D1%85%D1%80%D0%B0%D0%BD%D0%B8%D1%82%D1%8C")
                    }

                    val saveUrl = URL("https://www.strava.com/activities/$activityId")
                    val saveConn = saveUrl.openConnection() as HttpURLConnection
                    saveConn.requestMethod = "POST"
                    saveConn.setRequestProperty("Cookie", cookie)
                    saveConn.setRequestProperty("User-Agent", USER_AGENT)
                    saveConn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
                    saveConn.setRequestProperty("X-CSRF-Token", authenticityToken)
                    saveConn.setRequestProperty("Referer", "https://www.strava.com/activities/$activityId/edit")
                    saveConn.setRequestProperty("Origin", "https://www.strava.com")
                    saveConn.doOutput = true
                    saveConn.connectTimeout = 15000
                    saveConn.readTimeout = 15000
                    saveConn.outputStream.write(formBody.toByteArray(Charsets.UTF_8))
                    saveConn.outputStream.flush()
                    saveConn.outputStream.close()
                    val saveCode = saveConn.responseCode
                    val saveResp = if (saveCode in 200..399) {
                        try { saveConn.inputStream.bufferedReader().readText() } catch (e: Exception) { "" }
                    } else {
                        try { saveConn.errorStream?.bufferedReader()?.readText() ?: "" } catch (e: Exception) { "" }
                    }
                    logRepository.add("GPX QR: сохранение активности — $saveCode", system = true)
                    Log.d(TAG, "save activity $activityId: $saveCode — ${saveResp.take(500)}")
                    saveConn.disconnect()
                    saveOk = saveCode in 200..399
                } catch (e: Exception) {
                    Log.d(TAG, "save activity error: ${e.message}")
                }
                saveOk
            } else {
                val errBody = try { s3Conn.errorStream?.reader()?.readText() ?: "" } catch (e: Exception) { "" }
                logRepository.add("GPX QR: S3 PUT $s3ResponseCode: $errBody", system = true)
                false
            }
        } catch (e: Exception) {
            logRepository.add("GPX QR: uploadQr error: ${e.message}", system = true)
            Log.e(TAG, "uploadQrToStrava error", e)
            false
        }
    }

    private fun fetchEditPage(activityId: String, cookie: String): String? {
        return try {
            val url = URL("https://www.strava.com/activities/$activityId/edit")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Cookie", cookie)
            conn.setRequestProperty("User-Agent", USER_AGENT)
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            val html = conn.inputStream.bufferedReader().readText()
            conn.disconnect()
            html
        } catch (e: Exception) {
            Log.e(TAG, "fetchEditPage error: ${e.message}")
            null
        }
    }

    private fun extractFormFields(html: String): MutableMap<String, String> {
        val fields = mutableMapOf<String, String>()
        // <input name="..." value="...">
        var searchFrom = 0
        while (true) {
            val inputStart = html.indexOf("<input", searchFrom)
            if (inputStart == -1) break
            val inputEnd = html.indexOf('>', inputStart)
            if (inputEnd == -1) break
            val tag = html.substring(inputStart, inputEnd + 1)
            searchFrom = inputEnd + 1

            val nameMatch = Regex("""name="([^"]*)""").find(tag)
            if (nameMatch == null) continue
            val name = nameMatch.groupValues[1]
            if (name.startsWith("photo")) continue

            // skip submit/reset/button/image/file
            val typeMatch = Regex("""type="([^"]*)""").find(tag)
            val type = typeMatch?.groupValues?.getOrNull(1) ?: "text"
            if (type in listOf("submit", "reset", "button", "image", "file")) continue

            // check if it's a checkbox/radio without checked
            if (type in listOf("checkbox", "radio")) {
                if (tag.contains("checked")) {
                    val value = Regex("""value="([^"]*)""").find(tag)?.groupValues?.getOrNull(1) ?: "1"
                    fields[name] = value
                }
                continue
            }

            val value = Regex("""value="([^"]*)""").find(tag)?.groupValues?.getOrNull(1) ?: ""
            fields[name] = value
        }
        // <textarea name="...">...</textarea>
        val textareaRegex = Regex("""<textarea[^>]*name="([^"]*)"[^>]*>([^<]*)</textarea>""")
        for (m in textareaRegex.findAll(html)) {
            val name = m.groupValues[1]
            if (name.startsWith("photo")) continue
            fields[name] = m.groupValues[2].trim()
        }
        // <select name="..."> with <option selected value="...">
        val selectRegex = Regex(
            """<select[^>]*name="([^"]*)"[^>]*>(.*?)</select>""",
            RegexOption.DOT_MATCHES_ALL
        )
        for (m in selectRegex.findAll(html)) {
            val name = m.groupValues[1]
            if (name.startsWith("photo")) continue
            val inner = m.groupValues[2]
            val selectedRegex = Regex("""<option[^>]*selected[^>]*value="([^"]*)""")
            val selectedMatch = selectedRegex.find(inner)
            if (selectedMatch != null) {
                fields[name] = selectedMatch.groupValues[1]
            } else {
                // first option as default
                val firstOption = Regex("""<option[^>]*value="([^"]*)""").find(inner)
                if (firstOption != null) {
                    fields[name] = firstOption.groupValues[1]
                }
            }
        }
        return fields
    }

    private fun parseAthleteId(cookie: String): Long? {
        val match = Regex("""strava_remember_id=(\d+)""").find(cookie)
        if (match != null) return match.groupValues[1].toLongOrNull()
        val tokenMatch = Regex("""strava_remember_token=[^;]+_(\d+)""").find(cookie)
        if (tokenMatch != null) return tokenMatch.groupValues[1].toLongOrNull()
        return try {
            val dashUrl = URL("https://www.strava.com/dashboard")
            val conn = dashUrl.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("Cookie", cookie)
            conn.setRequestProperty("User-Agent", USER_AGENT)
            conn.connectTimeout = 10000
            conn.readTimeout = 10000
            val html = conn.inputStream.bufferedReader().readText()
            val idMatch = Regex(""""athlete_id":(\d+)""").find(html)
            if (idMatch != null) return idMatch.groupValues[1].toLongOrNull()
            val userIdMatch = Regex(""""current_user_id":(\d+)""").find(html)
            userIdMatch?.groupValues?.getOrNull(1)?.toLongOrNull()
        } catch (e: Exception) {
            Log.e(TAG, "parseAthleteId error: ${e.message}")
            null
        }
    }

    private fun basicAuth(username: String, password: String): String {
        val creds = "$username:$password"
        return "Basic " + android.util.Base64.encodeToString(creds.toByteArray(), android.util.Base64.NO_WRAP)
    }

    companion object {
        private const val TAG = "GpxQrHandler"
        private const val USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    }
}
