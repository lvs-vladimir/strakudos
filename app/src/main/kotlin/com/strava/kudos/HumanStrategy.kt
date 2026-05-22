package com.strava.kudos

import kotlin.random.Random

class HumanStrategy(context: BotContext) : BaseKotlinStrategy(context, TAG) {
    private var endHits = 0

    override fun step() {
        if (shouldStopNow()) return
        context.domAdapter.scanVisibleCards { scan ->
            if (shouldStopNow()) return@scanVisibleCards
            if (scan == null) {
                context.domAdapter.inject { schedule(1500) { step() } }
                return@scanVisibleCards
            }

            val settings = settings()
            val candidate = findCandidate(scan.cards)
            if (candidate != null) {
                endHits = 0
                val thinkDelay = randomDelay(settings.minDelayMs, settings.maxDelayMs).coerceAtLeast(3500)
                schedule(thinkDelay) {
                    clickCard(candidate) { schedule(Random.nextInt(1600, 4200)) { step() } }
                }
                return@scanVisibleCards
            }

            if (scan.isEnd) {
                endHits++
                if (endHits >= 3) {
                    endHits = 0
                    log("human end reached, reload")
                    context.domAdapter.scrollToTop { context.domAdapter.reloadPage() }
                    schedule(3000) { step() }
                    return@scanVisibleCards
                }
            } else {
                endHits = 0
            }

            val scrollPx = Random.nextInt(180, 420)
            context.domAdapter.scrollBy(scrollPx)
            val pause = randomDelay(settings.minDelayMs, settings.maxDelayMs).coerceAtLeast(4000) + Random.nextInt(0, 3500)
            schedule(pause) { step() }
        }
    }

    companion object {
        private const val TAG = "HumanStrategy"
    }
}
