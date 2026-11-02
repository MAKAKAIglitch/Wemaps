package org.wemaps.app.location

/**
 * Foreground-only device fix used by the live map marker.
 *
 * The bearing is a course over ground when Android reports a reliable
 * movement bearing; it is not treated as a compass heading while stationary.
 */
data class DeviceLocation(
    val latitude: Double,
    val longitude: Double,
    val bearing: Float,
    val accuracyMeters: Float,
    val speedMetersPerSecond: Float,
    val timestampMillis: Long
)
