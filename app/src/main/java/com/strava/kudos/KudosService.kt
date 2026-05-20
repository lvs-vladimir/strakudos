package com.strava.kudos

import android.app.Notification
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

class KudosService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var updateRunnable: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        acquireWakeLock()
        startPeriodicUpdate()
    }

    private fun updateNotificationNow() {
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val count = sharedPref.getInt("kudos_count", 0)
        val notification = buildNotification(count)
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Log.d("KudosService", "Received STOP action, stopping service")
            // Отправляем broadcast чтобы MainActivity обновила UI
            sendBroadcast(Intent("com.strava.kudos.SERVICE_STOPPED"))
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildNotification())
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        releaseWakeLock()
        stopPeriodicUpdate()
    }

    private fun startPeriodicUpdate() {
        updateRunnable = object : Runnable {
            override fun run() {
                updateNotification()
                handler.postDelayed(this, 5000) // Обновляем каждые 5 секунд
            }
        }
        handler.post(updateRunnable!!)
    }

    private fun stopPeriodicUpdate() {
        updateRunnable?.let { handler.removeCallbacks(it) }
        updateRunnable = null
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

    private fun updateNotification() {
        val sharedPref = getSharedPreferences("strakudos_prefs", MODE_PRIVATE)
        val count = sharedPref.getInt("kudos_count", 0)
        val notification = buildNotification(count)
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun buildNotification(count: Int = 0): Notification {
        val channelId = "strakudos_kudos_channel"
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Strakudos Automation",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Уведомление о работе бота автолайков"
                setShowBadge(false)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }

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

        val builder = Notification.Builder(this, channelId)
            .setContentTitle("Strakudos — Бот активен")
            .setContentText("Поставлено лайков: $count")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            builder.setColor(getColor(android.R.color.holo_orange_dark))
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.addAction(
                Notification.Action.Builder(
                    null,
                    "Открыть",
                    openIntent
                ).build()
            )
            builder.addAction(
                Notification.Action.Builder(
                    null,
                    "Стоп",
                    stopIntent
                ).build()
            )
        }

        return builder.build()
    }

    companion object {
        private const val NOTIFICATION_ID = 1001
        const val ACTION_STOP = "STOP_BOT"
    }
}
