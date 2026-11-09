package com.example.tren4you

/**
 * Compañía y tipo de servicio de un tren. Solo hay datos abiertos de Renfe y de SFM (Mallorca);
 * Ouigo, Iryo, FGC o Euskotren no aparecen porque no publican un feed equivalente.
 */
enum class Service(val key: String, val label: String, val company: String) {
    Av("av", "AVE · AVLO", "Renfe"),
    Ld("ld", "Larga dist.", "Renfe"),
    Avant("avant", "Avant", "Renfe"),
    Md("md", "Media dist.", "Renfe"),
    Cercanias("cercanias", "Cercanías", "Renfe"),
    Rodalies("rodalies", "Rodalies", "Renfe"),
    Sfm("sfm", "SFM Mallorca", "SFM");

    companion object {
        fun from(key: String?) = entries.firstOrNull { it.key == key }
    }
}
