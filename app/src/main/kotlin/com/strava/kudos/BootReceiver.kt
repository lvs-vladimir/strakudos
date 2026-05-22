package com.strava.kudos

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_LOCKED_BOOT_COMPLETED) return

        val settingsRepository = SettingsRepository(context)
        if (!settingsRepository.isAutostartEnabled()) {
            Log.d("BootReceiver", "Autostart disabled")
            return
        }

        Log.d("BootReceiver", "Autostart enabled, launching MainActivity")

        try {
            val activityIntent = Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("from_boot", true)
            }
            context.startActivity(activityIntent)
        } catch (e: Exception) {
            Log.e("BootReceiver", "Failed to launch MainActivity", e)
            try {
                val serviceIntent = Intent(context, KudosService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            } catch (serviceError: Exception) {
                Log.e("BootReceiver", "Failed to start service", serviceError)
            }
        }
    }
}
