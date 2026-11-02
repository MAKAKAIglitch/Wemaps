package org.wemaps.app.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.wemaps.app.location.DeviceLocation
import org.wemaps.app.map.MapStyleConfig
import org.wemaps.app.map.MapPalette

@Composable
fun MapScreen() {
    val context = LocalContext.current
    val palette = remember(context) { MapStyleConfig.load(context) }
    val snackbarState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleLoaded by remember { mutableStateOf(false) }
    var buildingsAvailable by remember { mutableStateOf(false) }
    var deviceLocation by remember { mutableStateOf<DeviceLocation?>(null) }
    var hasCenteredOnFirstFix by remember { mutableStateOf(false) }
    var lastKnownBearing by remember { mutableFloatStateOf(0f) }

    var hasFineLocationPermission by remember {
        mutableStateOf(
            context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var hasCoarseLocationPermission by remember {
        mutableStateOf(
            context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val hasLocationPermission = hasFineLocationPermission || hasCoarseLocationPermission

    fun showMessage(message: String) {
        scope.launch { snackbarState.showSnackbar(message) }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        hasFineLocationPermission =
            result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        hasCoarseLocationPermission =
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true ||
                context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED

        if (!hasFineLocationPermission && !hasCoarseLocationPermission) {
            showMessage("Для отображения твоего положения разреши Wemaps доступ к местоположению.")
        }
    }

    LaunchedEffect(Unit) {
        if (!hasLocationPermission) {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        }
    }

    DisposableEffect(context, hasLocationPermission, hasFineLocationPermission) {
        if (!hasLocationPermission) {
            onDispose { }
        } else {
            val locationManager =
                context.getSystemService(android.content.Context.LOCATION_SERVICE) as LocationManager

            fun acceptLocation(fix: Location) {
                val hasReliableCourse = fix.hasBearing() &&
                    (!fix.hasSpeed() || fix.speed >= 0.8f)
                if (hasReliableCourse) lastKnownBearing = fix.bearing

                deviceLocation = DeviceLocation(
                    latitude = fix.latitude,
                    longitude = fix.longitude,
                    bearing = if (hasReliableCourse) fix.bearing else lastKnownBearing,
                    accuracyMeters = if (fix.hasAccuracy()) fix.accuracy else 999f,
                    speedMetersPerSecond = if (fix.hasSpeed()) fix.speed else 0f,
                    timestampMillis = fix.time
                )
            }

            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    acceptLocation(location)
                }
            }

            val providers = if (hasFineLocationPermission) {
                listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            } else {
                listOf(LocationManager.NETWORK_PROVIDER)
            }

            for (provider in providers) {
                runCatching {
                    if (!locationManager.isProviderEnabled(provider)) return@runCatching

                    locationManager.getLastKnownLocation(provider)?.let { lastFix ->
                        if (lastFix.time > (deviceLocation?.timestampMillis ?: 0L)) {
                            acceptLocation(lastFix)
                        }
                    }

                    locationManager.requestLocationUpdates(
                        provider,
                        1_200L,
                        1.5f,
                        listener,
                        Looper.getMainLooper()
                    )
                }.onFailure {
                    // A missing or disabled provider should not prevent the other provider working.
                }
            }

            onDispose {
                runCatching { locationManager.removeUpdates(listener) }
            }
        }
    }

    LaunchedEffect(deviceLocation, map, styleLoaded) {
        val fix = deviceLocation ?: return@LaunchedEffect
        val readyMap = map ?: return@LaunchedEffect

        if (!hasCenteredOnFirstFix) {
            readyMap.animateCamera(
                CameraUpdateFactory.newCameraPosition(
                    CameraPosition.Builder()
                        .target(LatLng(fix.latitude, fix.longitude))
                        .zoom(16.4)
                        .tilt(48.0)
                        .bearing(0.0)
                        .build()
                ),
                650
            )
            hasCenteredOnFirstFix = true
        }
    }

    fun centerOnCurrentLocation() {
        val fix = deviceLocation
        if (fix == null) {
            if (!hasLocationPermission) {
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
            } else {
                showMessage("Получаем местоположение. Подожди появления GPS-точки.")
            }
            return
        }

        map?.animateCamera(
            CameraUpdateFactory.newCameraPosition(
                CameraPosition.Builder()
                    .target(LatLng(fix.latitude, fix.longitude))
                    .zoom(16.8)
                    .tilt(50.0)
                    .bearing(0.0)
                    .build()
            ),
            420
        )
        hasCenteredOnFirstFix = true
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.background.toComposeColor())
    ) {
        MapLibreMapView(
            palette = palette,
            location = deviceLocation,
            modifier = Modifier.fillMaxSize(),
            onStyleReady = { readyMap, hasBuildings ->
                map = readyMap
                buildingsAvailable = hasBuildings
                styleLoaded = true
            }
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            SearchBar(
                palette = palette,
                onClick = { showMessage("Поиск адресов подключим отдельным этапом.") }
            )

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap",
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                runCatching {
                                    context.startActivity(
                                        Intent(
                                            Intent.ACTION_VIEW,
                                            Uri.parse("https://www.openstreetmap.org/copyright")
                                        )
                                    )
                                }
                            }
                            .padding(horizontal = 5.dp, vertical = 4.dp),
                        color = palette.textSecondary.toComposeColor(),
                        style = MaterialTheme.typography.labelSmall
                    )

                    Surface(
                        color = palette.urban.toComposeColor().copy(alpha = 0.94f),
                        contentColor = palette.textSecondary.toComposeColor(),
                        shape = CircleShape
                    ) {
                        Text(
                            text = when {
                                !styleLoaded -> "MAP"
                                buildingsAvailable -> "3D"
                                else -> "MAP"
                            },
                            modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                MapBottomDock(
                    palette = palette,
                    onMap = { centerOnCurrentLocation() },
                    onSaved = { showMessage("Сохранённые места появятся в следующем этапе.") },
                    onLayers = { showMessage("Переключение картографических слоёв добавим отдельно.") }
                )
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 14.dp)
                .offset(y = 6.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            MapControlButton(
                palette = palette,
                glyph = MapGlyph.Location,
                description = "Показать моё местоположение",
                onClick = { centerOnCurrentLocation() }
            )
            MapControlButton(
                palette = palette,
                glyph = MapGlyph.Compass,
                description = "Повернуть карту на север"
            ) {
                map?.let { current ->
                    val position = current.cameraPosition
                    current.animateCamera(
                        CameraUpdateFactory.newCameraPosition(
                            CameraPosition.Builder()
                                .target(position.target ?: LatLng(0.0, 0.0))
                                .zoom(position.zoom)
                                .tilt(position.tilt)
                                .bearing(0.0)
                                .build()
                        ),
                        220
                    )
                }
            }
            MapControlButton(
                palette = palette,
                glyph = MapGlyph.Plus,
                description = "Приблизить карту"
            ) {
                map?.animateCamera(CameraUpdateFactory.zoomIn(), 180)
            }
            MapControlButton(
                palette = palette,
                glyph = MapGlyph.Minus,
                description = "Отдалить карту"
            ) {
                map?.animateCamera(CameraUpdateFactory.zoomOut(), 180)
            }
        }

        SnackbarHost(
            hostState = snackbarState,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 104.dp, start = 20.dp, end = 20.dp)
        )
    }
}

@Composable
private fun SearchBar(
    palette: MapPalette,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(7.dp, RoundedCornerShape(23.dp))
            .clickable(onClick = onClick),
        color = palette.urban.toComposeColor().copy(alpha = 0.97f),
        contentColor = palette.textPrimary.toComposeColor(),
        shape = RoundedCornerShape(23.dp),
        tonalElevation = 4.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 17.dp, vertical = 15.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(13.dp)
        ) {
            MapGlyphIcon(MapGlyph.Search, palette.routeHighlight.toComposeColor())
            Text(
                text = "Куда едем?",
                color = palette.textPrimary.toComposeColor(),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Medium
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = "WEMAPS",
                color = palette.textSecondary.toComposeColor(),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun MapBottomDock(
    palette: MapPalette,
    onMap: () -> Unit,
    onSaved: () -> Unit,
    onLayers: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(9.dp, RoundedCornerShape(25.dp)),
        color = palette.urban.toComposeColor().copy(alpha = 0.97f),
        contentColor = palette.textPrimary.toComposeColor(),
        shape = RoundedCornerShape(25.dp),
        tonalElevation = 5.dp
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 7.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            DockItem(
                palette = palette,
                glyph = MapGlyph.Map,
                label = "Карта",
                selected = true,
                onClick = onMap
            )
            DockItem(
                palette = palette,
                glyph = MapGlyph.Bookmark,
                label = "Сохранено",
                selected = false,
                onClick = onSaved
            )
            DockItem(
                palette = palette,
                glyph = MapGlyph.Layers,
                label = "Слои",
                selected = false,
                onClick = onLayers
            )
        }
    }
}

@Composable
private fun DockItem(
    palette: MapPalette,
    glyph: MapGlyph,
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    val color = if (selected) {
        palette.routeHighlight.toComposeColor()
    } else {
        palette.textSecondary.toComposeColor()
    }

    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(17.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 19.dp, vertical = 7.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        MapGlyphIcon(glyph, color)
        Text(
            text = label,
            color = color,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium
        )
    }
}

@Composable
private fun MapControlButton(
    palette: MapPalette,
    glyph: MapGlyph,
    description: String,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .size(47.dp)
            .shadow(5.dp, CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = description },
        color = palette.urban.toComposeColor().copy(alpha = 0.97f),
        contentColor = palette.textPrimary.toComposeColor(),
        shape = CircleShape,
        tonalElevation = 4.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            MapGlyphIcon(glyph, palette.textPrimary.toComposeColor())
        }
    }
}

private enum class MapGlyph {
    Search,
    Map,
    Bookmark,
    Layers,
    Compass,
    Location,
    Plus,
    Minus
}

@Composable
private fun MapGlyphIcon(
    glyph: MapGlyph,
    tint: Color
) {
    Canvas(Modifier.size(22.dp)) {
        val w = size.width
        val h = size.height
        val stroke = Stroke(width = 1.9.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        val path = Path()

        when (glyph) {
            MapGlyph.Search -> {
                drawCircle(tint, radius = w * 0.28f, center = androidx.compose.ui.geometry.Offset(w * 0.42f, h * 0.42f), style = stroke)
                drawLine(tint, androidx.compose.ui.geometry.Offset(w * 0.63f, h * 0.63f), androidx.compose.ui.geometry.Offset(w * 0.88f, h * 0.88f), strokeWidth = stroke.width, cap = StrokeCap.Round)
            }
            MapGlyph.Map -> {
                path.moveTo(w * 0.10f, h * 0.24f)
                path.lineTo(w * 0.38f, h * 0.12f)
                path.lineTo(w * 0.65f, h * 0.24f)
                path.lineTo(w * 0.90f, h * 0.12f)
                path.lineTo(w * 0.90f, h * 0.76f)
                path.lineTo(w * 0.65f, h * 0.88f)
                path.lineTo(w * 0.38f, h * 0.76f)
                path.lineTo(w * 0.10f, h * 0.88f)
                path.close()
                drawPath(path, tint, style = stroke)
                drawLine(tint, androidx.compose.ui.geometry.Offset(w * 0.38f, h * 0.12f), androidx.compose.ui.geometry.Offset(w * 0.38f, h * 0.76f), strokeWidth = stroke.width)
                drawLine(tint, androidx.compose.ui.geometry.Offset(w * 0.65f, h * 0.24f), androidx.compose.ui.geometry.Offset(w * 0.65f, h * 0.88f), strokeWidth = stroke.width)
            }
            MapGlyph.Bookmark -> {
                path.moveTo(w * 0.25f, h * 0.12f)
                path.lineTo(w * 0.75f, h * 0.12f)
                path.quadraticTo(w * 0.82f, h * 0.12f, w * 0.82f, h * 0.21f)
                path.lineTo(w * 0.82f, h * 0.88f)
                path.lineTo(w * 0.50f, h * 0.68f)
                path.lineTo(w * 0.18f, h * 0.88f)
                path.lineTo(w * 0.18f, h * 0.21f)
                path.quadraticTo(w * 0.18f, h * 0.12f, w * 0.25f, h * 0.12f)
                path.close()
                drawPath(path, tint, style = stroke)
            }
            MapGlyph.Layers -> {
                path.moveTo(w * 0.50f, h * 0.10f)
                path.lineTo(w * 0.91f, h * 0.33f)
                path.lineTo(w * 0.50f, h * 0.56f)
                path.lineTo(w * 0.09f, h * 0.33f)
                path.close()
                drawPath(path, tint, style = stroke)
                drawLine(tint, androidx.compose.ui.geometry.Offset(w * 0.13f, h * 0.53f), androidx.compose.ui.geometry.Offset(w * 0.50f, h * 0.75f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, androidx.compose.ui.geometry.Offset(w * 0.87f, h * 0.53f), androidx.compose.ui.geometry.Offset(w * 0.50f, h * 0.75f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, androidx.compose.ui.geometry.Offset(w * 0.20f, h * 0.72f), androidx.compose.ui.geometry.Offset(w * 0.50f, h * 0.90f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, androidx.compose.ui.geometry.Offset(w * 0.80f, h * 0.72f), androidx.compose.ui.geometry.Offset(w * 0.50f, h * 0.90f), strokeWidth = stroke.width, cap = StrokeCap.Round)
            }
            MapGlyph.Compass -> {
                drawCircle(tint, radius = w * 0.39f, style = stroke)
                path.moveTo(w * 0.62f, h * 0.27f)
                path.lineTo(w * 0.54f, h * 0.56f)
                path.lineTo(w * 0.35f, h * 0.68f)
                path.lineTo(w * 0.44f, h * 0.41f)
                path.close()
                drawPath(path, tint)
            }
            MapGlyph.Location -> {
                drawCircle(
                    tint,
                    radius = w * 0.37f,
                    center = androidx.compose.ui.geometry.Offset(w * 0.5f, h * 0.5f),
                    style = stroke
                )
                drawCircle(
                    tint,
                    radius = w * 0.12f,
                    center = androidx.compose.ui.geometry.Offset(w * 0.5f, h * 0.5f)
                )
                drawLine(
                    tint,
                    androidx.compose.ui.geometry.Offset(w * 0.5f, h * 0.02f),
                    androidx.compose.ui.geometry.Offset(w * 0.5f, h * 0.19f),
                    strokeWidth = stroke.width,
                    cap = StrokeCap.Round
                )
                drawLine(
                    tint,
                    androidx.compose.ui.geometry.Offset(w * 0.5f, h * 0.81f),
                    androidx.compose.ui.geometry.Offset(w * 0.5f, h * 0.98f),
                    strokeWidth = stroke.width,
                    cap = StrokeCap.Round
                )
                drawLine(
                    tint,
                    androidx.compose.ui.geometry.Offset(w * 0.02f, h * 0.5f),
                    androidx.compose.ui.geometry.Offset(w * 0.19f, h * 0.5f),
                    strokeWidth = stroke.width,
                    cap = StrokeCap.Round
                )
                drawLine(
                    tint,
                    androidx.compose.ui.geometry.Offset(w * 0.81f, h * 0.5f),
                    androidx.compose.ui.geometry.Offset(w * 0.98f, h * 0.5f),
                    strokeWidth = stroke.width,
                    cap = StrokeCap.Round
                )
            }
            MapGlyph.Plus -> {
                drawLine(tint, androidx.compose.ui.geometry.Offset(w * 0.50f, h * 0.15f), androidx.compose.ui.geometry.Offset(w * 0.50f, h * 0.85f), strokeWidth = stroke.width, cap = StrokeCap.Round)
                drawLine(tint, androidx.compose.ui.geometry.Offset(w * 0.15f, h * 0.50f), androidx.compose.ui.geometry.Offset(w * 0.85f, h * 0.50f), strokeWidth = stroke.width, cap = StrokeCap.Round)
            }
            MapGlyph.Minus -> {
                drawLine(tint, androidx.compose.ui.geometry.Offset(w * 0.15f, h * 0.50f), androidx.compose.ui.geometry.Offset(w * 0.85f, h * 0.50f), strokeWidth = stroke.width, cap = StrokeCap.Round)
            }
        }
    }
}

private fun String.toComposeColor(): Color =
    Color(android.graphics.Color.parseColor(this))
