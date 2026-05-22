package com.strava.kudos

import kotlin.random.Random

class SmartStrategy(context: BotContext) : BaseKotlinStrategy(context, TAG) {
    private val seenCards = mutableSetOf<String>()
    private var consecutiveLiked = 0

    override fun start() {
        consecutiveLiked = 0
        seenCards.clear()
        super.start()
    }

    override fun step() {
        if (shouldStopNow()) return
        context.domAdapter.scanVisibleCards { scan ->
            if (shouldStopNow()) return@scanVisibleCards
            if (scan == null) {
                log("scan null, reinject adapter")
                context.domAdapter.inject { schedule(1000) { step() } }
                return@scanVisibleCards
            }

            val settings = settings()
            val visibleCards = scan.cards.filter { !it.activityId.isNullOrBlank() }
            val candidate = findCandidate(visibleCards)
            if (candidate != null) {
                clickCard(candidate) {
                    consecutiveLiked = 0
                    candidate.activityId?.let(seenCards::add)
                    schedule(randomDelay(settings.minDelayMs, settings.maxDelayMs)) { step() }
                }
                return@scanVisibleCards
            }

            val newlySeenLiked = visibleCards.count { card ->
                val id = card.activityId ?: card.athleteName
                if (card.isOwn || seenCards.contains(id)) {
                    false
                } else {
                    seenCards.add(id)
                    card.isLiked || card.activityId?.let { context.likedActivityRepository.isLiked(it) } == true
                }
            }

            if (newlySeenLiked > 0) {
                consecutiveLiked += newlySeenLiked
                log("already liked $consecutiveLiked/${settings.consecutiveLikedLimit}")
            }

            if (scan.isEnd || consecutiveLiked >= settings.consecutiveLikedLimit) {
                reloadFeed(if (scan.isEnd) "end of feed" else "liked limit")
                return@scanVisibleCards
            }

            context.domAdapter.scrollBy(Random.nextInt(300, 701))
            schedule(randomDelay(settings.minDelayMs, settings.maxDelayMs)) { step() }
        }
    }

    private fun reloadFeed(reason: String) {
        consecutiveLiked = 0
        seenCards.clear()
        log("reload requested: $reason")
        context.domAdapter.scrollToTop { context.domAdapter.reloadPage() }
        schedule(2500) { step() }
    }

    companion object {
        private const val TAG = "SmartStrategy"
    }
}
