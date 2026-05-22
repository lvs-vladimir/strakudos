package com.strava.kudos

import kotlin.random.Random

class AggressiveStrategy(context: BotContext) : BaseKotlinStrategy(context, TAG) {
    private var emptyCycles = 0

    override fun step() {
        if (shouldStopNow()) return
        context.domAdapter.scanVisibleCards { scan ->
            if (shouldStopNow()) return@scanVisibleCards
            if (scan == null) {
                context.domAdapter.inject { schedule(700) { step() } }
                return@scanVisibleCards
            }

            val candidate = findCandidate(scan.cards)
            if (candidate != null) {
                emptyCycles = 0
                clickCard(candidate) { schedule(randomDelay(500, 1600, floor = 200)) { step() } }
                return@scanVisibleCards
            }

            emptyCycles++
            if (scan.isEnd || emptyCycles >= 8) {
                emptyCycles = 0
                log("aggressive reload")
                context.domAdapter.scrollToTop { context.domAdapter.reloadPage() }
                schedule(1800) { step() }
                return@scanVisibleCards
            }

            context.domAdapter.scrollBy(Random.nextInt(700, 1300))
            schedule(randomDelay(600, 1800, floor = 200)) { step() }
        }
    }

    companion object {
        private const val TAG = "AggressiveStrategy"
    }
}
