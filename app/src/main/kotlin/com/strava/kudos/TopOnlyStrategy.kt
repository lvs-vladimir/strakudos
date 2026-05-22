package com.strava.kudos

class TopOnlyStrategy(context: BotContext) : BaseKotlinStrategy(context, TAG) {
    private var cycles = 0

    override fun step() {
        if (shouldStopNow()) return
        cycles++
        context.domAdapter.scanVisibleCards { scan ->
            if (shouldStopNow()) return@scanVisibleCards
            if (scan == null) {
                context.domAdapter.inject { schedule(1000) { step() } }
                return@scanVisibleCards
            }

            val settings = settings()
            val topCards = scan.cards.filter { it.top < scan.innerHeight * 0.75 }
            val candidate = findCandidate(topCards)
            if (candidate != null) {
                clickCard(candidate) { schedule(randomDelay(settings.minDelayMs, settings.maxDelayMs)) { step() } }
                return@scanVisibleCards
            }

            if (cycles % 3 == 0) {
                log("top-only refresh")
                context.domAdapter.scrollToTop { context.domAdapter.reloadPage() }
                schedule(2500) { step() }
            } else {
                context.domAdapter.scrollToTop()
                schedule(randomDelay(settings.minDelayMs, settings.maxDelayMs)) { step() }
            }
        }
    }

    companion object {
        private const val TAG = "TopOnlyStrategy"
    }
}
