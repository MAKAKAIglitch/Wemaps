package org.wemaps.app.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
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
 * The device marker is a real geographic feature, not a screen-centred Compose decoration.
 * It is updated in the map's GeoJSON source as Android provides location fixes.
 */
object DeviceLocationMarker {
    private const val SOURCE_ID = "wemaps-device-location-source"
    private const val LAYER_ID = "wemaps-device-location"
    private const val IMAGE_ID = "wemaps-device-pointer"

    private const val EMPTY_COLLECTION = """{"type":"FeatureCollection","features":[]}"""

    fun install(style: Style) {
        if (style.getImage(IMAGE_ID) == null) {
            style.addImage(IMAGE_ID, createPointerBitmap())
        }

        if (style.getSource(SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(SOURCE_ID, EMPTY_COLLECTION))
        }

        if (style.getLayer(LAYER_ID) == null) {
            val layer = SymbolLayer(LAYER_ID, SOURCE_ID).withProperties(
                PropertyFactory.iconImage(IMAGE_ID),
                PropertyFactory.iconSize(0.78f),
                PropertyFactory.iconAnchor(Property.ICON_ANCHOR_CENTER),
                PropertyFactory.iconRotationAlignment(Property.ICON_ROTATION_ALIGNMENT_MAP),
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

        (style.getLayer(LAYER_ID) as? SymbolLayer)?.setProperties(
            PropertyFactory.iconRotate(location.bearing)
        )
    }

    private fun createPointerBitmap(): Bitmap {
        val bitmap = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = AndroidColor.WHITE
            style = Paint.Style.FILL
            setShadowLayer(7f, 0f, 3f, 0x70000000)
        }
        val outer = Path().apply {
            moveTo(48f, 5f)
            cubicTo(54f, 5f, 58f, 11f, 61f, 19f)
            lineTo(86f, 79f)
            cubicTo(89f, 87f, 83f, 91f, 76f, 87f)
            lineTo(48f, 70f)
            lineTo(20f, 87f)
            cubicTo(13f, 91f, 7f, 87f, 10f, 79f)
            lineTo(35f, 19f)
            cubicTo(38f, 11f, 42f, 5f, 48f, 5f)
            close()
        }
        canvas.drawPath(outer, shadowPaint)

        val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = AndroidColor.rgb(36, 151, 255)
            style = Paint.Style.FILL
        }
        val inner = Path().apply {
            moveTo(48f, 13f)
            lineTo(79f, 80f)
            lineTo(48f, 61f)
            lineTo(17f, 80f)
            close()
        }
        canvas.drawPath(inner, fillPaint)

        val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xBFFFFFFF.toInt()
            strokeWidth = 3.5f
            strokeCap = Paint.Cap.ROUND
            style = Paint.Style.STROKE
        }
        canvas.drawLine(48f, 23f, 48f, 49f, highlightPaint)

        return bitmap
    }
}
