package org.wemaps.app.map

import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * Loads only lane-related OSM ways inside the visible map bounds.
 *
 * OpenFreeMap's standard OpenMapTiles transportation layer does not expose all raw
 * lane tags. This supplementary overlay queries Overpass sparingly and keeps the
 * base map independent from the additional data service.
 */
class OsmLaneMarkingsOverlay(
    private val map: MapLibreMap,
    private val style: Style
) : AutoCloseable {

    private data class GeoPoint(val latitude: Double, val longitude: Double)
    private data class Bounds(
        val north: Double,
        val east: Double,
        val south: Double,
        val west: Double
    )

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val generation = AtomicInteger(0)
    private var closed = false
    private var lastRequestAt = 0L
    private var lastBounds: Bounds? = null

    private val cameraIdleListener = MapLibreMap.OnCameraIdleListener {
        requestVisibleRoads()
    }

    init {
        installLayers()
        map.addOnCameraIdleListener(cameraIdleListener)
        requestVisibleRoads()
    }

    private fun installLayers() {
        if (style.getSource(MAPPED_SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(MAPPED_SOURCE_ID, EMPTY_COLLECTION))
        }
        if (style.getSource(SCHEMATIC_SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(SCHEMATIC_SOURCE_ID, EMPTY_COLLECTION))
        }

        val firstSymbol = style.layers.firstOrNull { it is org.maplibre.android.style.layers.SymbolLayer }
        val mapped = LineLayer(MAPPED_LAYER_ID, MAPPED_SOURCE_ID).withProperties(
            PropertyFactory.lineColor("#F2F6FC"),
            PropertyFactory.lineWidth(1.35f),
            PropertyFactory.lineOpacity(0.92f),
            PropertyFactory.lineDasharray(arrayOf(2.2f, 2.0f)),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
            PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND)
        )
        val schematic = LineLayer(SCHEMATIC_LAYER_ID, SCHEMATIC_SOURCE_ID).withProperties(
            PropertyFactory.lineColor("#C4D0DE"),
            PropertyFactory.lineWidth(1.0f),
            PropertyFactory.lineOpacity(0.46f),
            PropertyFactory.lineDasharray(arrayOf(0.8f, 3.0f)),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
            PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND)
        )

        if (firstSymbol != null) {
            style.addLayerBelow(mapped, firstSymbol.id)
            style.addLayerBelow(schematic, firstSymbol.id)
        } else {
            style.addLayer(mapped)
            style.addLayer(schematic)
        }
    }

    private fun requestVisibleRoads() {
        if (closed || map.cameraPosition.zoom < MIN_ZOOM) return

        val raw = DoubleArray(4)
        runCatching { map.projection.getVisibleCoordinateBounds(raw) }
            .onFailure { Log.w(TAG, "Unable to read map bounds", it) }
            .getOrElse { return }

        val bounds = Bounds(
            north = raw[0].coerceIn(-85.0, 85.0),
            east = raw[1].coerceIn(-180.0, 180.0),
            south = raw[2].coerceIn(-85.0, 85.0),
            west = raw[3].coerceIn(-180.0, 180.0)
        )

        if (bounds.north <= bounds.south || bounds.east <= bounds.west) return
        if (bounds.north - bounds.south > MAX_LAT_SPAN ||
            bounds.east - bounds.west > MAX_LON_SPAN
        ) return

        val now = System.currentTimeMillis()
        val previous = lastBounds
        if (previous != null &&
            now - lastRequestAt < MIN_REQUEST_INTERVAL_MS &&
            sameArea(previous, bounds)
        ) return
        if (previous != null &&
            now - lastRequestAt < MIN_REQUEST_INTERVAL_MS
        ) return

        lastBounds = bounds
        lastRequestAt = now
        val requestGeneration = generation.incrementAndGet()

        executor.execute {
            val result = runCatching { fetchAndBuild(bounds) }
                .onFailure { Log.w(TAG, "OSM lane data request failed", it) }
                .getOrDefault(Pair(EMPTY_COLLECTION, EMPTY_COLLECTION))

            mainHandler.post {
                if (closed || requestGeneration != generation.get()) return@post
                (style.getSource(MAPPED_SOURCE_ID) as? GeoJsonSource)?.setGeoJson(result.first)
                (style.getSource(SCHEMATIC_SOURCE_ID) as? GeoJsonSource)?.setGeoJson(result.second)
            }
        }
    }

    private fun fetchAndBuild(bounds: Bounds): Pair<String, String> {
        val bbox = listOf(bounds.south, bounds.west, bounds.north, bounds.east)
            .joinToString(",") { String.format(Locale.US, "%.6f", it) }

        val query = """
            [out:json][timeout:20];
            (
              way["highway"]["lanes"]($bbox);
              way["highway"]["lanes:forward"]($bbox);
              way["highway"]["lane_markings"]($bbox);
              way["highway"]["turn:lanes"]($bbox);
            );
            out geom;
        """.trimIndent()

        val connection = URL(OVERPASS_URL).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.doOutput = true
            connection.useCaches = false
            connection.setRequestProperty("User-Agent", USER_AGENT)
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            val body = "data=" + URLEncoder.encode(query, "UTF-8")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

            val code = connection.responseCode
            val input = if (code in 200..299) connection.inputStream else connection.errorStream
            val response = input?.use { stream ->
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
            }.orEmpty()
            if (code !in 200..299) {
                throw IllegalStateException("Overpass returned HTTP $code")
            }
            return buildMarkings(JSONObject(response))
        } finally {
            connection.disconnect()
        }
    }

    private fun buildMarkings(root: JSONObject): Pair<String, String> {
        val mappedFeatures = JSONArray()
        val schematicFeatures = JSONArray()
        val elements = root.optJSONArray("elements") ?: JSONArray()

        for (index in 0 until elements.length()) {
            val way = elements.optJSONObject(index) ?: continue
            if (way.optString("type") != "way") continue
            val tags = way.optJSONObject("tags") ?: continue

            // lane_markings=no is explicit: never draw painted separators for this way.
            val markingTag = tags.optString("lane_markings")
            if (markingTag.equals("no", ignoreCase = true)) continue

            val laneCount = readLaneCount(tags) ?: continue
            if (laneCount !in 2..8) continue

            val geometry = way.optJSONArray("geometry") ?: continue
            val centreLine = ArrayList<GeoPoint>(geometry.length())
            for (pointIndex in 0 until geometry.length()) {
                val point = geometry.optJSONObject(pointIndex) ?: continue
                val lat = point.optDouble("lat", Double.NaN)
                val lon = point.optDouble("lon", Double.NaN)
                if (lat.isFinite() && lon.isFinite() &&
                    lat in -85.0..85.0 && lon in -180.0..180.0
                ) {
                    centreLine.add(GeoPoint(lat, lon))
                }
            }
            if (centreLine.size < 2) continue

            val laneWidth = readLaneWidth(tags, laneCount)
            val totalWidth = readRoadWidth(tags) ?: (laneWidth * laneCount)
            if (totalWidth !in 4.0..32.0) continue

            val destination = if (markingTag.equals("yes", ignoreCase = true)) {
                mappedFeatures
            } else {
                schematicFeatures
            }

            // These are centreline-derived offsets, not surveyed lane polygons.
            for (separator in 1 until laneCount) {
                val offsetMeters = -totalWidth / 2.0 + (totalWidth / laneCount) * separator
                val offsetLine = offsetPolyline(centreLine, offsetMeters)
                if (offsetLine.size < 2) continue

                val coordinates = JSONArray()
                offsetLine.forEach { point ->
                    coordinates.put(JSONArray().put(point.longitude).put(point.latitude))
                }
                destination.put(
                    JSONObject()
                        .put("type", "Feature")
                        .put(
                            "geometry",
                            JSONObject()
                                .put("type", "LineString")
                                .put("coordinates", coordinates)
                        )
                        .put("properties", JSONObject())
                )
            }
        }

        return Pair(featureCollection(mappedFeatures), featureCollection(schematicFeatures))
    }

    private fun readLaneCount(tags: JSONObject): Int? {
        tags.optString("lanes").toIntOrNull()?.let { return it }

        val forward = tags.optString("lanes:forward").toIntOrNull()
        val backward = tags.optString("lanes:backward").toIntOrNull()
        if (forward != null || backward != null) return (forward ?: 0) + (backward ?: 0)

        val turnTags = listOf(
            tags.optString("turn:lanes"),
            tags.optString("turn:lanes:forward"),
            tags.optString("turn:lanes:backward")
        ).filter { it.isNotBlank() }

        if (turnTags.isEmpty()) return null
        val directionalCount = turnTags.sumOf { tag ->
            tag.split('|').count { it.isNotBlank() }
        }
        return directionalCount.takeIf { it > 0 }
    }

    private fun readRoadWidth(tags: JSONObject): Double? {
        parseWidth(tags.optString("width"))?.let { return it }
        parseWidth(tags.optString("est_width"))?.let { return it }

        val laneWidths = tags.optString("width:lanes")
            .split('|')
            .mapNotNull { parseWidth(it) }
        if (laneWidths.size >= 2) return laneWidths.sum()
        return null
    }

    private fun readLaneWidth(tags: JSONObject, laneCount: Int): Double {
        val laneWidths = tags.optString("width:lanes")
            .split('|')
            .mapNotNull { parseWidth(it) }
        if (laneWidths.size == laneCount) {
            return laneWidths.average().coerceIn(2.2, 5.5)
        }
        return DEFAULT_LANE_WIDTH_METERS
    }

    private fun parseWidth(raw: String): Double? {
        if (raw.isBlank()) return null
        val value = Regex("""[-+]?\d+(?:[.,]\d+)?""").find(raw)?.value
            ?.replace(',', '.')?.toDoubleOrNull() ?: return null
        val lower = raw.lowercase(Locale.US)
        val meters = when {
            lower.contains("ft") || lower.contains("feet") || lower.contains("'") -> value * 0.3048
            else -> value
        }
        return meters.takeIf { it in 1.0..40.0 }
    }

    /**
     * Offsets a road centreline in local metres. The vertex normal uses the
     * incoming/outgoing tangent, so markings remain reasonably smooth on curves.
     */
    private fun offsetPolyline(points: List<GeoPoint>, offsetMeters: Double): List<GeoPoint> {
        if (points.size < 2 || offsetMeters == 0.0) return points

        val meanLatitude = points.map { it.latitude }.average()
        val cosLatitude = cos(meanLatitude * PI / 180.0).coerceAtLeast(0.01)
        val metersPerDegreeLat = 111_320.0
        val metersPerDegreeLon = metersPerDegreeLat * cosLatitude

        return points.mapIndexed { index, point ->
            val previous = points[max(0, index - 1)]
            val next = points[min(points.lastIndex, index + 1)]
            val dx = (next.longitude - previous.longitude) * metersPerDegreeLon
            val dy = (next.latitude - previous.latitude) * metersPerDegreeLat
            val length = hypot(dx, dy).coerceAtLeast(0.001)
            val normalX = -dy / length
            val normalY = dx / length

            GeoPoint(
                latitude = point.latitude + (normalY * offsetMeters / metersPerDegreeLat),
                longitude = point.longitude + (normalX * offsetMeters / metersPerDegreeLon)
            )
        }
    }

    private fun sameArea(a: Bounds, b: Bounds): Boolean =
        abs(a.north - b.north) < 0.003 &&
            abs(a.south - b.south) < 0.003 &&
            abs(a.east - b.east) < 0.003 &&
            abs(a.west - b.west) < 0.003

    private fun featureCollection(features: JSONArray): String =
        JSONObject()
            .put("type", "FeatureCollection")
            .put("features", features)
            .toString()

    override fun close() {
        if (closed) return
        closed = true
        generation.incrementAndGet()
        map.removeOnCameraIdleListener(cameraIdleListener)
        executor.shutdownNow()
    }

    companion object {
        private const val TAG = "WemapsRoadMarkings"
        private const val OVERPASS_URL = "https://overpass-api.de/api/interpreter"
        private const val USER_AGENT = "Wemaps/0.1.0-dev (Android map; OpenStreetMap data)"
        private const val MIN_ZOOM = 15.5
        private const val MIN_REQUEST_INTERVAL_MS = 12_000L
        private const val CONNECT_TIMEOUT_MS = 12_000
        private const val READ_TIMEOUT_MS = 24_000
        private const val MAX_LAT_SPAN = 0.04
        private const val MAX_LON_SPAN = 0.06
        private const val DEFAULT_LANE_WIDTH_METERS = 3.25

        private const val MAPPED_SOURCE_ID = "wemaps-osm-lane-markings"
        private const val SCHEMATIC_SOURCE_ID = "wemaps-schematic-lane-guides"
        private const val MAPPED_LAYER_ID = "wemaps-osm-lane-markings-line"
        private const val SCHEMATIC_LAYER_ID = "wemaps-schematic-lane-guides-line"
        private const val EMPTY_COLLECTION = """{"type":"FeatureCollection","features":[]}"""
    }
}
