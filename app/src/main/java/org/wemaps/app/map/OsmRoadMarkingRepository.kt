package org.wemaps.app.map

import com.mapbox.geojson.Feature
import com.mapbox.geojson.FeatureCollection
import com.mapbox.geojson.LineString
import com.mapbox.geojson.Point
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.maplibre.android.geometry.LatLng
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

data class OsmRoadMarkings(
    val mappedMarkings: FeatureCollection,
    val inferredMarkings: FeatureCollection,
    val turnArrows: FeatureCollection,
    val roadCount: Int
)

/**
 * Downloads only lane-tagged highway ways close to the visible map camera.
 * Lane divider geometry is derived from OSM lane counts/widths; it is deliberately
 * presented as schematic because OSM usually stores a road centreline, not paint polygons.
 */
object OsmRoadMarkingRepository {
    private const val ENDPOINT = "https://overpass-api.de/api/interpreter"
    private const val EARTH_RADIUS_METERS = 6_371_000.0

    private var cachedCenter: LatLng? = null
    private var cachedAt = 0L
    private var cachedResult: OsmRoadMarkings? = null

    suspend fun load(center: LatLng, zoom: Double): OsmRoadMarkings =
        withContext(Dispatchers.IO) {
            val radiusMeters = (3_000.0 / 2.0.pow((zoom - 13.0).coerceAtLeast(0.0)))
                .coerceIn(220.0, 1_000.0)

            synchronized(this@OsmRoadMarkingRepository) {
                val previous = cachedCenter
                val age = System.currentTimeMillis() - cachedAt
                if (previous != null && cachedResult != null && age < 5 * 60_000L &&
                    distanceMeters(previous.latitude, previous.longitude, center.latitude, center.longitude) < 220.0
                ) {
                    return@withContext cachedResult!!
                }
            }

            val result = fetch(center, radiusMeters)
            synchronized(this@OsmRoadMarkingRepository) {
                cachedCenter = center
                cachedAt = System.currentTimeMillis()
                cachedResult = result
            }
            result
        }

    private fun fetch(center: LatLng, radiusMeters: Double): OsmRoadMarkings {
        val latDelta = radiusMeters / 111_320.0
        val lonScale = (111_320.0 * cos(Math.toRadians(center.latitude))).coerceAtLeast(10_000.0)
        val lonDelta = radiusMeters / lonScale
        val south = center.latitude - latDelta
        val west = center.longitude - lonDelta
        val north = center.latitude + latDelta
        val east = center.longitude + lonDelta
        val bbox = String.format(Locale.US, "%.6f,%.6f,%.6f,%.6f", south, west, north, east)

        val highwayFilter = "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"
        val query = """
            [out:json][timeout:15];
            (
              way["highway"~"$highwayFilter"]["lanes"]($bbox);
              way["highway"~"$highwayFilter"]["lane_markings"]($bbox);
              way["highway"~"$highwayFilter"]["turn:lanes"]($bbox);
              way["highway"~"$highwayFilter"]["turn:lanes:forward"]($bbox);
            );
            out tags geom;
        """.trimIndent()

        val connection = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 12_000
            readTimeout = 18_000
            setRequestProperty("User-Agent", "Wemaps-Android/0.1 (OpenStreetMap lane overlay)")
            setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            setRequestProperty("Accept", "application/json")
        }

        try {
            val payload = "data=" + URLEncoder.encode(query, "UTF-8")
            connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(payload) }
            val code = connection.responseCode
            if (code !in 200..299) {
                throw IOException("Overpass returned HTTP $code")
            }
            val body = connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            return parse(body)
        } finally {
            connection.disconnect()
        }
    }

    private fun parse(body: String): OsmRoadMarkings {
        val elements = JSONObject(body).optJSONArray("elements")
        val mapped = ArrayList<Feature>()
        val inferred = ArrayList<Feature>()
        val arrows = ArrayList<Feature>()
        val seen = HashSet<Long>()
        var roadCount = 0

        if (elements != null) {
            for (index in 0 until elements.length()) {
                val element = elements.optJSONObject(index) ?: continue
                if (element.optString("type") != "way") continue
                val id = element.optLong("id", -1L)
                if (id >= 0 && !seen.add(id)) continue

                val tags = element.optJSONObject("tags") ?: continue
                if (tags.optString("lane_markings").equals("no", ignoreCase = true)) continue

                val laneCount = laneCount(tags) ?: continue
                if (laneCount !in 2..8) continue

                val geometry = element.optJSONArray("geometry") ?: continue
                if (geometry.length() < 2) continue

                val points = ArrayList<Point>(geometry.length())
                for (pointIndex in 0 until geometry.length()) {
                    val node = geometry.optJSONObject(pointIndex) ?: continue
                    val lat = node.optDouble("lat", Double.NaN)
                    val lon = node.optDouble("lon", Double.NaN)
                    if (lat.isFinite() && lon.isFinite()) {
                        points.add(Point.fromLngLat(lon, lat))
                    }
                }
                if (points.size < 2) continue

                val laneWidth = laneWidthMeters(tags, laneCount)
                val target = if (tags.optString("lane_markings").equals("yes", ignoreCase = true)) {
                    mapped
                } else {
                    inferred
                }

                for (divider in 1 until laneCount) {
                    val offset = (divider - laneCount / 2.0) * laneWidth
                    val offsetPoints = offsetLine(points, offset)
                    if (offsetPoints.size >= 2) {
                        target.add(Feature.fromGeometry(LineString.fromLngLats(offsetPoints)))
                    }
                }

                addTurnArrows(tags, points, laneCount, laneWidth, arrows)
                roadCount++
            }
        }

        return OsmRoadMarkings(
            mappedMarkings = FeatureCollection.fromFeatures(mapped),
            inferredMarkings = FeatureCollection.fromFeatures(inferred),
            turnArrows = FeatureCollection.fromFeatures(arrows),
            roadCount = roadCount
        )
    }

    private fun laneCount(tags: JSONObject): Int? {
        tags.optString("lanes").toIntOrNull()?.let { return it }
        val forward = tags.optString("lanes:forward").toIntOrNull()
        val backward = tags.optString("lanes:backward").toIntOrNull()
        if (forward != null || backward != null) return (forward ?: 0) + (backward ?: 0)

        val turnLanes = tags.optString("turn:lanes")
        if (turnLanes.isNotBlank()) return turnLanes.split('|').size
        return null
    }

    private fun laneWidthMeters(tags: JSONObject, laneCount: Int): Double {
        parseWidth(tags.optString("width"))?.let { width ->
            if (width / laneCount in 2.0..5.5) return width / laneCount
        }
        parseWidth(tags.optString("est_width"))?.let { width ->
            if (width / laneCount in 2.0..5.5) return width / laneCount
        }
        val laneWidths = tags.optString("width:lanes")
            .split('|')
            .mapNotNull(::parseWidth)
            .filter { it in 2.0..5.5 }
        if (laneWidths.isNotEmpty()) return laneWidths.average()
        return 3.25
    }

    private fun parseWidth(value: String): Double? {
        val match = Regex("""^\s*(\d+(?:\.\d+)?)\s*(m|ft|'|)?\s*$""", RegexOption.IGNORE_CASE)
            .matchEntire(value) ?: return null
        val amount = match.groupValues[1].toDoubleOrNull() ?: return null
        return when (match.groupValues[2].lowercase(Locale.ROOT)) {
            "ft", "'" -> amount * 0.3048
            else -> amount
        }
    }

    private fun offsetLine(points: List<Point>, offsetMeters: Double): List<Point> {
        if (kotlin.math.abs(offsetMeters) < 0.01) return points
        return points.mapIndexed { index, point ->
            val previous = points[(index - 1).coerceAtLeast(0)]
            val next = points[(index + 1).coerceAtMost(points.lastIndex)]
            val bearing = bearingDegrees(previous, next)
            val perpendicular = Math.toRadians(bearing + 90.0)
            val latitude = point.latitude()
            val latitudeOffset = offsetMeters * cos(perpendicular) / 111_320.0
            val longitudeOffset = offsetMeters * sin(perpendicular) /
                (111_320.0 * cos(Math.toRadians(latitude)).coerceAtLeast(0.05))
            Point.fromLngLat(
                point.longitude() + longitudeOffset,
                latitude + latitudeOffset
            )
        }
    }

    private fun addTurnArrows(
        tags: JSONObject,
        points: List<Point>,
        laneCount: Int,
        laneWidth: Double,
        target: MutableList<Feature>
    ) {
        val oneWay = tags.optString("oneway").let { it == "yes" || it == "1" || it == "true" }
        if (!oneWay) return

        val values = tags.optString("turn:lanes")
            .ifBlank { tags.optString("turn:lanes:forward") }
            .split('|')
        if (values.size != laneCount) return

        val middleIndex = (points.size - 1) / 2
        val start = points[middleIndex]
        val end = points[(middleIndex + 1).coerceAtMost(points.lastIndex)]
        val bearing = bearingDegrees(start, end)
        val center = points[points.size / 2]

        values.forEachIndexed { laneIndex, laneValue ->
            val glyph = laneValue.split(';').firstNotNullOfOrNull { turnGlyph(it.trim()) } ?: return@forEachIndexed
            val offset = (laneIndex + 0.5 - laneCount / 2.0) * laneWidth
            val marker = offsetLine(listOf(center, center), offset).first()
            val properties = JsonObject().apply {
                addProperty("glyph", glyph)
                addProperty("bearing", bearing.toFloat())
            }
            target.add(Feature.fromGeometry(marker, properties))
        }
    }

    private fun turnGlyph(value: String): String? = when (value) {
        "left", "sharp_left" -> "↰"
        "slight_left", "merge_to_left" -> "↖"
        "through", "none" -> "↑"
        "slight_right", "merge_to_right" -> "↗"
        "right", "sharp_right" -> "↱"
        "reverse" -> "↶"
        else -> null
    }

    private fun bearingDegrees(from: Point, to: Point): Double {
        val lat1 = Math.toRadians(from.latitude())
        val lat2 = Math.toRadians(to.latitude())
        val deltaLon = Math.toRadians(to.longitude() - from.longitude())
        val y = sin(deltaLon) * cos(lat2)
        val x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(deltaLon)
        return (Math.toDegrees(kotlin.math.atan2(y, x)) + 360.0) % 360.0
    }

    private fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLon / 2) * sin(dLon / 2)
        return 2.0 * EARTH_RADIUS_METERS * kotlin.math.asin(kotlin.math.sqrt(a))
    }

    private fun Double.pow(power: Double): Double = Math.pow(this, power)
}
