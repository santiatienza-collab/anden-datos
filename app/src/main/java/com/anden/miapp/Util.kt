package com.anden.miapp

import java.text.Normalizer

private val ACCENTS = Regex("\\p{InCombiningDiacriticalMarks}+")

/** Minúsculas y sin acentos, para buscar "atocha" y encontrar "Atocha" o "Átocha". */
fun norm(s: String): String = ACCENTS.replace(Normalizer.normalize(s, Normalizer.Form.NFD), "").lowercase()

/** Estaciones cuyo nombre empieza por la búsqueda y, después, las que la contienen. */
fun searchStations(all: List<Station>, query: String, limit: Int = 60): List<Station> {
    val q = norm(query.trim())
    if (q.length < 2) return emptyList()
    val starts = all.filter { norm(it.name).startsWith(q) }
    val startIds = starts.mapTo(HashSet()) { it.id }
    return (starts + all.filter { it.id !in startIds && norm(it.name).contains(q) }).take(limit)
}

/** "hace 40 s", "hace 7 min", "hace 2 h". */
fun ageLabel(seconds: Long): String = when {
    seconds < 90 -> "hace ${seconds.coerceAtLeast(0)} s"
    seconds < 5_400 -> "hace ${(seconds + 30) / 60} min"
    else -> "hace ${(seconds + 1_800) / 3_600} h"
}
