# Wemaps

**An independent, open-source Android map and navigation project built on OpenStreetMap and MapLibre Native.**

Wemaps is being developed as a map-first Android application. It opens directly into a detailed perspective map, with 3D buildings, readable road geometry, clear map styling, and a foundation for future navigation features.

> **Status:** a minimal Android map application foundation is present. The first build provides the map shell and 3D building layer; search, routing, GPS following, camera alerts, weather, and detailed lane guidance remain planned work.

## Product direction

- A full-screen map as the home screen.
- A perspective 3D camera by default.
- Extruded buildings wherever the data supports them.
- An original, editable dark map style called **Midnight Navigation**.
- **Violet Night** retained as an alternative visual preset.
- Road widths and lane information derived from mapped attributes where available.
- Clear lane geometry and route-aware lane highlighting as later map capabilities.
- Speed-camera objects with their mapped position and direction, loaded independently from road rendering.
- No Wemaps-operated server required for the first development stage.

## Initial Android foundation

| Area | Foundation |
|---|---|
| Platform | Android |
| Language | Kotlin |
| UI | Jetpack Compose + Material 3 |
| Map renderer | MapLibre Native Android (Vulkan with OpenGL ES fallback) |
| Map data | OpenStreetMap-derived vector tiles |
| Initial public map source | OpenFreeMap |
| Building rendering | MapLibre fill-extrusion layer |
| Local settings and future cache | Android local storage / Room when required |

The current prototype uses the public OpenFreeMap dark style as a replaceable source. The app adds its own 3D building layer and applies its own map palette tokens to supported style layers.

## Map design

The active preset is **Midnight Navigation**: a dark navy / blue-grey base, a distinct hierarchy of road surfaces, and a contrasting route palette. These are original Wemaps color values, not copied brand assets.

All palette tokens are stored in [design/map-style-presets.json](design/map-style-presets.json). The configuration keeps two presets:

- `midnight-navigation` — initial dark map palette.
- `violet-night` — alternative purple palette.

The style architecture is intended to support further presets and local color overrides without rewriting the rendering logic.

## Road geometry and lane display

The map should use the most accurate available OSM road information:

- `width=*` for mapped physical width;
- `est_width=*` for an estimate;
- `lanes=*`, directional lane counts, and `width:lanes=*` for lane structure;
- `turn:lanes=*` for lane-specific direction guidance;
- `lane_markings=*` and `road_marking=*` where present.

Mapped dimensions, estimates, and renderer-only fallbacks must remain separate. If detailed lane polygons or painted marking geometry are unavailable, generated lane guides must be clearly treated as schematic rather than surveyed road markings.

The selected vector-tile provider must expose the attributes required by these features. The base map must remain responsive while supplemental road or camera data is prepared.

See [Road rendering specification](docs/ROAD_RENDERING.md).

## Independent implementation

Wemaps is an independent project. Its source code, interface, visual design, icons, sounds, and other original assets are developed for this repository. It uses public OpenStreetMap data and separately licensed open-source components.

The project does not claim affiliation with, endorsement by, or compatibility certification from any third-party navigation brand. It does not include third-party proprietary source code, private APIs, logos, screenshots, sounds, or copied interface assets.

Read [the independence and project-identity policy](docs/INDEPENDENCE.md) before contributing designs or code.

## Project structure

```text
app/                         Android application
design/map-style-presets.json Editable map palette presets
docs/                        Product and technical specifications
.github/workflows/           Automated Android build
```

## Build

Requirements:

- JDK 17 or newer.
- Android SDK with API 37.1 platform and Android build tools 36.0.0.
- Internet access for the first dependency and Gradle distribution download.

On Linux or macOS:

```bash
./gradlew :app:assembleDebug
```

On Windows, double-click `build-apk.bat` or `build-windows.bat`:

```bat
build-apk.bat
```

The Windows build is split into the same helper-based pipeline used by Clear GPS: `ensure-java.ps1`, `ensure-android-sdk.ps1`, `check-environment.ps1`, `ensure-gradle.ps1`, and `gradle-runner.ps1`. It detects an installed full JDK (17–24), Android SDK, and the exact Wemaps SDK packages (Platform 37.1 and Build-Tools 36.0.0). If no compatible JDK is found, it downloads Eclipse Temurin JDK 21 and verifies the checksum published by Adoptium. It downloads the pinned Gradle 9.5.1 distribution into the user's Gradle directory and verifies the official SHA-256 checksum before use. Existing valid installations are reused. Missing Android SDK packages are installed only after confirmation; if the selected SDK rejects its install metadata, the builder retries in `%LOCALAPPDATA%\\Wemaps\\AndroidSdk`. The selected SDK path is written to the ignored `local.properties` file. Build logs are stored under `%LOCALAPPDATA%\\Wemaps\\logs`, and the APK is saved as `dist/Wemaps-debug.apk`.

Android Studio can also open the repository as a Gradle project.

The current demo camera starts in a neutral sample area until device-location support is implemented. No location permission is requested by the initial map shell.

## Documentation

- [Product and interface specification](docs/PRODUCT_SPEC.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Road rendering and camera performance](docs/ROAD_RENDERING.md)
- [Roadmap](docs/ROADMAP.md)
- [Data attribution](docs/ATTRIBUTION.md)
- [Independent implementation policy](docs/INDEPENDENCE.md)
- [Contributing guide](CONTRIBUTING.md)

## Data, attribution, and licensing

The application source in this repository is licensed under **GNU General Public License v3.0**; see [LICENSE](LICENSE).

OpenStreetMap data is available under the Open Database License (ODbL). The map must retain appropriate attribution, including **© OpenStreetMap contributors** and a link to the [OpenStreetMap copyright and licence page](https://www.openstreetmap.org/copyright).

MapLibre Native, OpenFreeMap, map styles, and other dependencies retain their own licences and terms. The selected map provider's usage, caching, attribution, and offline-download conditions must be respected. The public OpenFreeMap service is provided without an SLA guarantee; provider details are documented in [ATTRIBUTION.md](docs/ATTRIBUTION.md).

---

Wemaps is an independent community-oriented project. All third-party names and marks remain the property of their respective owners.
