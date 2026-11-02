# Wemaps — Attribution and Data Sources

Wemaps combines its own application code and visual design with external libraries, map datasets, and service providers. Each source keeps its own license and terms.

## 1. Wemaps application code

The source code in this repository is licensed under GNU GPL version 3.0. See the root [LICENSE](../LICENSE).

The application license does not automatically relicense third-party map data, map styles, tiles, or API responses.

## 2. OpenStreetMap data

OpenStreetMap data is distributed under the Open Database License (ODbL).

Required attribution should be readable and available in the map UI and legal / data-source screen. A suitable attribution is:

**© OpenStreetMap contributors**

Link the attribution to:

https://www.openstreetmap.org/copyright

Review the official [OpenStreetMap copyright and license page](https://www.openstreetmap.org/copyright) and the [OpenStreetMap Foundation attribution guidelines](https://osmfoundation.org/wiki/Attribution_Guidelines) before release.

## 3. Map renderer

MapLibre Native is a separate open-source dependency. Its license and required notices must be included in the app's third-party notices according to the version actually shipped.

Official project: https://github.com/maplibre/maplibre-native

## 4. Candidate vector tile provider

OpenFreeMap is a candidate for the initial prototype, not a permanent project dependency.

- Website: https://openfreemap.org/
- Quick start: https://openfreemap.org/quick_start/
- Terms: https://openfreemap.org/tos/

The provider's published terms currently describe the public service as provided as-is and set limits for offline downloads. Review the latest terms immediately before integration and again before release. Do not assume a public endpoint has an SLA or will remain available indefinitely.

When using its published styles and tiles, preserve the attribution required by the selected style and provider. The provider currently documents attribution in the form:

**OpenFreeMap © OpenMapTiles Data from OpenStreetMap**

MapLibre may display style attribution automatically, but the app must verify that it is actually visible in the final UI.

## 5. OSM road-detail overlay

The current close-zoom lane-divider prototype requests OSM way geometry and tags from the public Overpass API:

- Endpoint: https://overpass-api.de/api/interpreter
- Query area: the visible map bounding box only, at zoom 15.5 and closer.
- Queried tags include `lanes`, `lanes:forward`, `lanes:backward`, `lane_markings`, `turn:lanes` and their directional variants.
- Requests are rate-limited and performed away from the Android UI thread.
- The request sends the visible geographic bounding box to Overpass. It does not send the device's raw location as a separate profile field or store a location history.

The overlay depends on a community-operated public endpoint. It can be slow, rate-limited, or unavailable; the base map remains usable when that happens. Review the [Overpass API documentation](https://wiki.openstreetmap.org/wiki/Overpass_API) and [public instance usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) before increasing request frequency or production traffic.

Lane values and geometry remain OpenStreetMap data under ODbL and require the same attribution. The app's generated offsets are Wemaps rendering output and must not be presented as exact survey-grade painted-marking geometry.

## 6. Speed-camera and road-sign data


Relevant OpenStreetMap references:

- https://wiki.openstreetmap.org/wiki/Tag:highway%3Dspeed_camera
- https://wiki.openstreetmap.org/wiki/Surveillance
- https://wiki.openstreetmap.org/wiki/Relation:enforcement
- https://wiki.openstreetmap.org/wiki/Speed_limit

Important examples include:

- highway=speed_camera
- maxspeed
- direction
- man_made=surveillance
- surveillance:type
- camera:direction
- type=enforcement relations with device / from / to members

The presence and completeness of these tags vary by region. Missing direction must remain unknown rather than being guessed.

## 6. Provider review checklist

Before adding any external provider, document:

- Provider name and service endpoint.
- Data source and upstream attribution.
- License and terms of use.
- Commercial-use conditions.
- Request and rate limits.
- Offline download and caching permissions.
- API-key requirements and key restrictions.
- What location or search data the provider receives.
- Retention, analytics, and privacy information.
- Availability expectations and fallback behavior.

## 7. Release checklist

Before publishing a build:

- [ ] All required third-party notices are included.
- [ ] OpenStreetMap attribution is visible and links to the official copyright page.
- [ ] The selected tile provider's attribution is visible.
- [ ] Provider terms permit the app's actual request pattern.
- [ ] Offline downloads, if any, comply with provider limits.
- [ ] The app does not imply that all map data was created by Wemaps.
- [ ] No private keys, tokens, precise personal locations, or private logs are included.
