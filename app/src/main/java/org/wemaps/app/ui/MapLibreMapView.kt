package org.wemaps.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.wemaps.app.map.MapPalette
import org.wemaps.app.map.MapStyleConfig
import org.wemaps.app.map.MapStyleConfigurer

@Composable
fun MapLibreMapView(
    palette: MapPalette,
    modifier: Modifier = Modifier,
    onStyleReady: (buildingsAvailable: Boolean) -> Unit
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val currentOnStyleReady by rememberUpdatedState(onStyleReady)

    val mapView = remember(context) {
        MapView(context).apply {
            onCreate(null)
        }
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
            if (resumed) mapView.onPause()
            if (started) mapView.onStop()
            mapView.onDestroy()
        }
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier
    )

    LaunchedEffect(mapView, palette.buildingRoof) {
        mapView.getMapAsync { map ->
            map.setStyle(Style.Builder().fromUri(MapStyleConfig.styleUrl)) { style ->
                val buildingsAvailable = MapStyleConfigurer.apply(style, palette)

                map.moveCamera(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.Builder()
                            // Neutral demo camera position until GNSS integration is added.
                            .target(LatLng(52.517, 13.388))
                            .zoom(15.2)
                            .tilt(52.0)
                            .build()
                    )
                )
                currentOnStyleReady(buildingsAvailable)
            }
        }
    }
}
