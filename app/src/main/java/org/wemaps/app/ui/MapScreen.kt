package org.wemaps.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.wemaps.app.map.MapStyleConfig

@Composable
fun MapScreen() {
    val context = LocalContext.current
    val palette = remember(context) { MapStyleConfig.load(context) }
    var styleLoaded by remember { mutableStateOf(false) }
    var buildingsAvailable by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.background.toComposeColor())
    ) {
        MapLibreMapView(
            palette = palette,
            modifier = Modifier.fillMaxSize(),
            onStyleReady = { hasBuildings ->
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
            Surface(
                color = palette.urban.toComposeColor().copy(alpha = 0.94f),
                contentColor = palette.textPrimary.toComposeColor(),
                shape = RoundedCornerShape(24.dp),
                tonalElevation = 5.dp,
                shadowElevation = 5.dp
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(
                        color = palette.route.toComposeColor(),
                        shape = CircleShape,
                        modifier = Modifier.size(34.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Outlined.Map,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text(
                            text = "Wemaps",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "OpenStreetMap · 3D map",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textSecondary.toComposeColor()
                        )
                    }
                    Spacer(modifier = Modifier.weight(1f))
                    Surface(
                        color = palette.background.toComposeColor(),
                        contentColor = palette.textSecondary.toComposeColor(),
                        shape = CircleShape
                    ) {
                        Text(
                            text = "3D",
                            modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            Surface(
                color = palette.urban.toComposeColor().copy(alpha = 0.94f),
                contentColor = palette.textPrimary.toComposeColor(),
                shape = RoundedCornerShape(22.dp),
                tonalElevation = 5.dp,
                shadowElevation = 5.dp
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 11.dp),
                    verticalArrangement = Arrangement.spacedBy(3.dp)
                ) {
                    Text(
                        text = when {
                            !styleLoaded -> "Подключение карты…"
                            buildingsAvailable -> "Карта подключена · слой 3D-зданий доступен"
                            else -> "Карта подключена · 3D-здания недоступны в источнике"
                        },
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "Демонстрационная область · GPS и поиск добавляются отдельно",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textSecondary.toComposeColor()
                    )
                }
            }
        }
    }
}

private fun String.toComposeColor(): Color =
    Color(android.graphics.Color.parseColor(this))
