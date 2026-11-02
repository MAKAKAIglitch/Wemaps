# Road rendering and camera-data performance

This document defines how Wemaps should render roads and speed cameras without allowing data preparation to stall the map.

## 1. Core rule: cameras never block the map

Road rendering and speed-camera preparation must be independent.

The first map frame, vector road tiles, map panning, zooming, rotation, and camera-follow animation must remain responsive while camera data is being fetched or prepared. If camera data is slow, malformed, unavailable, or rate-limited, only the camera overlay may be delayed or unavailable. The road map must continue working.

Never download or prepare all cameras or all roads in a country during startup.

## 2. Bounded camera loading

Use a replaceable camera data interface, separate from the map tile provider.

Request camera data only for:
- the visible viewport plus a modest geographic buffer; or
- a bounded forward corridor along the active route.

Implementation rules:

1. Display the map and road tiles first.
2. Start camera retrieval asynchronously.
3. Debounce rapid viewport and route changes.
4. Cancel requests that are no longer relevant.
5. Ignore late responses belonging to an obsolete viewport or route.
6. Deduplicate repeated OSM objects by stable element identity.
7. Parse and normalise results off the Android main thread.
8. Insert, update, and remove cached objects incrementally.
9. Publish only visible camera objects to the render layer.

Do not rebuild the full camera layer after every small pan. Use bounded request concurrency and bounded work queues.

## 3. Local camera cache and spatial lookup

Use Room/SQLite for cached camera metadata when provider terms permit local retention. Add a spatial index such as SQLite R*Tree for nearby-object queries.

A cached record should retain:
- OSM element type and ID;
- original coordinates;
- camera category;
- original direction tag and parsed bearing, if valid;
- associated speed limit, if available;
- linked enforcement relation information, if available;
- source/provider identifier;
- retrieval time and freshness state.

Do not scan the entire camera table on every location update or map frame. Query the spatial index for the current viewport or route corridor. Update the cache incrementally rather than replacing it wholesale.

At distant zoom levels, cluster or hide individual markers. At close zoom levels, show separate cameras and their direction indicators.

## 4. Camera direction and angle semantics

OSM uses different tagging patterns for different camera objects.

### Fixed speed cameras

For `highway=speed_camera`, use `direction=*` when present. The value describes the direction the speed camera faces and may be a bearing or a cardinal direction. The object may also include `maxspeed=*`.

### Surveillance cameras

For `man_made=surveillance` objects, use `camera:direction=*` where present. It describes orientation and can use compass directions or clockwise bearings from north. Some values may describe a range of directions for a movable camera.

### Important distinction: `camera:angle`

In the OSM surveillance tagging scheme, `camera:angle=*` describes the camera's **vertical tilt relative to the horizon**. It does not describe the horizontal field-of-view width.

Therefore:
- a known direction can be shown with an arrow;
- a known vertical tilt may be retained as metadata;
- do not infer a horizontal field-of-view cone from `direction` or `camera:angle`;
- draw a horizontal viewing sector only if a separate source explicitly supplies a documented horizontal field-of-view value.

Where an OSM `type=enforcement` relation exists, inspect its device and road members (including `from` and optional `to`) to determine the enforced road segment and direction. Do not infer the affected direction from distance to a road alone.

If direction is missing or malformed, display an undirected camera icon and do not issue a direction-specific warning.

## 5. Physical road width

Use source geometry and OSM dimensions wherever available.

Relevant attributes:
- `width=*`: mapped physical width, normally in metres unless a unit is supplied;
- `est_width=*`: estimated width, not a measured width;
- `width:lanes=*`: individual lane widths where mapped;
- `lanes=*`, `lanes:forward=*`, `lanes:backward=*`: lane counts and direction split;
- `maxwidth=*`: a legal maximum vehicle-width restriction, **not** the physical width of the road.

Validate numeric values and units. Preserve raw tags for diagnostics. If a width value cannot be parsed, do not silently treat it as metres.

### Screen-space conversion

MapLibre line width is specified in screen pixels, while OSM road width is normally in metres. Convert between them using the current zoom, latitude, projection, and camera transform. The road should maintain a physically meaningful scale as the map zoom changes.

Do not use a fixed decorative width based only on `highway=*` when an actual mapped width is available.

When physical width is missing:
- use `est_width=*` if the source supplies it;
- otherwise use lane information as a documented estimate where reasonable;
- if no useful dimensions exist, use a restrained style fallback based on road class and zoom.

Keep three provenance states separate in the internal model: mapped width, estimated width, and renderer fallback. Never call the latter two an exact OSM measurement.

## 6. Lane geometry and markings inspired by Yandex Navigator

The intended interaction pattern is detailed road lanes at close zoom and route-aware lane highlighting. Yandex Navigator documents a mode where lanes matching the route are shown in white, other lanes in grey, and each lane has an arrow indicating its direction. See [Yandex Navigator: Moving along a route](https://yandex.ru/support/navigator/ru/route-movement) and [Yandex Navigator: detailed road layouts](https://mobi.yandex.com/support/navigator/en/route-movement).

Wemaps should implement its own rendering and data model; this is a design reference, not a request to copy Yandex assets or proprietary code.

### Lane geometry inputs

Use available OSM attributes:
- `lanes=*`, `lanes:forward=*`, `lanes:backward=*`;
- `width=*`, `est_width=*`, `width:lanes=*`;
- `oneway=*`;
- `turn:lanes=*`;
- `change=*`, `overtaking=*`;
- `lane_markings=*`;
- `bus:lanes=*`, `psv:lanes=*`, cycle-lane and tram-lane attributes where present;
- separate `road_marking=*` geometries when available.

### Rendering behaviour

- At close zoom levels, show individual lane surfaces or separators where the source data is sufficient.
- Draw a direction arrow per lane when valid `turn:lanes=*` data exists.
- Respect the direction of one-way roads and separate carriageways.
- When a route is active, show route-compatible lanes in bright white and non-matching lanes in muted grey. Do not hide the underlying carriageway shape.
- Show bus, tram, and cycle lanes with distinct restrained symbols or markings only when the relevant tags are present.
- Keep detailed lane markings hidden or simplified at small zoom levels; reveal them progressively as the user zooms in.
- At complex junctions, lane arrows and lane geometry must follow the correct road direction, not merely the nearest line on screen.
- Never render standard painted separators when `lane_markings=no` is mapped.
- Where only lane count is known, generated lane divisions are schematic. Keep that provenance separate from mapped road-marking geometry.

### Generated geometry limitations

A basic OSM road is commonly represented by a centreline, not by a polygon for every lane. If the provider supplies no lane polygons or marking geometries, Wemaps may derive lane offsets from the centreline, road width, lane count, and direction. This requires curve-aware offsetting, joins, splits, and intersection handling. It is an approximation and must not be described as exact surveyed lane geometry.

The selected vector tile provider must retain the relevant OSM properties. A style cannot use source tags that the provider strips from its tiles. Verify property coverage before choosing the provider for detailed-road rendering.

## 7. Editable map palettes

Map colors must be centralized in one configuration layer. Individual style layers must reference semantic tokens rather than hard-coded color literals.

Stage 1 uses a Waze-inspired dark palette. The values are defined in `docs/PRODUCT_SPEC.md`. They are visual starting values, not official Waze constants.

The style system must support:
- named presets;
- a Waze-inspired dark default;
- a separately retained Violet Night preset;
- custom color overrides;
- persistence of the selected preset and overrides in local app settings.

A future in-app style editor should allow changing background, land, water, road classes, buildings, route, lanes, labels, and POI colors without changing map data or rendering algorithms.

## 8. Required performance tests

Test on low-, mid-, and high-tier Android devices:

- first launch with an empty camera cache;
- first map frame while camera data is still loading;
- fast panning across several camera query areas;
- zooming and rotating while responses arrive;
- route changes while a camera query is pending;
- dense urban intersections and camera clusters;
- long rural routes;
- missing, stale, malformed, or directionless camera objects;
- no network and provider rate-limit responses;
- roads with mapped `width`, only `est_width`, only `lanes`, and no width information;
- roads with `lane_markings=yes`, `lane_markings=no`, and no lane-marking tag;
- roads with `turn:lanes` and roads without lane-turn data;
- generated lane geometry through curves, merges, ramps, and intersections.

Measure:
- time to first map frame;
- frame pacing while panning and zooming;
- main-thread stalls;
- camera network and parsing duration;
- cache and spatial-index update duration;
- memory, CPU, battery, and network usage.

A camera-provider failure must never make roads disappear or freeze the map.

## 9. OSM references

- [Fixed speed camera: `highway=speed_camera`](https://wiki.openstreetmap.org/wiki/Tag:highway%3Dspeed_camera)
- [Road width: `width`](https://wiki.openstreetmap.org/wiki/Key:width)
- [Lane information](https://wiki.openstreetmap.org/wiki/Lanes)
- [Lane markings](https://wiki.openstreetmap.org/wiki/Key:lane_markings)
- [Separate road markings](https://wiki.openstreetmap.org/wiki/Key:road_marking)
- [Surveillance cameras](https://wiki.openstreetmap.org/wiki/Surveillance)
- [Camera direction](https://wiki.openstreetmap.org/wiki/Key:camera%3Adirection)
- [Camera tilt angle](https://wiki.openstreetmap.org/wiki/Key:camera%3Aangle)
- [Enforcement relations](https://wiki.openstreetmap.org/wiki/Relation:enforcement)
- [MapLibre style specification](https://maplibre.org/maplibre-style-spec/layers/)
