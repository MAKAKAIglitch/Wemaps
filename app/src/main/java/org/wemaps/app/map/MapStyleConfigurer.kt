package org.wemaps.app.map

import android.graphics.Color
import com.mapbox.geojson.FeatureCollection
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.BackgroundLayer
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.FillExtrusionLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.wemaps.app.ui.LocationArrowBitmap

data class MapStyleLayers(
    val buildingsAvailable: Boolean,
    val locationSource: GeoJsonSource,
    val mappedLaneSource: GeoJsonSource,
    val inferredLaneSource: GeoJsonSource,
    val turnArrowSource: GeoJsonSource
)

object MapStyleConfigurer {
    fun apply(style: Style, palette: MapPalette): MapStyleLayers {
        applyBasePalette(style, palette)
        val buildingsAvailable = addBuildingExtrusions(style, palette.buildingRoof)
        val roadSources = addRoadMarkingLayers(style, palette)
        val locationSource = addLocationMarker(style)

        return MapStyleLayers(
            buildingsAvailable = buildingsAvailable,
            locationSource = locationSource,
            mappedLaneSource = roadSources.first,
            inferredLaneSource = roadSources.second,
            turnArrowSource = roadSources.third
        )
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
        setFillColor(style, "building", palette.buildingSide)
    }

    private fun setBackgroundColor(style: Style, layerId: String, color: String) {
        val layer = style.getLayer(layerId) as? BackgroundLayer ?: return
        layer.setProperties(PropertyFactory.backgroundColor(color))
    }

    private fun setLineColor(style: Style, layerId: String, color: String) {
        val layer = style.getLayer(layerId) as? LineLayer ?: return
        layer.setProperties(PropertyFactory.lineColor(color))
    }

    private fun setFillColor(style: Style, layerId: String, color: String) {
        val layer = style.getLayer(layerId) as? FillLayer ?: return
        layer.setProperties(
            PropertyFactory.fillColor(color),
            PropertyFactory.fillOpacity(1.0f)
        )
    }

    private fun addBuildingExtrusions(style: Style, color: String): Boolean {
        if (style.getSource("openmaptiles") == null) return false
        if (style.getLayer("wemaps-buildings-3d") != null) return true

        val buildings = FillExtrusionLayer("wemaps-buildings-3d", "openmaptiles").apply {
            sourceLayer = "building"
            minZoom = 14.5f
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
                PropertyFactory.fillExtrusionVerticalGradient(false)
            )
        }

        // Add opaque 3D geometry above 2D building footprints and below text labels.
        val firstSymbolLayer = style.getLayers().firstOrNull { it is SymbolLayer }
        if (firstSymbolLayer != null) {
            style.addLayerBelow(buildings, firstSymbolLayer.id)
        } else {
            style.addLayer(buildings)
        }
        return true
    }

    private fun addRoadMarkingLayers(
        style: Style,
        palette: MapPalette
    ): Triple<GeoJsonSource, GeoJsonSource, GeoJsonSource> {
        val empty = FeatureCollection.fromFeatures(emptyList())
        val mappedSource = GeoJsonSource("wemaps-osm-markings-mapped", empty)
        val inferredSource = GeoJsonSource("wemaps-osm-markings-inferred", empty)
        val turnArrowSource = GeoJsonSource("wemaps-osm-turn-arrows", empty)
        style.addSource(mappedSource)
        style.addSource(inferredSource)
        style.addSource(turnArrowSource)

        val mapped = LineLayer("wemaps-osm-markings-mapped-layer", mappedSource.id).apply {
            minZoom = 15.0f
            setProperties(
                PropertyFactory.lineColor(palette.roadMarking),
                PropertyFactory.lineWidth(1.35f),
                PropertyFactory.lineOpacity(0.88f),
                PropertyFactory.lineDasharray(arrayOf(2.4f, 1.8f)),
                PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
                PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND)
            )
        }
        val inferred = LineLayer("wemaps-osm-markings-inferred-layer", inferredSource.id).apply {
            minZoom = 15.0f
            setProperties(
                PropertyFactory.lineColor(palette.roadMarkingMuted),
                PropertyFactory.lineWidth(1.05f),
                PropertyFactory.lineOpacity(0.56f),
                PropertyFactory.lineDasharray(arrayOf(1.8f, 2.4f)),
                PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
                PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND)
            )
        }
        val arrows = SymbolLayer("wemaps-osm-turn-arrows-layer", turnArrowSource.id).apply {
            minZoom = 16.0f
            setProperties(
                PropertyFactory.textField(Expression.get("glyph")),
                PropertyFactory.textSize(13.0f),
                PropertyFactory.textColor(palette.roadMarking),
                PropertyFactory.textHaloColor(palette.roadCasing),
                PropertyFactory.textHaloWidth(1.3f),
                PropertyFactory.textRotate(Expression.get("bearing")),
                PropertyFactory.textRotationAlignment(Property.TEXT_ROTATION_ALIGNMENT_MAP),
                PropertyFactory.textAllowOverlap(false),
                PropertyFactory.textIgnorePlacement(false)
            )
        }

        val firstSymbolLayer = style.getLayers().firstOrNull { it is SymbolLayer }
        if (firstSymbolLayer != null) {
            style.addLayerBelow(mapped, firstSymbolLayer.id)
            style.addLayerAbove(inferred, mapped.id)
            style.addLayerAbove(arrows, inferred.id)
        } else {
            style.addLayer(mapped)
            style.addLayer(inferred)
            style.addLayer(arrows)
        }
        return Triple(mappedSource, inferredSource, turnArrowSource)
    }

    private fun addLocationMarker(style: Style): GeoJsonSource {
        style.addImage("wemaps-location-arrow", LocationArrowBitmap.create())
        val source = GeoJsonSource(
            "wemaps-device-location",
            FeatureCollection.fromFeatures(emptyList())
        )
        style.addSource(source)

        val halo = CircleLayer("wemaps-device-location-halo", source.id).apply {
            setProperties(
                PropertyFactory.circleColor("#35A9FF"),
                PropertyFactory.circleRadius(17.0f),
                PropertyFactory.circleOpacity(0.18f),
                PropertyFactory.circleStrokeColor("#FFFFFF"),
                PropertyFactory.circleStrokeWidth(1.4f),
                PropertyFactory.circleStrokeOpacity(0.82f)
            )
        }
        val arrow = SymbolLayer("wemaps-device-location-arrow", source.id).apply {
            setProperties(
                PropertyFactory.iconImage("wemaps-location-arrow"),
                PropertyFactory.iconSize(0.54f),
                PropertyFactory.iconAllowOverlap(true),
                PropertyFactory.iconIgnorePlacement(true),
                PropertyFactory.iconRotate(Expression.get("bearing")),
                PropertyFactory.iconRotationAlignment(Property.ICON_ROTATION_ALIGNMENT_MAP),
                PropertyFactory.iconPitchAlignment(Property.ICON_PITCH_ALIGNMENT_VIEWPORT)
            )
        }
        style.addLayer(halo)
        style.addLayer(arrow)
        return source
    }
}
