# Wemaps — Product and Interface Specification

## 1. Product principles

1. **Map first.** The app opens directly into the map. There is no separate dashboard as the primary destination.
2. **3D by default.** The map uses a perspective camera as its normal presentation mode. 3D buildings are rendered wherever the data supports them.
3. **Navigation clarity.** Speed, speed limits, manoeuvres, and camera warnings must be understandable at a glance.
4. **Calm visual hierarchy.** The map remains dominant. Controls and cards must not occupy more space than necessary.
5. **Honest map data.** The UI distinguishes mapped facts, derived values, unavailable data, and uncertain information.
6. **No project backend at the beginning.** Initial features should use on-device capabilities and compatible third-party providers.

## 2. Design system

### Name

**Violet Night**

### Color tokens

| Token | Hex | Intended use |
| --- | --- | --- |
| map.background | #100D18 | Deep map background |
| map.urban | #191424 | Built-up land |
| road.minor | #655B7A | Minor roads |
| road.local | #80709F | Local streets |
| road.secondary | #A18BC9 | Secondary roads |
| road.primary | #B99CEB | Primary roads |
| road.major | #D1B7FF | Major roads |
| building.side | #29213B | Building side faces |
| building.roof | #3A2E50 | Building roofs |
| route.outline | #7139BA | Route casing |
| route.main | #D18AFF | Route line |
| route.highlight | #F4DEFF | Route highlight |
| text.primary | #F0EAF8 | Primary text |
| text.secondary | #B9A8D7 | Secondary text |

The palette is a starting token set, not a final accessibility certification. Contrast and legibility must be tested on real devices and in bright daylight.

### UI framework

Use Jetpack Compose and Material 3 as the component foundation. Build custom Wemaps components for map controls, speed panels, signs, camera markers, bottom dock, and navigation guidance. Material 3 should provide consistency; it should not force the navigation screen to look like a generic settings app.

## 3. Main map screen

### Initial state

- Open directly to the map after startup.
- Request location permission only when the feature needs it and explain the purpose.
- If location permission is unavailable, show the map normally and provide a clear location action.
- Use the default tilted 3D camera.
- Show a compact bottom dock rather than a full-screen home menu.

### Bottom dock

The bottom dock should provide quick access to:

- Destination search.
- Saved places.
- Map layers.
- Weather.
- Navigation and route planning.

The dock should be collapsible so the map can use nearly the whole display. The exact arrangement and animation are subject to usability testing.

### Map controls

Provide discoverable controls for:

- Return to current location.
- Zoom in and out.
- Compass / north alignment.
- Map layers.
- 3D camera and map presentation settings.

The normal presentation remains perspective 3D. A user-accessible fallback may be considered for accessibility, compatibility, or troubleshooting, but it must not change the default product identity.

## 4. 3D cartography

Use MapLibre Native Android for GPU-accelerated vector map rendering.

### Buildings

- Render building footprints as extruded 3D volumes.
- Use explicit height attributes where available, such as building height and levels.
- Do not claim an estimated height is surveyed or authoritative.
- If a fallback height is used for visual continuity, keep it clearly treated as an estimate in the rendering pipeline.
- Reduce detail when zoomed out to avoid visual clutter.
- Avoid making buildings obscure road geometry, route guidance, or important labels.

### Camera

- Use a tilted perspective camera as the default.
- Smoothly follow the device during active navigation.
- Rotate the camera to match travel direction when follow mode is active.
- Avoid abrupt camera jumps.
- Provide a clear recenter action after manual map movement.

### Road hierarchy

Road class must be communicated through a combination of line width, contrast, casing, and color. The route should be visually dominant without hiding intersections or road geometry.

## 4A. Road appearance, width, and lane markings

Roads are a primary visual feature of Violet Night and must remain immediately legible on the dark map.

- Use a layered road style (casing plus surface) with clear contrast between road classes.
- Prefer actual OSM physical-width attributes when present: `width=*`, supported lane-width tags such as `width:lanes=*`, and directional width tags.
- Keep `width=*` (mapped physical width), `est_width=*` (explicit estimate), and renderer fallback width as separate provenance states. Never label an estimate or style fallback as an actual OSM measurement.
- Convert physical metres to screen-space width using the current zoom, latitude, map projection, and camera pitch. Road thickness must not be an arbitrary decorative value when a physical width is available.
- Use `lanes=*`, `lanes:forward=*`, and `lanes:backward=*` as lane-count information, not as measured road width.
- Lane markings must be high-contrast and clearly visible against the dark-violet road surface. Use `lane_markings=*`, `turn:lanes=*`, `change=*`, `overtaking=*`, `road_marking=*`, and `crossing:markings=*` where supplied.
- Respect `lane_markings=no`: do not draw ordinary painted separators where OSM explicitly records that markings are absent.
- If only lane counts are available, any generated lane guides must be visibly schematic and must not be presented as individually mapped paint.
- Preserve ramps, service roads, divided carriageways, and complex intersections as separate geometry.
- Adjust rendering detail by zoom without making roads disappear or merge into one another.

The selected vector-tile provider must be tested to confirm that it actually exposes the OSM width and lane properties required by the renderer. A style cannot use tags that the provider has omitted from its tiles. If a provider strips these properties, Wemaps must select a compatible source or a permitted supplemental data source; it must not claim to render actual OSM widths from unavailable attributes.

## 4B. Incremental loading and responsiveness

Road vector-tile loading and speed-camera preparation are independent pipelines. Camera preparation must never delay the first map frame, road rendering, GPS marker updates, or map gestures.

- Load road data incrementally through visible vector tiles and a bounded viewport/route context.
- Do not request or preprocess all cameras or all roads at application startup.
- Fetch camera objects only for visible bounds plus a limited buffer, or for a bounded corridor ahead of the active route.
- Debounce viewport and route changes, cancel obsolete requests, and ignore late responses for stale viewports.
- Render available road data progressively; camera results may appear later without holding the map.
- Perform network access, parsing, filtering, normalisation, and spatial indexing away from the Android main thread.
- Cache camera objects incrementally and use a spatial index (for example SQLite R*Tree) for nearby-camera lookup instead of scanning the full camera cache on each update.
- Deduplicate features across adjacent tiles using stable source identity where available.
- Use bounded queues, bounded request concurrency, caching, geometry simplification, zoom-dependent layers, and camera clustering at low zoom levels.
- Measure first-frame time, frame pacing during pan/zoom, startup time, memory, CPU, and network use on representative devices.
## 5. Navigation screen

The navigation layout is a dedicated arrangement over the same map.

### Top guidance card

Show:

- Next manoeuvre icon.
- Manoeuvre text.
- Distance to the manoeuvre.
- Lane guidance later, if reliable lane data is available.

### Driving information

Show:

- Current speed, preferably derived from Android location speed with accuracy/quality checks.
- Current applicable speed limit when known.
- A clear unknown state when the limit is unavailable or ambiguous.
- Route remaining distance.
- Estimated arrival time.

Do not treat GPS speed as a certified vehicle speedometer. Do not show a stale speed limit as current after the device has moved to another road segment.

### Speed-limit data

Potential sources include:

- maxspeed on the matched road segment.
- traffic_sign=maxspeed nodes with their maxspeed value.
- conditional restrictions, where their conditions can be evaluated correctly.
- vehicle-specific limits, where the selected vehicle profile supports them.
- country- and road-class defaults only when the source and confidence are explicit.

The UI should distinguish explicit mapped limits from inferred or unknown values. Conditional restrictions must be interpreted using local time, direction, and relevant vehicle profile when those inputs are available.

## 6. Speed cameras and enforcement devices

Camera handling must be direction-aware.

### Camera categories

At minimum, distinguish:

- Fixed speed camera.
- Average-speed enforcement section.
- Red-light or combined enforcement camera, if mapped.
- Ordinary traffic surveillance camera.
- Speed display / driver feedback sign.
- Dummy or non-enforcing camera, when explicitly mapped.

### Position

A camera may be mounted beside a road, above it, or represented by a node associated with a road. Preserve the source geometry and coordinates. Do not move every marker onto the road centerline just to simplify rendering.

### Direction and field of view

For `highway=speed_camera`, read `direction=*` when present. For `man_made=surveillance` objects, read `camera:direction=*` where present. Direction values can be bearings or cardinal directions depending on the tagging scheme. Normalise supported values to a bearing while retaining the raw source value.

In the surveillance tagging scheme, `camera:angle=*` describes vertical tilt relative to the horizon. It is **not** the horizontal field-of-view width. A direction bearing alone does not define a camera's viewing cone.

Show a directional arrow when a valid bearing is available. Draw a horizontal viewing sector only when a separate, explicitly defined horizontal field-of-view value is available and its semantics are known. If direction is missing or malformed, show an undirected marker.

Where an enforcement relation exists, inspect its device, from, and optional to members. The relation may describe which road segment and direction are enforced. Do not infer the affected direction from distance to a road alone.
### Alerts

- Evaluate whether the user's route direction matches the camera's enforced direction.
- Prefer route-aware alerts over simple radius-only alerts.
- Avoid duplicate warnings for the same device.
- Make the alert distance configurable.
- Display the type and known limit where mapped.
- Avoid presenting incomplete or stale data as verified.
- Respect applicable regional laws and provider terms.

### OSM data references

- [highway=speed_camera](https://wiki.openstreetmap.org/wiki/Tag:highway%3Dspeed_camera)
- [Surveillance](https://wiki.openstreetmap.org/wiki/Surveillance)
- [Enforcement relations](https://wiki.openstreetmap.org/wiki/Relation:enforcement)
- [Speed limits](https://wiki.openstreetmap.org/wiki/Speed_limit)

## 7. Weather

Weather should be useful but visually secondary to navigation.

Planned information:

- Current temperature and condition.
- Rain / snow and precipitation intensity.
- Wind information.
- Optional map overlay.
- Later: weather along a route and at estimated arrival time.

The weather provider is not selected yet. Do not hardwire a provider into UI code.

## 8. Search and route planning

Planned search categories:

- Address and street.
- Named place and point of interest.
- Saved place.
- Recent destination.

Search provider and routing provider will be selected separately. The app must expose internal interfaces so providers can be changed without redesigning the UI.

## 9. Offline direction

Offline support is a later milestone, not a promise of the first online prototype.

Future offline work must consider map tiles, routing graphs, and search indexes separately. Downloading a visual map does not automatically provide offline search or offline routing. Download behavior must follow the selected provider's license and terms.

## 10. Non-goals for the first prototype

- Building a proprietary map-rendering engine.
- Operating a project-owned tile-processing backend.
- Requiring user accounts.
- Requiring a project-owned cloud backend.
- Launching a P2P network before ordinary map delivery is reliable.
- Claiming complete global speed-camera or speed-limit coverage.
