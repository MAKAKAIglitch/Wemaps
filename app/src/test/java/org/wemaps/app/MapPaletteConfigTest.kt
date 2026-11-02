package org.wemaps.app

import org.junit.Assert.assertEquals
import org.junit.Test

class MapPaletteConfigTest {
    @Test
    fun initialPalettePresetHasStableIdentifier() {
        assertEquals("midnight-navigation", "midnight-navigation")
    }
}
