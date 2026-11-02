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
| Deep map background | \`#100D18\` |
| Built-up areas | \`#191424\` |
| Minor roads | \`#655B7A\` |
| Local streets | \`#80709F\` |
| Secondary roads | \`#A18BC9\` |
| Primary roads | \`#B99CEB\` |
| Major roads | \`#D1B7FF\` |
| Building sides | \`#29213B\` |
| Building roofs | \`#3A2E50\` |
| Route outline | \`#7139BA\` |
| Route line | \`#D18AFF\` |
| Route highlight | \`#F4DEFF\` |

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

Relevant OpenStreetMap tagging includes \`highway=speed_camera\`, \`maxspeed\`, \`direction\`, \`man_made=surveillance\`, \`surveillance:type\`, \`camera:direction\`, and \`type=enforcement\` relations. See [camera tagging](https://wiki.openstreetmap.org/wiki/Tag:highway%3Dspeed_camera), [surveillance tagging](https://wiki.openstreetmap.org/wiki/Surveillance), and [enforcement relations](https://wiki.openstreetmap.org/wiki/Relation:enforcement).

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

The Android application is still at the specification stage. A separate local browser prototype is available for experimenting with the Violet Night map style before the Android implementation.

### Local map style prototype

A Windows-friendly browser editor is available in [prototype/map-style-lab](prototype/map-style-lab/README.md). It runs on localhost with Python's standard library, loads vector tiles from OpenFreeMap, supports live road hierarchy and width tuning (using lane tags when a provider exposes them), layered road depth and markings, brighter 3D buildings using mapped height attributes, zoom-gated woodland symbols, dark sand-colored beaches, and exports a MapLibre Style JSON file. It does not require a Wemaps server.

See:

- [Product and interface specification](docs/PRODUCT_SPEC.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Data attribution](docs/ATTRIBUTION.md)
- [Contributing guide](CONTRIBUTING.md)

## Licensing and data attribution

The application source code in this repository is licensed under **GNU General Public License v3.0**. See [LICENSE](LICENSE).

The application license does not replace the licenses or terms of external components and datasets. OpenStreetMap data is licensed under the Open Database License (ODbL) and requires appropriate attribution. Map tiles, styles, routing data, search results, and weather data may have additional provider-specific terms.

The map must display an appropriate attribution, including a link to the [OpenStreetMap copyright and license page](https://www.openstreetmap.org/copyright), wherever required.

## Contributions

Contributions, issue reports, design proposals, translations, and code reviews are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change.

Forks are welcome. Preserve existing license and copyright notices, clearly identify modified versions, and do not present an unofficial fork as an official Wemaps release.
