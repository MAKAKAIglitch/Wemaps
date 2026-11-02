# Wemaps — Roadmap

This roadmap describes intended development order. It contains no delivery dates and does not imply that a feature is already implemented.

## Stage 0 — Project foundation

- [x] Define the product direction.
- [x] Define the Violet Night visual identity.
- [x] Select the initial Android technology direction.
- [x] Document the no-project-server approach for the first milestones.
- [ ] Create the Android project and Gradle structure.
- [ ] Add license headers / license information for source files where appropriate.
- [ ] Add a basic build and CI check.

## Stage 1 — First visible map

- [ ] Create the Kotlin Android application shell.
- [ ] Integrate MapLibre Native Android.
- [ ] Load a compatible third-party vector-map style.
- [ ] Add required map attribution.
- [ ] Implement the first editable Waze-inspired dark map palette using centralized style tokens.
- [ ] Keep Violet Night as a separate selectable style preset; do not hard-code colors into individual layers.
- [ ] Define a style configuration format that supports named presets and custom color overrides.
- [ ] Load the initial presets from `design/map-style-presets.json` and validate unknown/missing tokens safely.
- [ ] Open directly into the map.
- [ ] Implement the compact bottom dock.
- [ ] Add basic zoom, rotation, recenter, and compass controls.
- [ ] Prototype detailed road lanes at close zoom levels using lane counts, directional lane counts, and turn-lane attributes where available.
- [ ] Render lane separators and per-lane direction arrows without claiming generated geometry is surveyed road paint.
- [ ] Verify that the selected vector-tile source exposes the required road and lane attributes.

**Milestone:** a working online map screen with editable colors and an initial detailed-lane rendering prototype, without a project-operated server.

## Stage 2 — 3D map quality

- [ ] Enable a tilted perspective camera by default.
- [ ] Add building extrusion using available building attributes.
- [ ] Define zoom-dependent building and label detail.
- [ ] Tune road hierarchy and route color tokens.
- [ ] Profile GPU, memory, battery, and frame pacing on real Android devices.
- [ ] Verify readability in dense city centers and at highway interchanges.

**Milestone:** a polished 3D map prototype with switchable style presets.

## Stage 2A — Road cartography and loading performance

- [ ] Define palette-driven road casing, surface, lane-marking, and active-route lane styles.
- [ ] Verify that the selected vector-tile provider exposes OSM physical-width and lane attributes; reject sources that strip required properties if accurate width rendering is a release requirement.
- [ ] Use OSM physical-width and lane attributes where available.
- [ ] Separate mapped width from estimated and renderer-fallback widths.
- [ ] Add zoom-dependent road widths and geometry detail.
- [ ] Highlight route-compatible lanes in bright white and other lanes in muted grey when route guidance is available, following the general Yandex Navigator lane-guidance pattern.
- [ ] Ensure lane separators remain legible without pretending unmapped markings are source data.
- [ ] Implement viewport-bounded, incremental vector-tile loading.
- [ ] Cancel obsolete requests and deduplicate features across tile boundaries.
- [ ] Move parsing and spatial indexing off the UI thread.
- [ ] Add performance tests for startup, camera movement, dense road networks, and camera overlays.

**Milestone:** visually strong roads with visible lane structure and responsive map loading.

## Stage 3 — Device location

- [ ] Add runtime location permission flow.
- [ ] Show current position and accuracy state.
- [ ] Implement follow mode and smooth camera tracking.
- [ ] Show GPS-derived speed with quality checks.
- [ ] Handle stale or unavailable location updates.

**Milestone:** the map can follow the device and display a defensible speed estimate.

## Stage 4 — Search and route planning

- [ ] Compare external search providers and their terms.
- [ ] Compare external routing providers and their terms.
- [ ] Implement provider interfaces and adapters.
- [ ] Add address and place search UI.
- [ ] Add route preview and alternatives.
- [ ] Add manoeuvre instructions and route progress.

**Milestone:** external search and route planning without a Wemaps backend.

## Stage 5 — Limits, signs, and cameras

- [ ] Normalize OSM maxspeed information.
- [ ] Read mapped traffic-sign nodes where available.
- [ ] Support conditional limits only when their conditions can be evaluated correctly.
- [ ] Add a separate, replaceable CameraDataProvider independent from road-tile loading.
- [ ] Fetch camera data only for the visible viewport/buffer or a bounded route corridor.
- [ ] Debounce and cancel obsolete camera requests; ignore stale responses.
- [ ] Cache camera data incrementally and query it through a spatial index.
- [ ] Verify that a slow or failed camera provider never blocks the first map frame or road rendering.
- [ ] Import fixed speed-camera objects.
- [ ] Preserve roadside camera coordinates.
- [ ] Read `direction=*` on `highway=speed_camera` and `camera:direction=*` on surveillance objects where mapped.
- [ ] Treat `camera:angle=*` as vertical tilt, not horizontal field of view.
- [ ] Interpret enforcement relations and affected road direction.
- [ ] Add route-direction-aware warnings.
- [ ] Distinguish unknown direction and incomplete data.
- [ ] Add tests for opposite-direction roads, divided roads, ramps, and nearby parallel roads.

**Milestone:** camera and speed-limit presentation that does not invent missing facts.

## Stage 6 — Weather

- [ ] Select a weather provider after reviewing licensing, privacy, and API limits.
- [ ] Add current conditions.
- [ ] Add precipitation and wind information.
- [ ] Add an optional map overlay.
- [ ] Explore route weather and arrival-time forecasts.

**Milestone:** weather integrated without obscuring navigation.

## Stage 7 — Offline capabilities

- [ ] Select a provider or package format that permits the intended offline use.
- [ ] Design user-selected regions and route corridors.
- [ ] Add resumable downloads and integrity checks.
- [ ] Add storage and update scheduling controls.
- [ ] Keep display tiles, routing graphs, search indexes, and camera data as separately managed datasets.
- [ ] Make offline coverage and data dates visible.

**Milestone:** user-managed offline areas, subject to provider and dataset licenses.

## Stage 8 — Distributed map packages

- [ ] Define signed manifests and immutable package versions.
- [ ] Define integrity verification and rollback behavior.
- [ ] Evaluate peer-to-peer distribution for packages users already have.
- [ ] Keep trusted version metadata separate from untrusted peer delivery.
- [ ] Provide opt-in upload controls and resource limits.

**Milestone:** optional P2P package delivery, only after ordinary downloads and updates are reliable.

## Ongoing quality requirements

- No personal information or secrets in source code, documentation, examples, or test fixtures.
- No claims of complete map, limit, or camera coverage without measurements.
- Preserve upstream attribution and all third-party license notices.
- Test on real devices with different screen sizes, Android versions, GPS quality, and GPU capabilities.
- Treat battery use, heat, accessibility, and distraction-free driving UI as product requirements.
