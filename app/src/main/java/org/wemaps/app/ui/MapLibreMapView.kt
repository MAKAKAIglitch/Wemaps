package org.wemaps.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.wemaps.app.location.DeviceLocation
import org.wemaps.app.map.DeviceLocationMarker
import org.wemaps.app.map.MapPalette
import org.wemaps.app.map.MapStyleConfig
import org.wemaps.app.map.MapStyleConfigurer
import org.wemaps.app.map.OsmLaneMarkingsOverlay

@Composable
fun MapLibreMapView(
    palette: MapPalette,
    location: DeviceLocation?,
    modifier: Modifier = Modifier,
    onStyleReady: (map: MapLibreMap, buildingsAvailable: Boolean) -> Unit
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val currentOnStyleReady by rememberUpdatedState(onStyleReady)
    val latestLocation by rememberUpdatedState(location)

    val mapView = remember(context) {
        MapView(context).apply {
            onCreate(null)
        }
    }
    var activeStyle by remember(mapView) { mutableStateOf<Style?>(null) }
    var roadMarkingsOverlay by remember(mapView) {
        mutableStateOf<OsmLaneMarkingsOverlay?>(null)
    }

    DisposableEffect(mapView, lifecycle) {
        var started = false
        var resumed = false

        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> {
                    if (!started) {
                        mapView.onStart()
                        started = true
                    }
                }

                Lifecycle.Event.ON_RESUME -> {
                    if (!started) {
                        mapView.onStart()
                        started = true
                    }
                    if (!resumed) {
                        mapView.onResume()
                        resumed = true
                    }
                }

                Lifecycle.Event.ON_PAUSE -> {
                    if (resumed) {
                        mapView.onPause()
                        resumed = false
                    }
                }

                Lifecycle.Event.ON_STOP -> {
                    if (resumed) {
                        mapView.onPause()
                        resumed = false
                    }
                    if (started) {
                        mapView.onStop()
                        started = false
                    }
                }

                else -> Unit
            }
        }

        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            roadMarkingsOverlay?.close()
            roadMarkingsOverlay = null
            if (resumed) mapView.onPause()
            if (started) mapView.onStop()
            mapView.onDestroy()
        }
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier
    )

    LaunchedEffect(location, activeStyle) {
        val fix = location ?: return@LaunchedEffect
        DeviceLocationMarker.update(activeStyle, fix)
    }

    LaunchedEffect(mapView) {
        mapView.getMapAsync { map ->
            map.uiSettings.isCompassEnabled = false
            map.uiSettings.isRotateGesturesEnabled = true
            map.uiSettings.isTiltGesturesEnabled = true
            map.uiSettings.isZoomGesturesEnabled = true
            map.uiSettings.isScrollGesturesEnabled = true

            map.setStyle(Style.Builder().fromUri(MapStyleConfig.styleUrl)) { style ->
                val layers = MapStyleConfigurer.apply(style, palette)
                DeviceLocationMarker.install(style)

                roadMarkingsOverlay?.close()
                roadMarkingsOverlay = OsmLaneMarkingsOverlay(map, style)
                activeStyle = style

                // Do not pretend that a fixed sample city is the device's location.
                // A live fix will move the camera as soon as Android provides one.
                val fix = latestLocation
                val initialTarget = if (fix != null) {
                    LatLng(fix.latitude, fix.longitude)
                } else {
                    LatLng(0.0, 0.0)
                }
                val initialZoom = if (fix != null) 16.2 else 2.6
                map.moveCamera(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.Builder()
                            .target(initialTarget)
                            .zoom(initialZoom)
                            .tilt(if (fix != null) 48.0 else 0.0)
                            .bearing(0.0)
                            .build()
                    )
                )

                currentOnStyleReady(map, layers.buildingsAvailable)
            }
        }
    }
}
