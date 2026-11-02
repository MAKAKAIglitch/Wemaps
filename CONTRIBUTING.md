# Contributing to Wemaps

Contributions are welcome: code, bug reports, testing, documentation, translations, accessibility improvements, and cartographic design feedback.

## Before opening a change

- Check existing issues and pull requests for related work.
- For large changes, open an issue first to discuss scope and architecture.
- Keep changes focused and explain why they are needed.
- Avoid introducing a new provider or large dependency without documenting its license, terms, privacy impact, and maintenance status.

## Development principles

- Kotlin and Jetpack Compose are the planned Android foundation.
- Keep map rendering behind the map layer; do not couple provider responses directly to UI components.
- Keep map, search, routing, and weather providers independently replaceable.
- Preserve Violet Night design tokens and test visual contrast.
- Prefer explicit unknown states over fabricated map values.
- Do not guess speed-camera direction, road limits, building heights, or data freshness.
- Keep location processing on-device where practical.
- Do not add project-operated server requirements without prior architectural discussion.

## Data, privacy, and security

Never commit:

- API keys, passwords, access tokens, or private certificates.
- Precise personal or home coordinates.
- Personal contact details.
- Private user data or raw navigation histories.
- Logs or screenshots containing sensitive information.

Use synthetic coordinates and fictional examples in tests and documentation. Do not use real personal addresses as fixtures.

## Testing

Include tests for changed behavior where practical. For map and navigation features, consider:

- Opposite directions on the same road.
- Divided roads and parallel carriageways.
- Nearby ramps and frontage roads.
- Missing or contradictory OSM tags.
- Unknown camera direction.
- GPS jumps and stale location fixes.
- Missing speed limits and conditional restrictions.
- Dense 3D buildings and low-memory devices.

Do not claim full regional coverage based on a small sample.

## Pull requests

A useful pull request includes:

1. A clear summary of the change.
2. The reason for the change.
3. Screenshots or a short recording for UI changes, using synthetic or non-sensitive locations.
4. Tests performed and known limitations.
5. Any new third-party licenses or attribution requirements.

Mark incomplete work as a draft. Keep the change set focused and avoid unrelated formatting or generated files.

## Licensing and attribution

By contributing, you agree that your contribution is submitted under the repository's GNU GPL version 3.0 license, unless a file explicitly states otherwise and the maintainers have approved that arrangement.

Do not remove existing copyright or license notices. Clearly mark modified versions and preserve required notices from upstream dependencies.

Forks are welcome. A fork should clearly identify its own changes and must not misrepresent itself as an official Wemaps release. A visible credit such as "Based on Wemaps" with a link to the upstream project is appreciated.

The repository currently uses the standard GPL-3.0 text. The attribution request above is project guidance and should not be mistaken for a separately drafted legal addendum to the license.
