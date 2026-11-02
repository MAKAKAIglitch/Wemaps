package org.wemaps.app.map

import android.graphics.Color
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.BackgroundLayer
import org.maplibre.android.style.layers.FillExtrusionLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer

object MapStyleConfigurer {
    fun apply(style: Style, palette: MapPalette): Boolean {
        applyBasePalette(style, palette)
        return addBuildingExtrusions(style, palette.buildingRoof)
    }

    private fun applyBasePalette(style: Style, palette: MapPalette) {
        setBackgroundColor(style, "background", palette.background)

        setLineColor(style, "highway_path", palette.roadMinor)
        setLineColor(style, "highway_minor", palette.roadLocal)
        setLineColor(style, "highway_major_casing", palette.roadCasing)
        setLineColor(style, "highway_major_inner", palette.roadPrimary)
        setLineColor(style, "highway_major_subtle", palette.roadSecondary)
        setLineColor(style, "highway_motorway_casing", palette.roadCasing)
        setLineColor(style, "highway_motorway_inner", palette.roadMajor)
        setLineColor(style, "highway_motorway_subtle", palette.roadMajor)
        setLineColor(style, "road_pier", palette.roadPrimary)
        setLineColor(style, "waterway", palette.water)

        setFillColor(style, "water", palette.water)
        setFillColor(style, "landuse_residential", palette.urban)
        setFillColor(style, "landcover_wood", palette.park)
        setFillColor(style, "landuse_park", palette.park)
        setFillColor(style, "building", palette.buildingSide, opaque = true)
    }

    private fun setBackgroundColor(style: Style, layerId: String, color: String) {
        val layer = style.getLayer(layerId) as? BackgroundLayer ?: return
        layer.setProperties(PropertyFactory.backgroundColor(color))
    }

    private fun setLineColor(style: Style, layerId: String, color: String) {
        val layer = style.getLayer(layerId) as? LineLayer ?: return
        layer.setProperties(PropertyFactory.lineColor(color))
    }

    private fun setFillColor(
        style: Style,
        layerId: String,
        color: String,
        opaque: Boolean = false
    ) {
        val layer = style.getLayer(layerId) as? FillLayer ?: return
        if (opaque) {
            layer.setProperties(
                PropertyFactory.fillColor(color),
                PropertyFactory.fillOpacity(1.0f)
            )
        } else {
            layer.setProperties(PropertyFactory.fillColor(color))
        }
    }

    private fun addBuildingExtrusions(style: Style, color: String): Boolean {
        if (style.getSource("openmaptiles") == null) return false
        if (style.getLayer("wemaps-buildings-3d") != null) return true

        val buildings = FillExtrusionLayer("wemaps-buildings-3d", "openmaptiles").apply {
            sourceLayer = "building"
            minZoom = 15.0f
            setFilter(
                Expression.all(
                    Expression.has("render_height"),
                    Expression.has("render_min_height")
                )
            )
            setProperties(
                PropertyFactory.fillExtrusionColor(Color.parseColor(color)),
                PropertyFactory.fillExtrusionHeight(Expression.get("render_height")),
                PropertyFactory.fillExtrusionBase(Expression.get("render_min_height")),
                PropertyFactory.fillExtrusionOpacity(1.0f),
                PropertyFactory.fillExtrusionVerticalGradient(true)
            )
        }

        // Put buildings above their 2D footprints but below labels.
        val firstSymbolLayer = style.getLayers().firstOrNull { it is SymbolLayer }
        if (firstSymbolLayer != null) {
            style.addLayerBelow(buildings, firstSymbolLayer.id)
        } else {
            style.addLayer(buildings)
        }
        return true
    }
}
