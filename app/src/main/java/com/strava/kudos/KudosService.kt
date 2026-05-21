package com.strava.kudos

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

class KudosService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var updateRunnable: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        Log.d("KudosService", "onCreate called")
        createNotificationChannel()
        acquireWakeLock()
        startPeriodicUpdate()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("KudosService", "onStartCommand called, action=${intent?.action}, intent=${intent != null}")
        
        if (intent?.action == ACTION_STOP) {
            Log.d("KudosService", "Received STOP action, stopping service")
            sendBroadcast(Intent("com.strava.kudos.SERVICE_STOPPED"))
            stopSelf()
            return START_NOT_STICKY
        }
        
        // Для Android 14+ foreground service можно запустить только из foreground
        // Если intent == null, значит система пересоздала сервис — мы в фоне, не можем startForeground
        if (intent == null) {
            Log.w("KudosService", "Service recreated by system in background, cannot startForeground on Android 14+")
            stopSelf()
            return START_NOT_STICKY
        }
        
        // Запускаем foreground notification
        try {
            startForeground(NOTIFICATION_ID, buildNotification(getKudosCount()))
            Log.d("KudosService", "startForeground succeeded")
        } catch (e: Exception) {
            Log.e("KudosService", "startForeground failed: ${e.message}")
            stopSelf()
            return START_NOT_STICKY
        }
        
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.d("KudosService", "onDestroy called")
        super.onDestroy()
        releaseWakeLock()
        stopPeriodicUpdate()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Strakudos Automation",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Уведомление о работе бота автолайков"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
            Log.d("KudosService", "Notification channel created")
        }
    }

    private fun startPeriodicUpdate() {
        updateRunnable = object : Runnable {
            override fun run() {
                val count = getKudosCount()
                Log.d("KudosService", "Periodic update: count=$count")
                updateNotification(count)
                // Пингуем WebView чтобы Chrome не троттлил таймеры в фоне
                sendBroadcast(Intent("com.strava.kudos.PING_WEBVIEW"))
                handler.postDelayed(this, 1500) // Пинг каждые 1.5 секунды
            }
        }
        handler.post(updateRunnable!!)
        Log.d("KudosService", "Periodic update started with WebView ping")
    }

    private fun stopPeriodicUpdate() {
        updateRunnable?.let { handler.removeCallbacks(it) }
        updateRunnable = null
        Log.d("KudosService", "Periodic update stopped")
    }

    private fun getKudosCount(): Int {
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        return sharedPref.getInt("kudos_count", 0)
    }

    private fun updateNotification(count: Int) {
        try {
            val notification = buildNotification(count)
            // Для foreground service обязательно использовать startForeground() для обновления
            startForeground(NOTIFICATION_ID, notification)
            Log.d("KudosService", "Notification updated with count=$count via startForeground")
        } catch (e: Exception) {
            Log.e("KudosService", "Error updating notification: ${e.message}")
        }
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Strakudos::KudosWakeLock"
        ).apply {
            acquire(10 * 60 * 60 * 1000L) // 10 hours max
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        wakeLock = null
    }

    private fun buildNotification(count: Int = 0): android.app.Notification {
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val stopIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, KudosService::class.java).apply {
                action = ACTION_STOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Strakudos — Бот активен")
            .setContentText("Поставлено лайков: $count")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)

        // Добавляем действия
        builder.addAction(0, "Открыть", openIntent)
        builder.addAction(0, "Стоп", stopIntent)

        return builder.build()
    }

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "strakudos_kudos_channel_v2"
        const val ACTION_STOP = "STOP_BOT"
    }
}
