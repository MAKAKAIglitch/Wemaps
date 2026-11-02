package org.wemaps.app.ui

import android.content.Intent
import android.net.Uri
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
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
import org.wemaps.app.map.MapStyleConfig
import org.wemaps.app.map.MapPalette

private val DemoCenter = LatLng(52.517, 13.388)

@Composable
fun MapScreen() {
    val context = LocalContext.current
    val palette = remember(context) { MapStyleConfig.load(context) }
    val snackbarState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleLoaded by remember { mutableStateOf(false) }
    var buildingsAvailable by remember { mutableStateOf(false) }

    fun showMessage(message: String) {
        scope.launch { snackbarState.showSnackbar(message) }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.background.toComposeColor())
    ) {
        MapLibreMapView(
            palette = palette,
            modifier = Modifier.fillMaxSize(),
            onStyleReady = { readyMap, hasBuildings ->
                map = readyMap
                buildingsAvailable = hasBuildings
                styleLoaded = true
            }
        )

        // Map-first layout: search floats above the map; the compact dock stays at the bottom.
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
                    onMap = {
                        map?.let { current ->
                            current.animateCamera(
                                CameraUpdateFactory.newCameraPosition(
                                    CameraPosition.Builder()
                                        .target(DemoCenter)
                                        .zoom(15.2)
                                        .tilt(52.0)
                                        .bearing(0.0)
                                        .build()
                                ),
                                280
                            )
                        }
                    },
                    onSaved = { showMessage("Сохранённые места появятся в следующем этапе.") },
                    onLayers = { showMessage("Переключение картографических слоёв добавим отдельно.") }
                )
            }
        }

        // Original rounded direction-pointer artwork. It is a visual placeholder until GNSS
        // positioning is connected; it is not yet a live device location.
        RoundedPositionArrow(
            modifier = Modifier
                .align(Alignment.Center)
                .offset(y = 34.dp)
        )

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
                glyph = MapGlyph.Compass,
                description = "Повернуть карту на север"
            ) {
                map?.let { current ->
                    val position = current.cameraPosition
                    current.animateCamera(
                        CameraUpdateFactory.newCameraPosition(
                            CameraPosition.Builder()
                                .target(position.target ?: DemoCenter)
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

@Composable
private fun RoundedPositionArrow(
    modifier: Modifier = Modifier,
    bearingDegrees: Float = 0f
) {
    Canvas(
        modifier = modifier
            .size(width = 58.dp, height = 64.dp)
            .semantics {
                contentDescription = "Предпросмотр округлённой стрелки положения; GPS ещё не подключён"
            }
    ) {
        val center = androidx.compose.ui.geometry.Offset(size.width / 2f, size.height / 2f)
        drawCircle(
            color = Color(0x55000000),
            radius = size.minDimension * 0.45f,
            center = center
        )
        drawCircle(
            color = Color.White,
            radius = size.minDimension * 0.34f,
            center = center
        )

        rotate(degrees = bearingDegrees, pivot = center) {
            val cx = center.x
            val path = Path().apply {
                moveTo(cx, size.height * 0.08f)
                cubicTo(
                    cx + size.width * 0.04f, size.height * 0.08f,
                    cx + size.width * 0.07f, size.height * 0.12f,
                    cx + size.width * 0.11f, size.height * 0.18f
                )
                lineTo(size.width * 0.86f, size.height * 0.56f)
                cubicTo(
                    size.width * 0.92f, size.height * 0.64f,
                    size.width * 0.84f, size.height * 0.73f,
                    size.width * 0.76f, size.height * 0.68f
                )
                lineTo(cx + size.width * 0.13f, size.height * 0.61f)
                lineTo(cx + size.width * 0.13f, size.height * 0.85f)
                cubicTo(
                    cx + size.width * 0.13f, size.height * 0.96f,
                    cx - size.width * 0.13f, size.height * 0.96f,
                    cx - size.width * 0.13f, size.height * 0.85f
                )
                lineTo(cx - size.width * 0.13f, size.height * 0.61f)
                lineTo(size.width * 0.24f, size.height * 0.68f)
                cubicTo(
                    size.width * 0.16f, size.height * 0.73f,
                    size.width * 0.08f, size.height * 0.64f,
                    size.width * 0.14f, size.height * 0.56f
                )
                lineTo(cx - size.width * 0.11f, size.height * 0.18f)
                cubicTo(
                    cx - size.width * 0.07f, size.height * 0.12f,
                    cx - size.width * 0.04f, size.height * 0.08f,
                    cx, size.height * 0.08f
                )
                close()
            }

            drawPath(path, color = Color(0xFF48A9F5))
            drawPath(
                path,
                color = Color.White,
                style = Stroke(
                    width = 2.2.dp.toPx(),
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round
                )
            )
            drawLine(
                color = Color.White.copy(alpha = 0.55f),
                start = androidx.compose.ui.geometry.Offset(cx, size.height * 0.19f),
                end = androidx.compose.ui.geometry.Offset(cx, size.height * 0.48f),
                strokeWidth = 1.4.dp.toPx(),
                cap = StrokeCap.Round
            )
        }
    }
}

private enum class MapGlyph {
    Search,
    Map,
    Bookmark,
    Layers,
    Compass,
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
