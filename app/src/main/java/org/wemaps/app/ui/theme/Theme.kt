package org.wemaps.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val WemapsDarkColors = darkColorScheme(
    primary = Color(0xFFB65CE8),
    onPrimary = Color(0xFF171321),
    secondary = Color(0xFF91A9C0),
    onSecondary = Color(0xFF172331),
    background = Color(0xFF182330),
    onBackground = Color(0xFFE8F0F7),
    surface = Color(0xFF202D3C),
    onSurface = Color(0xFFE8F0F7),
    surfaceVariant = Color(0xFF263649),
    onSurfaceVariant = Color(0xFFAFC1D0)
)

@Composable
fun WemapsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = WemapsDarkColors,
        content = content
    )
}
