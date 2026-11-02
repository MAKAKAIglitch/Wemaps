package org.wemaps.app

import android.app.Application
import org.maplibre.android.MapLibre

class WemapsApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialise the renderer before a MapView is created.
        MapLibre.getInstance(this)
    }
}
