package org.wemaps.app.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper

/**
 * Foreground-only location updates. The caller is responsible for requesting runtime permission.
 * Uses both GPS and network providers so approximate location can still work indoors.
 */
class DeviceLocationTracker(context: Context) {
    private val manager = context.applicationContext
        .getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var listener: LocationListener? = null

    @SuppressLint("MissingPermission")
    fun start(onLocation: (Location) -> Unit) {
        stop()

        val providers = listOf(
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER
        ).filter { provider ->
            runCatching { manager.isProviderEnabled(provider) }.getOrDefault(false)
        }

        providers.mapNotNull { provider ->
            runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
        }.maxByOrNull { it.time }?.let(onLocation)

        val locationListener = LocationListener { location -> onLocation(Location(location)) }
        listener = locationListener

        providers.forEach { provider ->
            runCatching {
                manager.requestLocationUpdates(
                    provider,
                    1_000L,
                    2.0f,
                    locationListener,
                    Looper.getMainLooper()
                )
            }
        }
    }

    fun stop() {
        listener?.let { activeListener ->
            runCatching { manager.removeUpdates(activeListener) }
        }
        listener = null
    }
}
