(() => {
  "use strict";

  const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  const CENTER = [13.405, 52.52];
  const DEFAULT_PITCH = 73;
  const AUTO_2D_WIDTH_KM = 5;
  const STORAGE_KEY = "wemaps.violet-night.style-lab.v2";
  const LEGACY_STORAGE_KEY = "wemaps.violet-night.style-lab.v1";
  const EASE_IN_OUT_CUBIC = (t) => t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const DEFAULTS = {
    background: "#100d18",
    residential: "#191424",
    park: "#1b2e25",
    wood: "#1d352b",
    water: "#142135",
    beach: "#70562c",
    minor: "#716587",
    local: "#8f7baa",
    secondary: "#ad95d4",
    primary: "#c3a8ed",
    trunk: "#cfb0f4",
    motorway: "#dec9ff",
    casing: "#30243f",
    buildingRoof: "#51436a",
    buildingOutline: "#342842"
  };

  const PRESETS = {
    violet: { ...DEFAULTS },
    deep: {
      ...DEFAULTS,
      background: "#090711",
      residential: "#13101d",
      park: "#14221d",
      wood: "#172b22",
      water: "#101a2a",
      beach: "#65502b",
      minor: "#514665",
      local: "#695982",
      secondary: "#806a9e",
      primary: "#987cba",
      trunk: "#aa8bcf",
      motorway: "#c2a1eb",
      casing: "#21192e",
      buildingRoof: "#443653",
      buildingOutline: "#211a30"
    },
    neon: {
      ...DEFAULTS,
      background: "#100b19",
      residential: "#1b1428",
      park: "#18271f",
      wood: "#1a3027",
      water: "#132038",
      beach: "#80602e",
      minor: "#765e91",
      local: "#9471b7",
      secondary: "#aa7ed2",
      primary: "#c18bea",
      trunk: "#ce96f4",
      motorway: "#e3b4ff",
      casing: "#392348",
      buildingRoof: "#644d7e",
      buildingOutline: "#392848"
    }
  };

  const $ = (selector) => document.querySelector(selector);
  const colorInputs = [...document.querySelectorAll("[data-color]")];
  const statusNode = $("#mapStatus");
  const errorNode = $("#mapError");

  let map = null;
  let buildingsVisible = true;
  let buildingOpacity = 0.96;
  let roadWidthScale = 1.12;
  let preferredPitch = Number($("#pitch").value) || DEFAULT_PITCH;
  let styleReady = false;
  let styleUpdateTimer = null;
  let layerCache = null;

  function setStatus(text) {
    statusNode.textContent = text;
  }

  function showError(message) {
    errorNode.hidden = false;
    errorNode.textContent = message;
    setStatus("Ошибка загрузки");
  }

  function readPalette() {
    return Object.fromEntries(colorInputs.map((input) => [
      input.dataset.color,
      input.value.toLowerCase()
    ]));
  }

  function updateColorLabels() {
    colorInputs.forEach((input) => {
      const value = input.value.toUpperCase();
      const code = input.parentElement.querySelector("code");
      const swatch = input.parentElement.querySelector(".swatch");
      if (code) code.textContent = value;
      if (swatch) swatch.style.setProperty("--swatch", value);
    });
  }

  function setPalette(palette) {
    colorInputs.forEach((input) => {
      if (palette[input.dataset.color]) {
        input.value = palette[input.dataset.color];
      }
    });
    updateColorLabels();
    scheduleStyleUpdate();
    saveSettings();
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        palette: readPalette(),
        buildingOpacity,
        roadWidthScale,
        pitch: preferredPitch,
        zoom: Number($("#zoom").value)
      }));
    } catch (error) {
      console.warn("Could not save style-lab settings:", error);
    }
  }

  function restoreSettings() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      const legacy = current ? null : localStorage.getItem(LEGACY_STORAGE_KEY);
      const saved = JSON.parse(current || legacy || "null");
      if (!saved) return;

      if (saved.palette) {
        colorInputs.forEach((input) => {
          const value = saved.palette[input.dataset.color];
          if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
            input.value = value;
          }
        });
      }

      if (Number.isFinite(saved.buildingOpacity)) {
        buildingOpacity = Math.min(1, Math.max(0.35, saved.buildingOpacity));
        $("#buildingOpacity").value = Math.round(buildingOpacity * 100);
      }

      if (Number.isFinite(saved.roadWidthScale)) {
        roadWidthScale = Math.min(1.45, Math.max(0.85, saved.roadWidthScale));
        $("#roadWidth").value = Math.round(roadWidthScale * 100);
      }

      if (Number.isFinite(saved.pitch)) {
        // 58 degrees was the previous default; use the new, more oblique 73-degree view.
        preferredPitch = legacy && saved.pitch === 58 ? DEFAULT_PITCH : Math.min(80, Math.max(0, saved.pitch));
      }

      $("#pitch").value = preferredPitch;

      if (Number.isFinite(saved.zoom)) {
        $("#zoom").value = Math.min(19, Math.max(5, saved.zoom));
      }
    } catch (error) {
      console.warn("Saved settings could not be read:", error);
    }
  }

  function findExtrusionLayers() {
    if (!map) return [];
    return map.getStyle().layers.filter((layer) => (
      layer.type === "fill-extrusion" && layer["source-layer"] === "building"
    ));
  }

  function getVisibleWidthKm(zoom = map.getZoom()) {
    const widthPx = map.getCanvas().clientWidth;
    const latitude = map.getCenter().lat * Math.PI / 180;
    const worldWidthMeters = 40075016.68557849 * Math.cos(latitude);
    const metersPerPixel = worldWidthMeters / (512 * Math.pow(2, zoom));
    return metersPerPixel * widthPx / 1000;
  }

  function syncBuildingVisibility(flatView) {
    findExtrusionLayers().forEach((layer) => {
      map.setLayoutProperty(
        layer.id,
        "visibility",
        buildingsVisible && !flatView ? "visible" : "none"
      );
    });
  }

  function refreshAdaptiveCamera(animate = false, zoomOverride = null) {
    if (!map) return;

    const zoom = zoomOverride === null ? map.getZoom() : zoomOverride;
    const visibleWidthKm = getVisibleWidthKm(zoom);
    const automatic2D = visibleWidthKm > AUTO_2D_WIDTH_KM;
    const effectivePitch = automatic2D ? 0 : preferredPitch;
    const pitchChanged = Math.abs(map.getPitch() - effectivePitch) > 0.5;

    if (pitchChanged) {
      const cameraOptions = {
        pitch: effectivePitch,
        duration: animate ? 420 : 0,
        easing: EASE_IN_OUT_CUBIC
      };
      if (animate) map.easeTo(cameraOptions);
      else map.setPitch(effectivePitch);
    }

    const flatView = automatic2D || effectivePitch < 1;
    $("#pitchValue").textContent = automatic2D
      ? "0° · авто"
      : String(Math.round(effectivePitch)) + "°";
    $("#view2d").classList.toggle("selected", flatView);
    $("#view3d").classList.toggle("selected", !flatView);
    $("#view2d").title = automatic2D
      ? "Автоматически включено: обзор больше 5 км"
      : "Переключить на 2D";
    $("#view3d").title = automatic2D
      ? "Приблизь карту до охвата 5 км, чтобы включить 3D"
      : "Переключить на 3D";

    syncBuildingVisibility(flatView);

    if (styleReady) {
      const mode = automatic2D
        ? "2D · обзор " + visibleWidthKm.toFixed(1) + " км"
        : (flatView
          ? "2D · ручной режим"
          : "3D · обзор " + visibleWidthKm.toFixed(1) + " км");
      setStatus("Стиль готов · " + mode);
    }
  }

  function scheduleStyleUpdate() {
    if (styleUpdateTimer !== null) window.clearTimeout(styleUpdateTimer);
    styleUpdateTimer = window.setTimeout(() => {
      styleUpdateTimer = null;
      applyStyle();
    }, 90);
  }

  function makeClassMatch(values) {
    return [
      "match",
      ["get", "class"],
      "motorway", values.motorway,
      "trunk", values.trunk,
      "primary", values.primary,
      "secondary", values.secondary,
      "tertiary", values.tertiary,
      "minor", values.minor,
      "service", values.service,
      "track", values.track,
      "path", values.path,
      "pedestrian", values.pedestrian,
      values.fallback
    ];
  }

  function roadColorExpression(palette) {
    return makeClassMatch({
      motorway: palette.motorway,
      trunk: palette.trunk,
      primary: palette.primary,
      secondary: palette.secondary,
      tertiary: palette.local,
      minor: palette.local,
      service: palette.minor,
      track: palette.minor,
      path: palette.minor,
      pedestrian: palette.minor,
      fallback: palette.minor
    });
  }

  function roadWidthExpression(multiplier = 1, extra = 0) {
    const stops = [
      {
        zoom: 9,
        values: { motorway: 1.6, trunk: 1.4, primary: 1.15, secondary: 0.95, tertiary: 0.75, minor: 0.55, service: 0.4, track: 0.35, path: 0.3, pedestrian: 0.3, fallback: 0.45 }
      },
      {
        zoom: 12,
        values: { motorway: 3.7, trunk: 3.3, primary: 2.9, secondary: 2.5, tertiary: 2.1, minor: 1.55, service: 1.1, track: 0.85, path: 0.65, pedestrian: 0.6, fallback: 0.8 }
      },
      {
        zoom: 15,
        values: { motorway: 8.0, trunk: 7.0, primary: 6.1, secondary: 5.2, tertiary: 4.3, minor: 3.15, service: 2.2, track: 1.55, path: 1.15, pedestrian: 1.0, fallback: 1.3 }
      },
      {
        zoom: 18,
        values: { motorway: 14.0, trunk: 12.4, primary: 10.8, secondary: 9.1, tertiary: 7.5, minor: 5.7, service: 4.0, track: 2.8, path: 2.0, pedestrian: 1.7, fallback: 2.2 }
      }
    ];

    const expression = ["interpolate", ["linear"], ["zoom"]];
    stops.forEach((stop) => {
      const values = {};
      Object.keys(stop.values).forEach((key) => {
        values[key] = Math.max(0.25, stop.values[key] * roadWidthScale * multiplier + extra);
      });
      expression.push(stop.zoom, makeClassMatch(values));
    });
    return expression;
  }

  function refreshLayerCache() {
    const layers = map.getStyle().layers;
    const baseLayers = layers.filter((layer) => !String(layer.id || "").startsWith("wemaps-"));
    layerCache = {
      backgrounds: baseLayers.filter((layer) => layer.type === "background"),
      transportation: baseLayers.filter((layer) => (
        layer.type === "line" && layer["source-layer"] === "transportation"
      )),
      waterFills: baseLayers.filter((layer) => (
        layer.type === "fill" && layer["source-layer"] === "water"
      )),
      waterways: baseLayers.filter((layer) => (
        layer.type === "line" && layer["source-layer"] === "waterway"
      )),
      landcover: baseLayers.filter((layer) => (
        layer.type === "fill" && layer["source-layer"] === "landcover"
      )),
      landuse: baseLayers.filter((layer) => (
        layer.type === "fill" && layer["source-layer"] === "landuse"
      )),
      parks: baseLayers.filter((layer) => (
        layer.type === "fill" && layer["source-layer"] === "park"
      )),
      buildings: baseLayers.filter((layer) => (
        layer.type === "fill" && layer["source-layer"] === "building"
      )),
      symbols: baseLayers.filter((layer) => layer.type === "symbol")
    };
  }

  function createTreePattern(kind) {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");

    function drawPine(x, y, size, color, highlight) {
      ctx.fillStyle = "rgba(5, 8, 13, 0.42)";
      ctx.beginPath();
      ctx.ellipse(x + 2, y + size * 0.76, size * 0.38, size * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#493925";
      ctx.fillRect(x - 1.2, y + size * 0.48, 2.4, size * 0.32);
      for (let tier = 0; tier < 3; tier++) {
        const top = y + tier * size * 0.19;
        const half = size * (0.31 - tier * 0.045);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x - half, top + size * 0.36);
        ctx.lineTo(x + half, top + size * 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = highlight;
        ctx.beginPath();
        ctx.moveTo(x, top + 2);
        ctx.lineTo(x - half * 0.66, top + size * 0.30);
        ctx.lineTo(x, top + size * 0.27);
        ctx.closePath();
        ctx.fill();
      }
    }

    function drawBroadleaf(x, y, size, color, highlight) {
      ctx.fillStyle = "rgba(5, 8, 13, 0.4)";
      ctx.beginPath();
      ctx.ellipse(x + 2, y + size * 0.77, size * 0.39, size * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#503d2e";
      ctx.fillRect(x - 1.4, y + size * 0.48, 2.8, size * 0.32);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y + size * 0.31, size * 0.34, 0, Math.PI * 2);
      ctx.arc(x - size * 0.21, y + size * 0.42, size * 0.22, 0, Math.PI * 2);
      ctx.arc(x + size * 0.22, y + size * 0.42, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = highlight;
      ctx.beginPath();
      ctx.arc(x - size * 0.08, y + size * 0.23, size * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    if (kind === "pine") {
      drawPine(25, 13, 42, "#315d49", "#6b9b6e");
      drawPine(70, 46, 35, "#294e40", "#5e8a62");
      drawPine(75, 2, 25, "#315d49", "#6b9b6e");
    } else if (kind === "broadleaf") {
      drawBroadleaf(27, 13, 40, "#315b46", "#78a16d");
      drawBroadleaf(72, 47, 34, "#294f40", "#668f65");
      drawBroadleaf(77, 3, 25, "#315b46", "#78a16d");
    } else if (kind === "orchard") {
      [[19, 20], [67, 20], [19, 68], [67, 68]].forEach(([x, y]) => {
        drawBroadleaf(x, y, 22, "#47714b", "#9ab96b");
      });
    } else if (kind === "vineyard") {
      ctx.strokeStyle = "rgba(169, 151, 94, 0.78)";
      ctx.lineWidth = 5;
      [15, 37, 59, 81].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(96, y);
        ctx.stroke();
      });
      ctx.fillStyle = "#5b7948";
      for (let y = 10; y < 96; y += 22) {
        for (let x = 10; x < 96; x += 18) {
          ctx.beginPath();
          ctx.arc(x, y, 3.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    return canvas;
  }

  function registerVegetationPatterns() {
    const patterns = [
      ["wemaps-forest-generic", "broadleaf"],
      ["wemaps-forest-pine", "pine"],
      ["wemaps-forest-broadleaf", "broadleaf"],
      ["wemaps-orchard", "orchard"],
      ["wemaps-vineyard", "vineyard"]
    ];
    patterns.forEach(([id, kind]) => {
      if (!map.hasImage(id)) {
        map.addImage(id, createTreePattern(kind), { pixelRatio: 2 });
      }
    });
  }

  function getVectorSourceForLayer(sourceLayerName, type = "fill") {
    const layer = map.getStyle().layers.find((item) => (
      item["source-layer"] === sourceLayerName && item.type === type
    ));
    return layer ? { source: layer.source, sourceLayer: sourceLayerName } : null;
  }

  function ensureBuildingLayer() {
    const style = map.getStyle();
    const footprint = style.layers.find((layer) => (
      layer["source-layer"] === "building" && layer.type === "fill"
    ));
    if (!footprint) return;

    let extrusions = findExtrusionLayers();
    if (!extrusions.length) {
      const footprintIndex = style.layers.findIndex((layer) => layer.id === footprint.id);
      const nextLayer = style.layers[footprintIndex + 1];
      map.addLayer({
        id: "wemaps-building-3d",
        type: "fill-extrusion",
        source: footprint.source,
        "source-layer": "building",
        minzoom: 14,
        filter: ["!", ["to-boolean", ["get", "hide_3d"]]],
        paint: {
          "fill-extrusion-base": ["coalesce", ["to-number", ["get", "render_min_height"]], 0],
          "fill-extrusion-height": [
            "coalesce",
            ["to-number", ["get", "render_height"]],
            ["to-number", ["get", "height"]],
            0
          ],
          "fill-extrusion-color": [
            "coalesce",
            ["get", "colour"],
            readPalette().buildingRoof
          ],
          "fill-extrusion-opacity": buildingOpacity,
          "fill-extrusion-vertical-gradient": true
        }
      }, nextLayer ? nextLayer.id : undefined);
      extrusions = findExtrusionLayers();
    }

    extrusions.forEach((layer) => {
      map.setFilter(layer.id, ["!", ["to-boolean", ["get", "hide_3d"]]]);
      map.setPaintProperty(layer.id, "fill-extrusion-base", [
        "coalesce",
        ["to-number", ["get", "render_min_height"]],
        0
      ]);
      map.setPaintProperty(layer.id, "fill-extrusion-height", [
        "coalesce",
        ["to-number", ["get", "render_height"]],
        ["to-number", ["get", "height"]],
        0
      ]);
      map.setPaintProperty(layer.id, "fill-extrusion-color", [
        "coalesce",
        ["get", "colour"],
        readPalette().buildingRoof
      ]);
      map.setPaintProperty(layer.id, "fill-extrusion-opacity", buildingOpacity);
      map.setPaintProperty(layer.id, "fill-extrusion-vertical-gradient", true);
    });
  }

  function ensureForestDetailLayers() {
    const source = getVectorSourceForLayer("landcover", "fill");
    if (!source) return;

    const styleLayers = map.getStyle().layers;
    const firstTransport = styleLayers.find((layer) => (
      layer["source-layer"] === "transportation" && layer.type === "line"
    ));
    const beforeId = firstTransport ? firstTransport.id : undefined;

    const layers = [
      {
        id: "wemaps-forest-needleleaved",
        filter: ["all", ["==", ["get", "class"], "wood"], ["==", ["get", "leaf_type"], "needleleaved"]],
        pattern: "wemaps-forest-pine"
      },
      {
        id: "wemaps-forest-broadleaved",
        filter: ["all", ["==", ["get", "class"], "wood"], ["==", ["get", "leaf_type"], "broadleaved"]],
        pattern: "wemaps-forest-broadleaf"
      },
      {
        id: "wemaps-forest-generic-detail",
        filter: [
          "all",
          ["==", ["get", "class"], "wood"],
          ["!", ["any",
            ["==", ["get", "leaf_type"], "needleleaved"],
            ["==", ["get", "leaf_type"], "broadleaved"]
          ]]
        ],
        pattern: "wemaps-forest-generic"
      },
      {
        id: "wemaps-orchard-detail",
        filter: ["==", ["get", "subclass"], "orchard"],
        pattern: "wemaps-orchard"
      },
      {
        id: "wemaps-vineyard-detail",
        filter: ["==", ["get", "subclass"], "vineyard"],
        pattern: "wemaps-vineyard"
      }
    ];

    layers.forEach((item) => {
      if (map.getLayer(item.id)) return;
      map.addLayer({
        id: item.id,
        type: "fill",
        source: source.source,
        "source-layer": source.sourceLayer,
        minzoom: 15.5,
        filter: item.filter,
        paint: {
          "fill-pattern": item.pattern,
          "fill-opacity": 0.94
        }
      }, beforeId);
    });
  }

  function roadFilter() {
    return ["in", ["get", "class"], ["literal", [
      "motorway", "trunk", "primary", "secondary", "tertiary",
      "minor", "service", "track", "path", "pedestrian"
    ]]];
  }

  function ensureRoadDepthLayers() {
    const road = getVectorSourceForLayer("transportation", "line");
    if (!road) return;

    const styleLayers = map.getStyle().layers;
    const firstRoad = styleLayers.find((layer) => (
      layer["source-layer"] === "transportation" && layer.type === "line"
    ));
    const firstSymbol = styleLayers.find((layer) => layer.type === "symbol");
    const symbolBefore = firstSymbol ? firstSymbol.id : undefined;

    if (!map.getLayer("wemaps-road-depth-shadow")) {
      map.addLayer({
        id: "wemaps-road-depth-shadow",
        type: "line",
        source: road.source,
        "source-layer": road.sourceLayer,
        minzoom: 9.5,
        filter: roadFilter(),
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#080610",
          "line-width": roadWidthExpression(1.7, 2.0),
          "line-opacity": 0.58,
          "line-blur": 1.6,
          "line-translate": [0, 1.8],
          "line-translate-anchor": "viewport"
        }
      }, firstRoad ? firstRoad.id : undefined);
    }

    if (!map.getLayer("wemaps-road-top-sheen")) {
      map.addLayer({
        id: "wemaps-road-top-sheen",
        type: "line",
        source: road.source,
        "source-layer": road.sourceLayer,
        minzoom: 12.5,
        filter: roadFilter(),
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#f7eaff",
          "line-width": roadWidthExpression(0.33, 0),
          "line-opacity": 0.23,
          "line-blur": 0.25
        }
      }, symbolBefore);
    }

    if (!map.getLayer("wemaps-road-lane-markings")) {
      map.addLayer({
        id: "wemaps-road-lane-markings",
        type: "line",
        source: road.source,
        "source-layer": road.sourceLayer,
        minzoom: 14.5,
        filter: ["all", ["in", ["get", "class"], ["literal", [
          "motorway", "trunk", "primary", "secondary"
        ]]], ["!=", ["get", "brunnel"], "tunnel"]],
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#f0ddff",
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            14.5, 0.65,
            18, 1.05
          ],
          "line-opacity": 0.58,
          "line-dasharray": [2, 3],
          "line-blur": 0.1
        }
      }, symbolBefore);
    }
  }

  function applyStyle() {
    if (!map || !map.isStyleLoaded()) return;

    const palette = readPalette();
    if (!layerCache) refreshLayerCache();

    layerCache.backgrounds.forEach((layer) => {
      map.setPaintProperty(layer.id, "background-color", palette.background);
    });

    layerCache.transportation.forEach((layer) => {
      const id = String(layer.id || "").toLowerCase();
      if (/rail|aerialway|ferry|transit|cable/.test(id)) return;

      const isCasing = id.includes("casing");
      map.setPaintProperty(
        layer.id,
        "line-color",
        isCasing ? palette.casing : roadColorExpression(palette)
      );
      map.setPaintProperty(
        layer.id,
        "line-width",
        roadWidthExpression(isCasing ? 1.58 : 1)
      );
      map.setPaintProperty(layer.id, "line-cap", "round");
      map.setPaintProperty(layer.id, "line-join", "round");
      if (isCasing) {
        map.setPaintProperty(layer.id, "line-blur", 0.35);
      }
    });

    layerCache.waterFills.forEach((layer) => {
      map.setPaintProperty(layer.id, "fill-color", palette.water);
    });

    layerCache.waterways.forEach((layer) => {
      map.setPaintProperty(layer.id, "line-color", palette.water);
    });

    layerCache.parks.forEach((layer) => {
      map.setPaintProperty(layer.id, "fill-color", palette.park);
      map.setPaintProperty(layer.id, "fill-outline-color", palette.park);
    });

    layerCache.landcover.forEach((layer) => {
      map.setPaintProperty(layer.id, "fill-color", [
        "match",
        ["get", "subclass"],
        "beach", palette.beach,
        "sand", palette.beach,
        "dune", "#80643a",
        "forest", palette.wood,
        "wood", palette.wood,
        "grass", palette.park,
        "grassland", palette.park,
        "scrub", "#24382a",
        "heath", "#29372a",
        ["match", ["get", "class"],
          "sand", palette.beach,
          "wood", palette.wood,
          "grass", palette.park,
          "wetland", "#1c302c",
          palette.park
        ]
      ]);
    });

    layerCache.landuse.forEach((layer) => {
      map.setPaintProperty(layer.id, "fill-color", [
        "match",
        ["get", "class"],
        "residential", palette.residential,
        "commercial", "#21192d",
        "industrial", "#211a2b",
        "retail", "#241a30",
        "park", palette.park,
        "forest", palette.wood,
        "wood", palette.wood,
        palette.residential
      ]);
    });

    layerCache.buildings.forEach((layer) => {
      map.setPaintProperty(layer.id, "fill-color", palette.buildingOutline);
      map.setPaintProperty(layer.id, "fill-outline-color", palette.buildingRoof);
    });

    findExtrusionLayers().forEach((layer) => {
      map.setPaintProperty(layer.id, "fill-extrusion-color", [
        "coalesce", ["get", "colour"], palette.buildingRoof
      ]);
      map.setPaintProperty(layer.id, "fill-extrusion-opacity", buildingOpacity);
      map.setPaintProperty(layer.id, "fill-extrusion-vertical-gradient", true);
    });

    layerCache.symbols.forEach((layer) => {
      if (layer.layout && layer.layout["text-field"] !== undefined) {
        map.setPaintProperty(layer.id, "text-color", "#eee6f8");
        map.setPaintProperty(layer.id, "text-halo-color", palette.background);
        map.setPaintProperty(layer.id, "text-halo-width", 1.2);
        map.setPaintProperty(layer.id, "text-halo-blur", 0.35);
      }
    });

    // Keep the extra road sheen and lane marks in sync with the road-width control.
    if (map.getLayer("wemaps-road-depth-shadow")) {
      map.setPaintProperty("wemaps-road-depth-shadow", "line-width", roadWidthExpression(1.7, 2.0));
    }
    if (map.getLayer("wemaps-road-top-sheen")) {
      map.setPaintProperty("wemaps-road-top-sheen", "line-width", roadWidthExpression(0.33, 0));
    }
    if (map.getLayer("wemaps-road-lane-markings")) {
      map.setPaintProperty("wemaps-road-lane-markings", "line-width", [
        "interpolate", ["linear"], ["zoom"],
        14.5, 0.65 * roadWidthScale,
        18, 1.05 * roadWidthScale
      ]);
    }

    refreshAdaptiveCamera(false);
  }

  function updateCamera(animate = true) {
    if (!map) return;

    preferredPitch = Number($("#pitch").value);
    const zoom = Number($("#zoom").value);
    $("#zoomValue").textContent = zoom.toFixed(1);

    const automatic2D = getVisibleWidthKm(zoom) > AUTO_2D_WIDTH_KM;
    const targetPitch = automatic2D ? 0 : preferredPitch;

    map.easeTo({
      pitch: targetPitch,
      zoom,
      duration: animate ? 520 : 0,
      easing: EASE_IN_OUT_CUBIC
    });

    $("#pitchValue").textContent = automatic2D
      ? "0° · авто"
      : String(Math.round(targetPitch)) + "°";
    $("#view2d").classList.toggle("selected", targetPitch < 1);
    $("#view3d").classList.toggle("selected", targetPitch >= 1);
    syncBuildingVisibility(targetPitch < 1);
    saveSettings();
  }

  function updateBuildingControls() {
    $("#buildingOpacityValue").textContent = String(Math.round(buildingOpacity * 100)) + "%";
  }

  function updateRoadControls() {
    $("#roadWidthValue").textContent = Math.round(roadWidthScale * 100) + "%";
  }

  function downloadJson() {
    if (!map) return;

    const style = map.getStyle();
    style.name = "Wemaps Violet Night";
    style.metadata = Object.assign({}, style.metadata || {}, {
      "wemaps:style": "Violet Night",
      "wemaps:prototype": "Local Map Style Lab",
      "wemaps:buildings": "Uses source render_height / height attributes without arbitrary height scaling",
      "wemaps:road-style": "Road class widths, visual depth casing, top sheen, and zoom-gated lane markings",
      "wemaps:vegetation": "Woodland patterns are decorative; species detail depends on provider attributes",
      "wemaps:required-images": "wemaps-forest-generic, wemaps-forest-pine, wemaps-forest-broadleaf, wemaps-orchard, wemaps-vineyard are registered by the prototype at runtime",
      "wemaps:export-note": "Review provider terms and attribution before production use."
    });

    const blob = new Blob([JSON.stringify(style, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wemaps-violet-night.style.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("Экспорт style.json готов");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const style = JSON.parse(String(reader.result));
        if (style.version !== 8 || !Array.isArray(style.layers) || !style.sources) {
          throw new Error("Файл не похож на MapLibre Style JSON версии 8.");
        }
        map.setStyle(style);
        map.once("style.load", () => {
          layerCache = null;
          registerVegetationPatterns();
          ensureBuildingLayer();
          ensureForestDetailLayers();
          ensureRoadDepthLayers();
          refreshLayerCache();
          applyStyle();
          setStatus("Импортированный стиль загружен");
        });
      } catch (error) {
        showError("Не удалось импортировать стиль: " + error.message);
      }
    };
    reader.onerror = () => showError("Не удалось прочитать выбранный JSON-файл.");
    reader.readAsText(file);
  }

  function bindControls() {
    colorInputs.forEach((input) => input.addEventListener("input", () => {
      updateColorLabels();
      scheduleStyleUpdate();
      saveSettings();
      document.querySelectorAll(".preset").forEach((button) => button.classList.remove("active"));
    }));

    $("#buildingOpacity").addEventListener("input", (event) => {
      buildingOpacity = Number(event.target.value) / 100;
      updateBuildingControls();
      scheduleStyleUpdate();
      saveSettings();
    });

    $("#roadWidth").addEventListener("input", (event) => {
      roadWidthScale = Number(event.target.value) / 100;
      updateRoadControls();
      scheduleStyleUpdate();
      saveSettings();
    });

    $("#pitch").addEventListener("input", () => updateCamera(false));
    $("#pitch").addEventListener("change", () => updateCamera(true));
    $("#zoom").addEventListener("input", () => updateCamera(false));
    $("#zoom").addEventListener("change", () => updateCamera(true));

    document.querySelectorAll("[data-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        setPalette(PRESETS[button.dataset.preset]);
        document.querySelectorAll(".preset").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
      });
    });

    $("#resetStyle").addEventListener("click", () => {
      setPalette(DEFAULTS);
      document.querySelectorAll(".preset").forEach((item) => {
        item.classList.toggle("active", item.dataset.preset === "violet");
      });
    });

    $("#resetCamera").addEventListener("click", () => {
      $("#zoom").value = 15.2;
      $("#pitch").value = DEFAULT_PITCH;
      preferredPitch = DEFAULT_PITCH;
      updateCamera(true);
      map.easeTo({
        center: CENTER,
        bearing: -18,
        duration: 650,
        easing: EASE_IN_OUT_CUBIC
      });
    });

    $("#toggleBuildings").addEventListener("click", () => {
      buildingsVisible = !buildingsVisible;
      $("#toggleBuildings").textContent = "3D: " + (buildingsVisible ? "включено" : "выключено");
      refreshAdaptiveCamera(false);
    });

    $("#view2d").addEventListener("click", () => {
      preferredPitch = 0;
      $("#pitch").value = 0;
      updateCamera(true);
    });

    $("#view3d").addEventListener("click", () => {
      preferredPitch = DEFAULT_PITCH;
      $("#pitch").value = DEFAULT_PITCH;
      updateCamera(true);
    });

    $("#recenter").addEventListener("click", () => {
      const targetPitch = getVisibleWidthKm(15.2) > AUTO_2D_WIDTH_KM ? 0 : preferredPitch;
      map.easeTo({
        center: CENTER,
        zoom: 15.2,
        pitch: targetPitch,
        bearing: -18,
        duration: 650,
        easing: EASE_IN_OUT_CUBIC
      });
    });

    $("#exportStyle").addEventListener("click", downloadJson);
    $("#importStyle").addEventListener("click", () => $("#styleFile").click());
    $("#styleFile").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) importJson(file);
      event.target.value = "";
    });
  }

  function initMap() {
    if (!window.maplibregl) {
      showError("Не загрузилась библиотека MapLibre GL JS. Проверь подключение к интернету и обнови страницу.");
      return;
    }

    map = new maplibregl.Map({
      container: "map",
      style: STYLE_URL,
      center: CENTER,
      zoom: Number($("#zoom").value),
      pitch: 0,
      bearing: -18,
      maxPitch: 80,
      minZoom: 3,
      maxZoom: 20,
      attributionControl: true,
      renderWorldCopies: false,
      fadeDuration: 240,
      maxTileCacheZoomLevels: 5,
      cancelPendingTileRequestsWhileZooming: false,
      localIdeographFontFamily: "sans-serif",
      canvasContextAttributes: {
        antialias: true,
        powerPreference: "high-performance"
      }
    });

    map.addControl(new maplibregl.NavigationControl({
      showCompass: true,
      showZoom: true,
      visualizePitch: true
    }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    map.once("load", () => {
      errorNode.hidden = true;
      styleReady = true;

      registerVegetationPatterns();
      ensureBuildingLayer();
      ensureForestDetailLayers();
      ensureRoadDepthLayers();
      refreshLayerCache();
      applyStyle();
      refreshAdaptiveCamera(false);
      updateBuildingControls();
      updateRoadControls();

      setStatus("Карта загружена · Violet Night");
    });

    map.on("zoomend", () => {
      const actualZoom = map.getZoom();
      $("#zoom").value = String(Math.min(19, Math.max(5, actualZoom)));
      $("#zoomValue").textContent = actualZoom.toFixed(1);
      refreshAdaptiveCamera(true);
      saveSettings();
    });

    map.on("resize", () => refreshAdaptiveCamera(false));
    map.on("pitchend", () => refreshAdaptiveCamera(false));

    map.on("error", (event) => {
      const message = event && event.error && event.error.message
        ? event.error.message
        : "Неизвестная ошибка загрузки карты";
      console.warn("MapLibre error:", message);

      if (!map.loaded()) {
        showError(
          "Не удалось загрузить карту. Проверь интернет-соединение. " +
          "Источник данных: OpenFreeMap. Подробности: " + message
        );
      }
    });
  }

  restoreSettings();
  updateColorLabels();
  updateBuildingControls();
  updateRoadControls();
  bindControls();
  initMap();
})();