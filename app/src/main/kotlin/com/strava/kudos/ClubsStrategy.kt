package com.strava.kudos

import kotlin.random.Random

class ClubsStrategy(context: BotContext) : BaseKotlinStrategy(context, TAG) {
    private var emptyCycles = 0
    private var consecutiveAlreadyLiked = 0
    private var cyclesInClub = 0

    override fun step() {
        if (shouldStopNow()) return
        context.domAdapter.getPageInfo { info ->
            if (shouldStopNow()) return@getPageInfo
            if (info == null) {
                context.domAdapter.inject { schedule(1000) { step() } }
                return@getPageInfo
            }

            when {
                info.path == "/clubs/search" || info.path == "/clubs" -> handleClubList()
                info.path.startsWith("/clubs/") -> handleClubPage(info.path)
                else -> goToClubSearch()
            }
        }
    }

    private fun goToClubSearch() {
        context.onClubNameChanged("")
        log("go to clubs search")
        context.domAdapter.goToUrl("/clubs/search")
        schedule(2500) { step() }
    }

    private fun handleClubList() {
        context.domAdapter.getClubLinks { found ->
            if (shouldStopNow()) return@getClubLinks
            if (found.isNotEmpty()) {
                context.clubRotationRepository.mergeClubs(found)
                log("clubs found=${found.size}, saved=${context.clubRotationRepository.getClubs().size}")
            }

            val next = context.clubRotationRepository.nextClub()
            if (next != null) {
                emptyCycles = 0
                consecutiveAlreadyLiked = 0
                cyclesInClub = 0
                log("go to club ${next.url}")
                context.onClubNameChanged(next.name.ifBlank { next.url.removePrefix("/clubs/") })
                context.domAdapter.goToUrl(next.url)
                schedule(3000) { step() }
            } else {
                context.domAdapter.scrollBy(900)
                schedule(1500) { step() }
            }
        }
    }

    private fun handleClubPage(path: String) {
        val clubUrl = path.substringBefore("/recent_activity")
        val clubName = clubUrl.removePrefix("/clubs/")
        context.onClubNameChanged(clubName)
        context.clubRotationRepository.markVisited(clubUrl)

        if (!path.contains("/recent_activity")) {
            log("open activity tab for $clubName")
            context.domAdapter.openClubActivityTab()
            schedule(2500) { step() }
            return
        }

        cyclesInClub++
        if (cyclesInClub > MAX_CYCLES_PER_CLUB) {
            log("club cycle limit, next club")
            goToNextClub()
            return
        }

        context.domAdapter.scanVisibleCards { scan ->
            if (shouldStopNow()) return@scanVisibleCards
            if (scan == null) {
                context.domAdapter.inject { schedule(1000) { step() } }
                return@scanVisibleCards
            }

            val candidate = findCandidate(scan.cards, requireRecent = true)
            if (candidate != null) {
                consecutiveAlreadyLiked = 0
                emptyCycles = 0
                val delay = clubDelay()
                schedule(delay) {
                    clickCard(candidate) { schedule(Random.nextInt(800, 1800)) { step() } }
                }
                return@scanVisibleCards
            }

            val already = scan.cards.count { card ->
                val id = card.activityId
                id != null && !card.isOwn && (card.isLiked || context.likedActivityRepository.isLiked(id))
            }
            if (already > 0) consecutiveAlreadyLiked += already
            log("club already=$consecutiveAlreadyLiked/${settings().consecutiveLikedLimit}")

            if (consecutiveAlreadyLiked >= settings().consecutiveLikedLimit || scan.isEnd) {
                log("club done, next club")
                goToNextClub()
                return@scanVisibleCards
            }

            emptyCycles++
            if (emptyCycles >= 3) {
                log("club empty cycles, next club")
                goToNextClub()
                return@scanVisibleCards
            }

            context.domAdapter.scrollBy(850)
            schedule(1800) { step() }
        }
    }

    private fun goToNextClub() {
        context.onClubNameChanged("")
        emptyCycles = 0
        consecutiveAlreadyLiked = 0
        cyclesInClub = 0
        context.domAdapter.goToUrl("/clubs/search")
        schedule(2500) { step() }
    }

    private fun clubDelay(): Int {
        val speed = settings().clubsSpeed
        return randomDelay(speed.minDelayMs, speed.maxDelayMs, floor = 200)
    }

    companion object {
        private const val TAG = "ClubsStrategy"
        private const val MAX_CYCLES_PER_CLUB = 4
    }
}
