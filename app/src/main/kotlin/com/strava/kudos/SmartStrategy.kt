package com.strava.kudos

import kotlin.random.Random

class SmartStrategy(context: BotContext) : BaseKotlinStrategy(context, TAG) {
    private val seenCards = mutableSetOf<String>()
    private var consecutiveLiked = 0
    private var cyclePauseActive = false
    private var ignoreEndUntilMs = 0L
    private var stepCount = 0

    override fun start() {
        consecutiveLiked = 0
        seenCards.clear()
        cyclePauseActive = false
        ignoreEndUntilMs = 0L
        stepCount = 0
        context.onSmartTimerTick(null)
        super.start()
    }

    override fun stop() {
        cyclePauseActive = false
        context.onSmartTimerTick(null)
        super.stop()
    }

    override fun step() {
        if (shouldStopNow() || cyclePauseActive) return
        context.domAdapter.scanVisibleCards { scan ->
            if (shouldStopNow()) return@scanVisibleCards
            if (scan == null) {
                log("scan null, reinject adapter")
                context.domAdapter.inject { schedule(1000) { step() } }
                return@scanVisibleCards
            }

            val settings = settings()
            stepCount += 1
            val visibleCards = scan.cards.filter { !it.activityId.isNullOrBlank() }
            val candidate = findCandidate(visibleCards)
            if (candidate != null) {
                clickCard(candidate) {
                    consecutiveLiked = 0
                    candidate.activityId?.let(seenCards::add)
                    val delayMs = randomDelay(settings.minDelayMs, settings.maxDelayMs)
                    if (stepCount <= 5 || stepCount % 20 == 0) {
                        log("clicked candidate, next step ${delayMs}ms, settings ${settings.minDelayMs}-${settings.maxDelayMs}ms")
                    }
                    schedule(delayMs) { step() }
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

            val isRealEnd = scan.isEnd && System.currentTimeMillis() >= ignoreEndUntilMs
            if (isRealEnd || consecutiveLiked >= settings.consecutiveLikedLimit) {
                reloadFeed(if (isRealEnd) "end feed" else "liked limit")
                return@scanVisibleCards
            }

            val scrollPx = Random.nextInt(700, 1401)
            val delayMs = randomDelay(settings.minDelayMs, settings.maxDelayMs)
            context.domAdapter.scrollBy(scrollPx)
            if (stepCount <= 5 || stepCount % 20 == 0) {
                log("scroll $scrollPx px, next step ${delayMs}ms, settings ${settings.minDelayMs}-${settings.maxDelayMs}ms")
            }
            schedule(delayMs) { step() }
        }
    }

    private fun reloadFeed(reason: String) {
        consecutiveLiked = 0
        seenCards.clear()

        val settings = settings()
        if (settings.smartCycleTimerEnabled) {
            val pauseMs = settings.smartCycleTimerMinutes.coerceIn(1, 1440) * 60_000
            log("cycle finished: $reason, pause ${settings.smartCycleTimerMinutes} min")
            context.domAdapter.scrollToTop()
            startCyclePause(pauseMs)
        } else {
            log("reload requested: $reason")
            context.domAdapter.scrollToTop { context.domAdapter.reloadPage() }
            schedule(2500) { step() }
        }
    }

    private fun startCyclePause(totalMs: Int) {
        cyclePauseActive = true

        fun tick(remainingMs: Int) {
            if (shouldStopNow()) {
                cyclePauseActive = false
                context.onSmartTimerTick(null)
                return
            }

            val secondsLeft = ((remainingMs + 999) / 1000).coerceAtLeast(0)
            context.onSmartTimerTick(secondsLeft)

            if (remainingMs <= 0) {
                context.onSmartTimerTick(null)
                log("smart timer elapsed, starting next cycle")
                consecutiveLiked = 0
                seenCards.clear()
                ignoreEndUntilMs = System.currentTimeMillis() + 30_000L
                log("reloading page after pause before next cycle")
                context.webViewController.reloadFromTopAndWait {
                    forceTopAndResume(attempt = 0)
                }
            } else {
                schedule(1000) { tick(remainingMs - 1000) }
            }
        }

        tick(totalMs)
    }

    private fun forceTopAndResume(attempt: Int) {
        if (shouldStopNow()) {
            cyclePauseActive = false
            context.onSmartTimerTick(null)
            return
        }

        context.domAdapter.scrollToTop {
            schedule(700) {
                context.domAdapter.getPageInfo { pageInfo ->
                    val scrollY = pageInfo?.scrollY ?: Int.MAX_VALUE
                    if (scrollY <= 50 || attempt >= 20) {
                        cyclePauseActive = false
                        log("starting next cycle from top, scrollY=$scrollY attempt=$attempt")
                        step()
                    } else {
                        log("waiting for top before next cycle, scrollY=$scrollY attempt=$attempt")
                        forceTopAndResume(attempt + 1)
                    }
                }
            }
        }
    }

    companion object {
        private const val TAG = "SmartStrategy"
    }
}
