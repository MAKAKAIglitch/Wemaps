# Wemaps

**A 3D-first, open-source Android navigation app with a distinctive Violet Night map style.**

Wemaps is an early-stage project focused on making everyday navigation clear, expressive, and useful. The map is the app: opening Wemaps should take the user directly to a live map, not to a separate dashboard.

> **Project status:** concept and technical foundation. The repository currently contains project documentation and the GPL-3.0 license. A working Android application has not been released yet.

## Vision

Build an Android navigator that combines:

- A detailed, continuously perspective-oriented 3D map.
- Extruded buildings wherever usable building data is available.
- A distinctive dark-purple cartographic style.
- Clear route guidance, current speed, and mapped speed limits.
- Speed-camera alerts that respect the camera's actual position and viewing direction.
- Useful weather information without overwhelming the map.
- An architecture that can start without project-operated servers.

The initial product is an online-first Android client. It will use compatible third-party data services through replaceable provider interfaces. The project does not require its own tile-processing or application backend for the first development stages.

## Visual identity: Violet Night

Violet Night is the visual design system for the map and navigation experience.

| Map element | Initial color |
| --- | --- |
| Deep map background | `#100D18` |
| Built-up areas | `#191424` |
| Minor roads | `#655B7A` |
| Local streets | `#80709F` |
| Secondary roads | `#A18BC9` |
| Primary roads | `#B99CEB` |
| Major roads | `#D1B7FF` |
| Building sides | `#29213B` |
| Building roofs | `#3A2E50` |
| Route outline | `#7139BA` |
| Route line | `#D18AFF` |
| Route highlight | `#F4DEFF` |

The palette is a starting specification. It may be refined after real-device readability, contrast, and performance testing. Road hierarchy must remain understandable without relying on color alone.

## Main experience

### Map screen

- Opens directly into the map.
- Uses a 3D perspective camera by default.
- Keeps the map as the dominant part of the screen.
- Uses a compact bottom dock for destination search and quick actions.
- Keeps secondary controls unobtrusive and reachable.
- Shows 3D buildings when the map data and zoom level make them useful.
- Supports map rotation, tilt, zoom, and returning to the current location.

### Navigation screen

- Shows the next manoeuvre and distance to it.
- Displays current GPS-derived speed and the known speed limit for the current road.
- Shows route progress, estimated arrival time, and remaining distance.
- Keeps the 3D map visible behind the guidance UI.
- Can display mapped road signs and speed cameras near the route.
- Uses clear audio and visual alerts where supported and appropriate.

### Speed limits and road signs

The app should use mapped road attributes and sign objects instead of guessing. It should distinguish a known, explicitly mapped limit from a value inferred from road defaults or incomplete data. Conditional and vehicle-specific restrictions must not be presented as universal limits.

### Road rendering, lane markings, and performance

Roads must be visually distinct in the Violet Night palette while preserving a readable hierarchy. Road casing, fill, and lane markings should remain clearly visible against the dark background, including at night and in dense junctions.

- Prefer mapped physical width attributes such as `width`, `est_width`, and lane-width information when present and meaningful.
- Use mapped lane counts and lane-specific tags where available. Do not present a guessed width as an exact OSM measurement.
- When OSM has no physical width, use a documented cartographic fallback based on road class and zoom. Keep this fallback distinct from measured width in the internal data model.
- Render mapped lane markings with strong contrast. Use `lane_markings`, `lanes`, `turn:lanes`, `change`, `overtaking`, and separate `road_marking` geometries where the selected data source exposes them.
- Respect `lane_markings=no`: do not draw painted lane separators where OSM explicitly records that markings are absent.
- If only lane counts are known, generated lane guides must be clearly schematic and must not be presented as individually mapped paint.
- Convert mapped metric widths to screen widths using zoom, latitude, projection, and camera pitch. Preserve the distinction between mapped `width`, estimated `est_width`, and renderer-only fallback width.
- Preserve divided carriageways, ramps, and intersections rather than merging them into one decorative stroke.

Loading must remain incremental and bounded. Road vector-tile loading and speed-camera preparation are independent pipelines: camera preparation must never delay the first map frame, road rendering, or map gestures. Do not prepare every camera or road in a country at startup. Request camera data only for the visible viewport plus a bounded buffer, or a limited corridor ahead of the active route. Debounce viewport changes, cancel obsolete requests, deduplicate results across tile boundaries, and progressively display available data. Parse, filter, and index data off the Android main thread. Cache camera objects incrementally and use a spatial index (for example SQLite R*Tree) instead of scanning the entire cache for every map update. Use zoom-dependent detail, geometry simplification, bounded queues, caching, and clustering where appropriate. Profile first-frame time, frame pacing, memory, and network activity on real devices.

### Speed cameras

Camera support is a core navigation feature, not just a generic point-of-interest layer.

Wemaps should:

- Display fixed speed cameras located on the carriageway, overhead, or beside the road.
- Preserve the mapped physical camera coordinates instead of moving every marker onto the road centreline.
- Read the mapped direction or azimuth when available.
- Represent the camera's viewing direction visually, for example with a directional marker or field-of-view indicator.
- Use enforcement relations and their road-direction members when available to determine which traffic direction is affected.
- Avoid directional alerts when the source data does not provide enough information.
- Distinguish speed cameras from ordinary surveillance cameras, speed-display signs, and dummy cameras.
- Respect applicable local laws and data-provider terms.

Relevant OpenStreetMap tagging includes `highway=speed_camera` with `direction=*`, `maxspeed=*`, and `type=enforcement` relations. For surveillance objects, use `man_made=surveillance`, `surveillance:type=*`, and `camera:direction=*` where present. In this scheme, `camera:angle=*` describes vertical tilt relative to the horizon; it is not the horizontal field-of-view width. Do not invent a viewing cone from a bearing alone. See [speed-camera tagging](https://wiki.openstreetmap.org/wiki/Tag:highway%3Dspeed_camera), [camera direction](https://wiki.openstreetmap.org/wiki/Key:camera%3Adirection), [camera angle](https://wiki.openstreetmap.org/wiki/Key:camera%3Aangle), [surveillance tagging](https://wiki.openstreetmap.org/wiki/Surveillance), and [enforcement relations](https://wiki.openstreetmap.org/wiki/Relation:enforcement).

### Weather

The planned weather experience includes:

- Current conditions and temperature.
- Precipitation, wind, and weather icons.
- An optional weather map layer.
- Later, weather information along a planned route and around the estimated arrival time.

Weather data will come from a replaceable third-party provider. A provider has not yet been selected.

### Search and routing

Address search, place search, and route calculation are planned. Their providers are intentionally not fixed in this initial specification. Search, routing, map tiles, and weather are separate capabilities and may use different providers.

## Planned technology

| Area | Direction |
| --- | --- |
| Platform | Android |
| Main language | Kotlin |
| UI | Jetpack Compose |
| UI component system | Material 3 with custom Violet Night components |
| Map renderer | MapLibre Native Android |
| Map data | OpenStreetMap-derived vector data through a compatible provider |
| 3D buildings | MapLibre fill-extrusion layers using available building attributes |
| Local persistence | Room / SQLite where local structured storage is needed |
| Positioning | Android location and GNSS APIs |
| Background work | Android platform scheduling APIs when needed |

These are architectural choices and targets, not claims that the components have already been implemented.

## Online-first, provider-independent design

The first version should not require a project-operated server. It will consume ready-to-use data from external providers through interfaces owned by the app.

The app should not be permanently coupled to one tile, search, routing, or weather provider. Provider configuration, attribution, caching rules, rate limits, and terms of use must be reviewed before integration.

[OpenFreeMap](https://openfreemap.org/) is one candidate for the first vector-map prototype, not a permanent dependency or an availability guarantee. Its public service is provided as-is and its current terms set limits for offline downloads. See its [terms](https://openfreemap.org/tos/) before implementing downloads or production use.

Future directions may include user-managed offline regions and peer-to-peer distribution. They are not requirements for the first release.

## Privacy principles

- No project-operated account system is planned for the initial version.
- No project-operated application backend is required for the initial version.
- Location should be processed on-device whenever practical.
- Requests to external search, routing, weather, or map providers may reveal request metadata and, depending on the feature, coordinates or searched destinations to those providers.
- Any analytics or diagnostics should be documented and opt-in where practical.
- API keys, private tokens, precise personal locations, and private logs must never be committed to the repository.

See [Architecture](docs/ARCHITECTURE.md) for the planned provider boundaries.

## Development status

The repository is currently in the specification stage. The next milestone is a minimal Android shell that opens directly into a MapLibre map with the Violet Night style and a 3D camera. Navigation, live speed limits, camera alerts, search, and weather will be added incrementally.

See:

- [Product and interface specification](docs/PRODUCT_SPEC.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Data attribution](docs/ATTRIBUTION.md)
- [Road rendering and camera performance](docs/ROAD_RENDERING.md)
- [Contributing guide](CONTRIBUTING.md)

## Licensing and data attribution

The application source code in this repository is licensed under **GNU General Public License v3.0**. See [LICENSE](LICENSE).

The application license does not replace the licenses or terms of external components and datasets. OpenStreetMap data is licensed under the Open Database License (ODbL) and requires appropriate attribution. Map tiles, styles, routing data, search results, and weather data may have additional provider-specific terms.

The map must display an appropriate attribution, including a link to the [OpenStreetMap copyright and license page](https://www.openstreetmap.org/copyright), wherever required.

## Contributions

Contributions, issue reports, design proposals, translations, and code reviews are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change.

Forks are welcome. Preserve existing license and copyright notices, clearly identify modified versions, and do not present an unofficial fork as an official Wemaps release.
