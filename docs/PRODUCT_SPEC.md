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
| building.side | #342842 | Building footprint / outline |
| building.roof | #51436A | Building extrusion |
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

The map should distinguish bridge decks, tunnels, and motorway ramps/interchange branches when the provider exposes OSM-derived `brunnel` and `ramp` attributes. Use explicit OSM `width`, `width:carriageway`, or `width:effective` values to render real-world road width where mapped. Lane-count tags may position lane dividers but must not be presented as measured road width. If width tags are absent, use a clearly identified class-based visual estimate.

Use MapLibre Native Android for GPU-accelerated vector map rendering.

### Buildings

- Render building footprints as extruded 3D volumes.
- Use the vector tile's mapped building height attributes (for example, render_height and render_min_height) without an arbitrary visual height multiplier.
- In OpenMapTiles, render_height may be derived from explicit height or building levels; do not claim a derived value is surveyed or authoritative.
- Do not invent a generic building height when the source contains no usable height value.
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

### Road depth and markings

- Give road classes separate widths derived from the OSM-derived transportation class and current zoom.
- Build visual depth with a darker offset shadow, a thicker casing, and a restrained top highlight.
- Show lane divider guides at close zoom, with additional dividers on roads inferred to have three or more lanes.
- Use explicit lane tags when the tile source exposes them; otherwise estimate a schematic layout from road class.
- Treat these markings as cartographic styling, not surveyed lane geometry or a guarantee of the exact real-world lane count.
- Preserve road class hierarchy and avoid making local streets visually compete with motorways.

### Land cover and vegetation

- Give mapped beaches and sand a dark sand-gold palette.
- Keep woodland and park fills distinct.
- Show small repeated canopy symbols only at close zoom (around z15.5 and above).
- Use species-specific conifer or broadleaf symbols only when the actual source data exposes the corresponding vegetation attributes.
- A generic woodland pattern must not be presented as a verified inventory of individual trees or species.


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

Read orientation from the source when available. Useful OSM tags include direction on highway=speed_camera and camera:direction for surveillance objects. Direction values may be cardinal directions or bearings in degrees clockwise from north, depending on the tagging scheme.

Where an enforcement relation exists, inspect its device, from, and optional to members. The relation may describe which road segment and direction are enforced.

The renderer may show a camera icon with an arrow or a restrained field-of-view wedge. It must not invent an angle when no directional data exists.

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
