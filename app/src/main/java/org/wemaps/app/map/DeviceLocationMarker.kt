package org.wemaps.app.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Color as AndroidColor
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.wemaps.app.location.DeviceLocation

/**
 * The device marker is a small geographic dot, not a screen-centred overlay.
 * Its GeoJSON point follows the latest coordinates supplied by Android location providers.
 */
object DeviceLocationMarker {
    private const val SOURCE_ID = "wemaps-device-location-source"
    private const val LAYER_ID = "wemaps-device-location"
    private const val IMAGE_ID = "wemaps-device-location-dot"

    private const val EMPTY_COLLECTION = """{"type":"FeatureCollection","features":[]}"""

    fun install(style: Style) {
        if (style.getImage(IMAGE_ID) == null) {
            style.addImage(IMAGE_ID, createLocationDotBitmap())
        }

        if (style.getSource(SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(SOURCE_ID, EMPTY_COLLECTION))
        }

        if (style.getLayer(LAYER_ID) == null) {
            val layer = SymbolLayer(LAYER_ID, SOURCE_ID).withProperties(
                PropertyFactory.iconImage(IMAGE_ID),
                PropertyFactory.iconSize(0.55f),
                PropertyFactory.iconAnchor(Property.ICON_ANCHOR_CENTER),
                PropertyFactory.iconPitchAlignment(Property.ICON_PITCH_ALIGNMENT_VIEWPORT),
                PropertyFactory.iconAllowOverlap(true),
                PropertyFactory.iconIgnorePlacement(true)
            )
            style.addLayer(layer)
        }
    }

    fun update(style: Style?, location: DeviceLocation) {
        style ?: return
        val source = style.getSource(SOURCE_ID) as? GeoJsonSource ?: return
        val point = JSONObject()
            .put("type", "Feature")
            .put(
                "geometry",
                JSONObject()
                    .put("type", "Point")
                    .put("coordinates", JSONArray().put(location.longitude).put(location.latitude))
            )
            .put("properties", JSONObject())

        source.setGeoJson(
            JSONObject()
                .put("type", "FeatureCollection")
                .put("features", JSONArray().put(point))
                .toString()
        )
    }

    private fun createLocationDotBitmap(): Bitmap {
        val bitmap = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        // A restrained glow keeps the small dot visible over both dark and light roads.
        val haloPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = AndroidColor.argb(42, 36, 151, 255)
            style = Paint.Style.FILL
        }
        canvas.drawCircle(32f, 32f, 21f, haloPaint)

        val outlinePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = AndroidColor.WHITE
            style = Paint.Style.FILL
            setShadowLayer(4f, 0f, 1.5f, 0x65000000)
        }
        canvas.drawCircle(32f, 32f, 10f, outlinePaint)

        val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = AndroidColor.rgb(36, 151, 255)
            style = Paint.Style.FILL
        }
        canvas.drawCircle(32f, 32f, 7f, dotPaint)

        val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xCFFFFFFF.toInt()
            style = Paint.Style.FILL
        }
        canvas.drawCircle(29.5f, 29.5f, 2f, highlightPaint)

        return bitmap
    }
}
