# Wemaps — Violet Night Map Style Lab

A local browser-based playground for tuning the Wemaps map appearance before implementing the style in Android.

## What it does

- Loads the OpenFreeMap Liberty vector style into MapLibre GL JS.
- Applies the Violet Night palette to the actual map layers.
- Lets you adjust land, water, road hierarchy, building colors, 3D opacity, building height scale, camera pitch, and zoom.
- Updates the map as controls change.
- Saves palette and camera settings in the current browser's local storage.
- Exports the currently loaded and modified map as a MapLibre Style JSON file.
- Imports a MapLibre Style JSON file for further experimentation.

The prototype is a style editor, not the Android app and not an offline map package.

## Windows quick start

1. Install Python 3 if it is not already installed: https://www.python.org/downloads/windows/
2. Download the repository or check out the branch containing this prototype.
3. Open the prototype/map-style-lab folder.
4. Double-click run-windows.bat.
5. Your browser should open at http://127.0.0.1:8765/.

If that port is busy, the launcher automatically tries ports up to 8785. Keep the console window open while using the lab. Press Ctrl+C in that window to stop it.

No pip packages, Node.js, npm, build tools, or project server are required.

## Internet connection

The small Python server only serves the files on your own PC and binds to 127.0.0.1. It does not expose the preview to your local network.

The browser still needs an internet connection to load:

- MapLibre GL JS from the unpkg CDN.
- Vector tiles, style metadata, glyphs, and sprites from OpenFreeMap.

The initial map center is a neutral sample view in central Berlin. Drag the map to inspect other places. The local style controls work on the client and do not upload your palette to a Wemaps server.

## Editing the style

Use the color pickers to adjust the Violet Night palette. The map is restyled live. The left settings panel scrolls independently on desktop.

- Road hierarchy: each road class gets a separate color, while road casings use their own darker color.
- 3D buildings: main extrusion color, footprint outline, opacity, and visual height multiplier.
- Camera: pitch and zoom sliders, plus quick 2D/3D buttons. When the visible map width exceeds 5 km, the prototype automatically switches to a flat 2D view and hides 3D extrusions; it restores the selected 3D pitch when zoomed in.
- Presets: Violet Night, Deep Purple, and Neon Violet.
- Export: downloads wemaps-violet-night.style.json.
- Import: loads a previously exported MapLibre Style JSON.

The exported style retains its underlying vector source, glyph, sprite, and tile URLs. It is a style document, not a self-contained map download. It still needs network access and remains subject to the provider's terms and attribution requirements.

## Known limitations

- The prototype uses a third-party style/data service. Initial loading speed depends on the network, CDN, and tile provider. The map uses a lower tile-cache depth, disables label fade animation, and turns off WebGL antialiasing to reduce rendering work. Availability, coverage, update frequency, and terms are controlled by that provider.
- 3D building quality depends on the building data and height attributes available in each area.
- The extrusion color is shared by roof and walls; MapLibre's vertical gradient shades the sides. The footprint outline is controlled separately. The height multiplier is a visual preview control, not a change to source building measurements.
- Some road styles have multiple casing, bridge, and tunnel layers. The editor changes them by inspecting the layer source and filter; inspect the exported JSON before using it in production.
- This prototype does not implement route calculation, GPS tracking, speed limits, camera alerts, search, or weather.
- It does not download offline areas.

## Technology

- MapLibre GL JS 6.16.0, pinned in the HTML.
- OpenFreeMap Liberty style.
- Python 3 standard library for the local static HTTP server.

MapLibre GL JS is a browser renderer from the MapLibre project. Its official repository and releases are available at https://github.com/maplibre/maplibre-gl-js.
