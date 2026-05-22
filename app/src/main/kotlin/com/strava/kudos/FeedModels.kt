package com.strava.kudos

data class FeedCard(
    val activityId: String?,
    val ownerId: String?,
    val athleteName: String,
    val hasKudosButton: Boolean,
    val isLiked: Boolean,
    val isOwn: Boolean,
    val isRecent: Boolean,
    val top: Int = 0,
    val bottom: Int = 0
)

data class FeedScanResult(
    val cards: List<FeedCard>,
    val scrollY: Int,
    val scrollHeight: Int,
    val innerHeight: Int,
    val isEnd: Boolean,
    val url: String
)

data class PageInfo(
    val url: String,
    val path: String,
    val scrollY: Int,
    val scrollHeight: Int,
    val innerHeight: Int,
    val isEnd: Boolean
)

data class ClubLink(
    val url: String,
    val name: String
)
