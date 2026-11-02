# Wemaps — Technical Architecture

## 1. Architectural goals

- Android-first implementation.
- No project-operated server required for the first milestones.
- Map, search, routing, and weather providers must be replaceable.
- Keep UI code independent from external provider SDKs and response formats.
- Process device location locally wherever practical.
- Cache only according to provider terms and user settings.
- Keep third-party licenses and attribution visible and auditable.

## 2. Planned technology

- Kotlin.
- Jetpack Compose.
- Material 3 plus custom Violet Night components.
- MapLibre Native Android for map rendering.
- Android Location and GNSS APIs for device positioning.
- Room / SQLite for local structured data when required.
- Android WorkManager or appropriate platform APIs for deferrable background work.

Versions should be selected when the Android project is created. Do not copy obsolete version numbers from this planning document.

## 3. High-level module boundaries

The exact Gradle module layout may change, but responsibilities should remain separated.

### app

Application entry point, navigation between app features, dependency wiring, and lifecycle integration.

### core:designsystem

- Violet Night color tokens.
- Typography and shapes.
- Material 3 theme integration.
- Reusable map controls and cards.
- Navigation guidance, speed-limit, and camera UI components.

### core:map

- MapLibre lifecycle adapter.
- Style loading and custom map style.
- Camera and gesture behavior.
- 3D building layers.
- Route, sign, speed-camera, and point-of-interest overlays.
- Map attribution presentation.

### core:location

- Runtime permission handling.
- Location updates.
- GNSS and Android location metadata where available.
- Position quality and stale-fix handling.
- Local speed calculation / filtering.

### core:data

- Repository interfaces.
- Local persistence.
- Cache metadata.
- Mapping from provider models to internal domain models.

### feature:map

Main map screen, bottom dock, map controls, layers, and current-location presentation.

### feature:navigation

Active route UI, manoeuvre guidance, speed and speed-limit presentation, alerts, and route progress.

### feature:search

Address and place search UI, recent searches, and saved places.

### feature:weather

Current conditions and optional weather layers.

### feature:settings

Theme, units, alert preferences, provider settings, and privacy controls.

## 4. Provider interfaces

The app owns stable internal interfaces. External services are implemented behind adapters.

Planned conceptual interfaces:

- MapTileProvider — style, source metadata, tile endpoint configuration, and attribution.
- SearchProvider — address and place search.
- RoutingProvider — route calculation and navigation instructions.
- WeatherProvider — current conditions and forecast.
- CameraDataProvider — bounded speed-camera and enforcement data for a viewport or route corridor.
- Optional OfflineRegionProvider — later region packaging and download behavior.

The names above describe responsibilities; they are not yet implemented Kotlin APIs.

Provider adapters must expose:

- Required attribution.
- Terms and license references.
- Rate limits and download restrictions.
- API-key requirements.
- Data timestamp or freshness information when available.
- Whether caching is allowed and for how long.
- Errors and unavailable-data states.

Do not put provider-specific URLs or credentials directly in Compose screens.

## 5. Map rendering and 3D

MapLibre Native Android is the rendering engine. The app supplies style data, vector sources, layers, camera state, and feature overlays.

Use fill-extrusion for buildings when the source schema exposes suitable building attributes. Height data may be absent or incomplete; the UI and rendering pipeline must not imply that estimated heights are surveyed measurements.

The default camera is tilted and perspective-oriented. Map labels, road widths, and building detail must adapt to zoom to prevent clutter.

## 5A. Road geometry and styling

Road rendering should use source geometry and attributes without confusing physical measurements with cartographic styling.

- Read supported OSM width attributes (`width`, `est_width`, `width:lanes`, and directional lane-width tags) and lane information where present.
- Preserve width provenance in the domain model: mapped width, estimated width, or renderer fallback.
- Convert physical metres to screen-space widths using map zoom, latitude, projection, and camera pitch. A renderer fallback is a display approximation, not an OSM fact.
- Use layered MapLibre line styles for casing and road surface.
- Use `lane_markings`, `lanes`, `turn:lanes`, `change`, `overtaking`, and `road_marking` where supplied by the source.
- Respect `lane_markings=no`. If exact paint geometry is unavailable, derived lane guides must be marked as schematic in the internal model and visually distinct from mapped markings.
- Keep road styling zoom-aware and test divided roads, ramps, and intersections.

## 5B. Bounded map-data loading

The renderer and data layer must be viewport-driven, not a global OSM preparation job. Road tiles and camera objects are independent data pipelines.

- Fetch only vector tiles required by the current viewport and zoom, plus a bounded corridor around an active route when needed.
- Never enumerate or preprocess all OSM roads or speed cameras on startup.
- CameraDataProvider requests must be asynchronous and bounded to visible bounds plus a buffer, or to the active route corridor.
- Road rendering and map interaction must continue if camera retrieval, parsing, or indexing is slow, rate-limited, or unavailable.
- Debounce viewport/route changes, cancel obsolete requests, and ignore late responses for stale viewports.
- Parse and normalize features on background dispatchers; never perform bulk parsing or spatial indexing on the main thread.
- Cache camera features incrementally and use a spatial index such as SQLite R*Tree for local proximity queries.
- Deduplicate features across tile boundaries by stable source identity where possible.
- Use progressive rendering, bounded concurrent requests, caching, geometry simplification, and zoom-dependent layer visibility.
- Cluster or hide camera markers at small scales; reveal individual devices as the user zooms in.
- Keep queues and caches bounded and expose loading/error states without blocking map interaction.
- Instrument time to first map frame, frame pacing during gestures, CPU, memory, and network usage.


## 6. Location and speed

Location collection runs through Android platform APIs. The app should:

- Request only the permissions required for the current feature.
- Avoid unnecessary background location collection.
- Handle missing, stale, low-accuracy, and jumping fixes.
- Display GPS-derived speed with an appropriate unavailable state.
- Avoid using a single noisy fix as a reliable movement direction.
- Keep location history on-device unless a clearly disclosed feature requires a provider request.

Location speed is an estimate from the device's positioning subsystem, not a certified vehicle instrument.

## 7. Road limits and camera model

Normalize source data into internal domain objects instead of rendering raw provider tags directly.

A camera domain object should be able to represent:

- Stable source identifier.
- Physical coordinates.
- Camera category.
- Enforced limit, if known.
- Direction / bearing, if known.
- Associated road or enforcement relation.
- Affected direction, if known.
- Source and freshness metadata.
- Confidence / completeness state.

A road-limit object should be able to represent:

- Road segment reference.
- Limit and unit.
- Direction and vehicle scope, when applicable.
- Conditional rule, where supported.
- Whether the value is explicit, inferred, or unknown.
- Source and freshness metadata.

Do not infer a camera's direction or the applicable speed limit from visual proximity alone.

## 8. Local storage and caching

Room / SQLite may store:

- User preferences.
- Saved places.
- Recent searches.
- Cached provider metadata.
- Locally retained road or camera data if its license and provider terms permit it.

Map tile caching must follow the map provider's conditions. Do not use the public OpenStreetMap standard tile server for bulk prefetching or offline downloads. A compatible tile provider must explicitly permit the intended access pattern.

## 9. Network and privacy boundaries

The initial app may contact third-party map, search, route, and weather services. There is no project-operated backend in the initial architecture.

Before integrating a provider, document what the provider receives. For example, destination search may transmit the query; routing may transmit origin and destination; map tile requests reveal requested geographic areas.

Avoid:
- Hidden analytics.
- Unnecessary location transmission.
- Hard-coded secrets.
- Logging full coordinates or destination queries by default.
- Uploading crash reports containing sensitive data without clear disclosure.

## 10. Offline and peer-to-peer future work

Offline map support requires separate coverage for:

1. Display tiles and styles.
2. Routing graph and turn instructions.
3. Search index.
4. Camera and road-sign data.
5. Weather, which may be unavailable or stale offline.

A P2P distribution layer may later distribute immutable, versioned packages. It does not replace the need for trusted package metadata, integrity verification, version selection, and a source of authoritative updates. Neither offline downloads nor P2P is a prerequisite for the first map prototype.

## 11. External references

- [MapLibre Native](https://github.com/maplibre/maplibre-native)
- [MapLibre Android documentation](https://maplibre.org/)
- [Jetpack Compose](https://developer.android.com/develop/ui/compose)
- [Android offline-first guidance](https://developer.android.com/topic/architecture/data-layer/offline-first)
- [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)
