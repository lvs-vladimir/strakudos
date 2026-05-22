package com.strava.kudos

import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlin.random.Random

abstract class BaseKotlinStrategy(
    protected val context: BotContext,
    private val tag: String
) : BotStrategy {
    protected val handler = Handler(Looper.getMainLooper())
    protected var running = false

    override fun start() {
        running = true
        log("started")
        context.domAdapter.inject { schedule(500) { step() } }
    }

    override fun stop() {
        running = false
        handler.removeCallbacksAndMessages(null)
        log("stopped")
    }

    protected abstract fun step()

    protected fun shouldStopNow(): Boolean = !running || context.shouldStop()

    protected fun schedule(delayMs: Int, action: () -> Unit) {
        if (shouldStopNow()) return
        handler.postDelayed({ if (!shouldStopNow()) action() }, delayMs.toLong().coerceAtLeast(100L))
    }

    protected fun randomDelay(min: Int, max: Int, floor: Int = 200): Int {
        val safeMin = min.coerceAtLeast(floor)
        val safeMax = max.coerceAtLeast(safeMin + 1)
        return Random.nextInt(safeMin, safeMax)
    }

    protected fun settings(): BotSettings = context.settingsRepository.getSettings()

    protected fun log(message: String) {
        val full = "${javaClass.simpleName}: $message"
        Log.d(tag, full)
        context.logRepository.add(full, system = true)
    }

    protected fun clickCard(card: FeedCard, after: () -> Unit) {
        val activityId = card.activityId
        if (activityId.isNullOrBlank()) {
            after()
            return
        }
        context.domAdapter.clickKudos(activityId) { clicked ->
            if (clicked) {
                context.likedActivityRepository.markLiked(activityId)
                context.onKudosGiven(card.athleteName.ifBlank { activityId })
                log("clicked $activityId ${card.athleteName}")
            } else {
                log("click failed $activityId")
            }
            after()
        }
    }

    protected fun findCandidate(cards: List<FeedCard>, requireRecent: Boolean = false): FeedCard? {
        return cards.firstOrNull { card ->
            val id = card.activityId ?: return@firstOrNull false
            !card.isOwn &&
                (!requireRecent || card.isRecent) &&
                card.hasKudosButton &&
                !card.isLiked &&
                !context.likedActivityRepository.isLiked(id)
        }
    }

    companion object {
        private const val TAG = "KotlinStrategy"
    }
}
