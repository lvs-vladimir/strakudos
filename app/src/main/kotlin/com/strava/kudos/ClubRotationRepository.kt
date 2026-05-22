package com.strava.kudos

import android.content.Context

class ClubRotationRepository(context: Context) {
    private val prefs = context.getSharedPreferences(SettingsRepository.PREFS_NAME, Context.MODE_PRIVATE)

    fun getClubs(): List<ClubLink> {
        return prefs.getStringSet(KEY_CLUBS, emptySet()).orEmpty()
            .mapNotNull { encoded ->
                val parts = encoded.split("|", limit = 2)
                val url = parts.getOrNull(0).orEmpty()
                if (url.isBlank()) null else ClubLink(url, parts.getOrNull(1).orEmpty().ifBlank { url })
            }
            .sortedBy { it.url }
    }

    fun saveClubs(clubs: List<ClubLink>) {
        prefs.edit().putStringSet(KEY_CLUBS, clubs.distinctBy { it.url }.map { "${it.url}|${it.name}" }.toSet()).apply()
    }

    fun mergeClubs(clubs: List<ClubLink>) {
        saveClubs((getClubs() + clubs).distinctBy { it.url })
    }

    fun getVisited(): Set<String> = prefs.getStringSet(KEY_VISITED, emptySet()).orEmpty()

    fun markVisited(url: String) {
        prefs.edit().putStringSet(KEY_VISITED, getVisited() + url).apply()
    }

    fun resetVisited() {
        prefs.edit().remove(KEY_VISITED).putInt(KEY_INDEX, 0).apply()
    }

    fun getIndex(): Int = prefs.getInt(KEY_INDEX, 0)

    fun setIndex(index: Int) {
        prefs.edit().putInt(KEY_INDEX, index).apply()
    }

    fun nextClub(): ClubLink? {
        val clubs = getClubs()
        if (clubs.isEmpty()) return null
        val visited = getVisited()
        if (visited.containsAll(clubs.map { it.url })) {
            resetVisited()
        }
        val freshVisited = getVisited()
        val start = getIndex().coerceIn(0, clubs.lastIndex)
        for (offset in clubs.indices) {
            val idx = (start + offset) % clubs.size
            val club = clubs[idx]
            if (!freshVisited.contains(club.url)) {
                setIndex((idx + 1) % clubs.size)
                return club
            }
        }
        return clubs.firstOrNull()
    }

    fun reset() {
        prefs.edit().remove(KEY_CLUBS).remove(KEY_VISITED).remove(KEY_INDEX).apply()
    }

    companion object {
        private const val KEY_CLUBS = "kotlin_club_urls"
        private const val KEY_VISITED = "kotlin_visited_clubs"
        private const val KEY_INDEX = "kotlin_club_index"
    }
}
