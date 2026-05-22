package com.strava.kudos

interface BotStrategy {
    fun start()
    fun stop()
}

data class BotContext(
    val webViewController: WebViewController,
    val domAdapter: DomAdapter,
    val settingsRepository: SettingsRepository,
    val likedActivityRepository: LikedActivityRepository,
    val logRepository: LogRepository,
    val clubRotationRepository: ClubRotationRepository,
    val shouldStop: () -> Boolean,
    val onKudosGiven: (String) -> Unit,
    val onClubNameChanged: (String) -> Unit
)
