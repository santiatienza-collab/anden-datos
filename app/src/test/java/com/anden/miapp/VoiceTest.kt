package com.anden.miapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceTest {
    private fun st(id: String, name: String) = Station(id, id, name, 40.0, -3.0)

    private val stations = listOf(
        st("1", "Madrid-Atocha Cercanías"),
        st("2", "Madrid-Puerta de Atocha-Almudena Grandes"),
        st("3", "Barcelona-Sants"),
        st("4", "Sant Adrià de Besòs"),
        st("5", "Alcalá de Henares"),
        st("6", "Vigo-Urzaiz"),
        st("7", "Mataró"),
    )

    @Test fun `un nombre parcial elige la estación más ajustada`() {
        assertEquals("1", matchStation(listOf("Atocha"), stations)?.id)
    }

    @Test fun `se ignoran las palabras de cortesía y el artículo`() {
        assertEquals("3", matchStation(listOf("quiero ir a la estación de Sants"), stations)?.id)
        assertEquals("5", matchStation(listOf("abre la estación de Alcalá de Henares por favor"), stations)?.id)
    }

    @Test fun `tolera tildes y errores pequeños del reconocimiento`() {
        assertEquals("7", matchStation(listOf("mataro"), stations)?.id)
        assertEquals("4", matchStation(listOf("san adria de besos"), stations)?.id)
    }

    @Test fun `usa las alternativas del reconocedor si la primera no vale`() {
        assertEquals("6", matchStation(listOf("bigo urzais", "Vigo Urzaiz"), stations)?.id)
    }

    @Test fun `no inventa una estación que no existe`() {
        assertNull(matchStation(listOf("Narnia Central"), stations))
        assertNull(matchStation(listOf("la estación de"), stations))
    }

    private val st1 = Station("1", "1", "Madrid-Atocha Cercanías", 40.0, -3.0, region = "madrid")

    private fun board(acc: AccessibilitySummary = AccessibilitySummary(false, 0, 0, 0), alerts: List<StationAlert> = emptyList(), deps: List<BoardRow> = emptyList()) =
        StationBoard(st1, true, acc, alerts, deps, emptyList())

    private fun row(line: String, delay: Int?, status: BoardStatus, epoch: Long = 2_000) =
        BoardRow("t$line$delay", epoch, line, "Alcalá de Henares", "13:11", "13:32", delay, status, Level.Amber)

    @Test fun `el resumen habla de ascensores, avisos de la linea y retrasos`() {
        val alerts = listOf(
            AlertItem("a1", "Huelga de maquinistas el lunes. Más información en https://renfe.com #Huelga", AlertCategory.Strike, "warning", null, false, emptyList(), listOf("C7"), emptyList(), true, null),
            AlertItem("a2", "Obras en la línea C9 con autobuses", AlertCategory.Bus, "warning", null, false, emptyList(), listOf("C9"), emptyList(), true, null),
        )
        val b = board(AccessibilitySummary(false, 2, 1, 0), deps = listOf(row("C7", 21, BoardStatus.Delayed), row("C2", 0, BoardStatus.OnTime), row("C5", null, BoardStatus.Cancelled)))
        val text = spokenSummary(st1, b, alerts, nowEpoch = 1_000)
        assertTrue(text, text.startsWith("Estación de Madrid-Atocha Cercanías."))
        assertTrue(text, "2 ascensores fuera de servicio" in text)
        assertTrue(text, "1 escalera mecánica fuera de servicio" in text)
        assertTrue(text, "Huelga: Huelga de maquinistas el lunes." in text) // acaba en punto aunque el aviso no lo traiga
        assertTrue("el enlace y la etiqueta no se leen", "https" !in text && "#" !in text)
        assertTrue("el aviso de otra línea (C9) no se lee", "C9" !in text)
        assertTrue(text, "1 cancelada" in text)
        assertTrue(text, "21 minutos de retraso" in text)
    }

    @Test fun `no se leen avisos de otra region aunque la linea se llame igual`() {
        val alerts = listOf(
            AlertItem("v1", "Línea C2# retrasos por tren mercante en Algemesí", AlertCategory.Disruption, "warning", null, false, listOf("comunitat-valenciana"), listOf("C7"), emptyList(), true, null),
            AlertItem("m1", "Línea C7# obras de mantenimiento este fin de semana", AlertCategory.Works, "warning", null, false, listOf("madrid"), listOf("C7"), emptyList(), true, null),
        )
        val text = spokenSummary(st1, board(deps = listOf(row("C7", 0, BoardStatus.OnTime))), alerts, nowEpoch = 1_000)
        assertTrue(text, "Algemesí" !in text)
        assertTrue(text, "Obras o mantenimiento: Línea C7 obras de mantenimiento" in text)
        assertTrue("sin almohadillas", "#" !in text)
    }

    @Test fun `sin incidencias lo dice claramente`() {
        val text = spokenSummary(st1, board(deps = listOf(row("C7", 0, BoardStatus.OnTime))), emptyList(), nowEpoch = 1_000)
        assertTrue(text, "No constan avisos de ascensores o escaleras averiados." in text)
        assertTrue(text, "No hay otros avisos" in text)
        assertTrue(text, "no tienen retrasos importantes" in text)
    }
}
