package org.wemaps.app.map

import android.content.Context
import android.graphics.Color
import org.json.JSONObject

data class MapPalette(
    val background: String,
    val land: String,
    val urban: String,
    val water: String,
    val park: String,
    val roadCasing: String,
    val roadMinor: String,
    val roadLocal: String,
    val roadSecondary: String,
    val roadPrimary: String,
    val roadMajor: String,
    val buildingSide: String,
    val buildingRoof: String,
    val roadMarking: String,
    val roadMarkingMuted: String,
    val route: String,
    val routeHighlight: String,
    val laneSelected: String,
    val laneOther: String,
    val textPrimary: String,
    val textSecondary: String
)

object MapStyleConfig {
    const val styleUrl = "https://tiles.openfreemap.org/styles/dark"

    private val fallback = MapPalette(
        background = "#182330",
        land = "#202D3C",
        urban = "#263649",
        water = "#10283D",
        park = "#20342D",
        roadCasing = "#172433",
        roadMinor = "#35495E",
        roadLocal = "#455D75",
        roadSecondary = "#58738D",
        roadPrimary = "#718DA8",
        roadMajor = "#91A9C0",
        buildingSide = "#405A72",
        buildingRoof = "#66839D",
        route = "#B65CE8",
        routeHighlight = "#E5B8FF",
        laneSelected = "#F4F7FC",
        laneOther = "#8795A5",
        textPrimary = "#E8F0F7",
        textSecondary = "#AFC1D0"
    )

    fun load(context: Context): MapPalette = runCatching {
        val root = context.assets.open("map-style-presets.json")
            .bufferedReader()
            .use { JSONObject(it.readText()) }

        val presets = root.getJSONObject("presets")
        val presetId = root.optString("defaultPreset", "midnight-navigation")
        val preset = presets.optJSONObject(presetId)
            ?: presets.getJSONObject("midnight-navigation")
        val colors = preset.getJSONObject("colors")
        val overrides = root.optJSONObject("customOverrides")?.optJSONObject("colors")

        fun color(token: String, default: String): String {
            val value = overrides?.optString(token)
                ?.takeIf { it.isNotBlank() }
                ?: colors.optString(token, default)

            return runCatching {
                Color.parseColor(value)
                value
            }.getOrDefault(default)
        }

        MapPalette(
            background = color("map.background", fallback.background),
            land = color("map.land", fallback.land),
            urban = color("map.urban", fallback.urban),
            water = color("map.water", fallback.water),
            park = color("map.park", fallback.park),
            roadCasing = color("road.casing", fallback.roadCasing),
            roadMinor = color("road.minor", fallback.roadMinor),
            roadLocal = color("road.local", fallback.roadLocal),
            roadSecondary = color("road.secondary", fallback.roadSecondary),
            roadPrimary = color("road.primary", fallback.roadPrimary),
            roadMajor = color("road.major", fallback.roadMajor),
            buildingSide = color("building.side", fallback.buildingSide),
            buildingRoof = color("building.roof", fallback.buildingRoof),
            roadMarking = color("road.marking", fallback.roadMarking),
            roadMarkingMuted = color("road.marking.muted", fallback.roadMarkingMuted),
            route = color("route.main", fallback.route),
            routeHighlight = color("route.highlight", fallback.routeHighlight),
            laneSelected = color("lane.selected", fallback.laneSelected),
            laneOther = color("lane.other", fallback.laneOther),
            textPrimary = color("text.primary", fallback.textPrimary),
            textSecondary = color("text.secondary", fallback.textSecondary)
        )
    }.getOrDefault(fallback)
}
