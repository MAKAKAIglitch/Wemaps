# Wemaps — Roadmap

This roadmap describes intended development order. It contains no delivery dates and does not imply that a feature is already implemented.

## Stage 0 — Project foundation

- [x] Define the product direction.
- [x] Define the Violet Night visual identity.
- [x] Select the initial Android technology direction.
- [x] Document the no-project-server approach for the first milestones.
- [x] Add a local browser-based Violet Night style lab prototype.
- [ ] Create the Android project and Gradle structure.
- [ ] Add license headers / license information for source files where appropriate.
- [ ] Add a basic build and CI check.

## Stage 1 — First visible map

- [ ] Create the Kotlin Android application shell.
- [ ] Integrate MapLibre Native Android.
- [ ] Load a compatible third-party vector-map style.
- [ ] Add required map attribution.
- [ ] Implement the Violet Night map style in the Android app, using the browser prototype as a design tool.
- [ ] Open directly into the map.
- [ ] Implement the compact bottom dock.
- [ ] Add basic zoom, rotation, recenter, and compass controls.

**Milestone:** a working map screen with no project-operated server.

## Stage 2 — 3D map quality

- [ ] Enable a tilted perspective camera by default.
- [ ] Add building extrusion using available building attributes.
- [ ] Define zoom-dependent building and label detail.
- [ ] Tune road hierarchy and route color tokens.
- [ ] Profile GPU, memory, battery, and frame pacing on real Android devices.
- [ ] Verify readability in dense city centers and at highway interchanges.

**Milestone:** a polished Violet Night 3D map prototype.

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
- [ ] Import fixed speed-camera objects.
- [ ] Preserve roadside camera coordinates.
- [ ] Read camera direction / bearing when mapped.
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
