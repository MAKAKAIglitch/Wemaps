(() => {
  "use strict";

  const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const CAMERA_MIN_ZOOM = 13.5;
  const ROAD_DATA_MIN_ZOOM = 15.5;
  const CAMERA_MAX_BBOX_AREA = 0.035;
  const OVERPASS_TIMEOUT_MS = 12000;
  const OSM_CACHE_TTL_MS = 5 * 60 * 1000;
  const CENTER = [13.405, 52.52];
  const DEFAULT_PITCH = 73;
  const AUTO_2D_WIDTH_KM = 5;
  const CAMERA_TRANSITION_MS = 1320;
  const BUILDING_FADE_MS = 1080;
  const STORAGE_KEY = "wemaps.violet-night.style-lab.v3";
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
    minor: "#44394f",
    local: "#50415f",
    secondary: "#5d4a70",
    primary: "#6b5484",
    trunk: "#795e94",
    motorway: "#896ba6",
    casing: "#21192d",
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
  let currentExtrusionOpacity = buildingOpacity;
  let extrusionFadeFrame = null;
  let extrusionFadeToken = 0;
  let styleLoadRetries = 0;
  let retryTimer = null;
  let interruptedResponseRetries = 0;
  let networkRetryTimer = null;
  let activeStyleDefinition = STYLE_URL;
  let osmRequestController = null;
  let osmRequestTimer = null;
  let osmRequestSerial = 0;
  let osmRequestTimeout = null;
  let osmCache = new Map();
  let lastRoadScaleLatitude = null;
  let overlayClickHandlersBound = false;

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

  function setExtrusionOpacity(opacity) {
    currentExtrusionOpacity = Math.min(1, Math.max(0, opacity));
    findExtrusionLayers().forEach((layer) => {
      map.setPaintProperty(layer.id, "fill-extrusion-opacity", currentExtrusionOpacity);
    });
  }

  function animateExtrusionOpacity(targetOpacity, duration, hideAtZero = false) {
    if (!map) return;

    if (extrusionFadeFrame !== null) {
      cancelAnimationFrame(extrusionFadeFrame);
      extrusionFadeFrame = null;
    }

    const token = ++extrusionFadeToken;
    const startOpacity = currentExtrusionOpacity;
    const endOpacity = Math.min(1, Math.max(0, targetOpacity));
    const startedAt = performance.now();

    const finish = () => {
      setExtrusionOpacity(endOpacity);
      extrusionFadeFrame = null;
      if (hideAtZero && endOpacity <= 0.001) {
        findExtrusionLayers().forEach((layer) => {
          map.setLayoutProperty(layer.id, "visibility", "none");
        });
      }
    };

    if (Math.abs(startOpacity - endOpacity) < 0.002 || duration <= 0) {
      finish();
      return;
    }

    const tick = (now) => {
      if (token !== extrusionFadeToken) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = EASE_IN_OUT_CUBIC(progress);
      setExtrusionOpacity(startOpacity + (endOpacity - startOpacity) * eased);
      if (progress < 1) {
        extrusionFadeFrame = requestAnimationFrame(tick);
      } else {
        finish();
      }
    };

    extrusionFadeFrame = requestAnimationFrame(tick);
  }

  function syncBuildingVisibility(flatView, animate = false) {
    const shouldShow = buildingsVisible && !flatView;
    findExtrusionLayers().forEach((layer) => {
      map.setLayoutProperty(layer.id, "visibility", shouldShow ? "visible" : "none");
    });

    if (shouldShow) {
      if (animate) animateExtrusionOpacity(buildingOpacity, BUILDING_FADE_MS);
      else setExtrusionOpacity(buildingOpacity);
    } else if (!animate) {
      if (extrusionFadeFrame !== null) {
        cancelAnimationFrame(extrusionFadeFrame);
        extrusionFadeFrame = null;
        extrusionFadeToken++;
      }
      setExtrusionOpacity(0);
    }
  }

  function transitionCamera(targetPitch, targetZoom = map.getZoom(), extra = {}) {
    if (!map) return;

    const was3D = map.getPitch() >= 1;
    const willBe3D = targetPitch >= 1;
    const options = Object.assign({}, extra, {
      pitch: targetPitch,
      zoom: targetZoom,
      duration: CAMERA_TRANSITION_MS,
      easing: EASE_IN_OUT_CUBIC,
      essential: true
    });

    if (buildingsVisible && willBe3D) {
      findExtrusionLayers().forEach((layer) => {
        map.setLayoutProperty(layer.id, "visibility", "visible");
      });
      animateExtrusionOpacity(buildingOpacity, BUILDING_FADE_MS);
    } else if (buildingsVisible && was3D && !willBe3D) {
      findExtrusionLayers().forEach((layer) => {
        map.setLayoutProperty(layer.id, "visibility", "visible");
      });
      animateExtrusionOpacity(0, BUILDING_FADE_MS, true);
    } else {
      syncBuildingVisibility(!willBe3D, false);
    }

    map.easeTo(options);
  }

  function refreshAdaptiveCamera(animate = false, zoomOverride = null) {
    if (!map) return;

    const zoom = zoomOverride === null ? map.getZoom() : zoomOverride;
    const visibleWidthKm = getVisibleWidthKm(zoom);
    const automatic2D = visibleWidthKm > AUTO_2D_WIDTH_KM;
    const effectivePitch = automatic2D ? 0 : preferredPitch;
    const pitchChanged = Math.abs(map.getPitch() - effectivePitch) > 0.5;

    if (pitchChanged) {
      if (animate) transitionCamera(effectivePitch, zoom);
      else {
        map.setPitch(effectivePitch);
        syncBuildingVisibility(effectivePitch < 1, false);
      }
    } else if (extrusionFadeFrame === null) {
      syncBuildingVisibility(effectivePitch < 1, false);
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

  function roadLaneCountExpression() {
    return [
      "case",
      ["has", "lanes"],
      ["to-number", ["get", "lanes"], 0],
      ["any", ["has", "lanes:forward"], ["has", "lanes:backward"]],
      [
        "+",
        ["to-number", ["get", "lanes:forward"], 0],
        ["to-number", ["get", "lanes:backward"], 0]
      ],
      ["match", ["get", "class"],
        "motorway", 4, "trunk", 2, "primary", 2,
        "secondary", 2, "tertiary", 2, "minor", 2, 0
      ]
    ];
  }

  function pixelsPerMeterAtZoom(zoom) {
    const latitude = map ? map.getCenter().lat : 52.52;
    const circumference = 40075016.68557849
      * Math.max(0.087, Math.cos(latitude * Math.PI / 180));
    return (512 * Math.pow(2, zoom)) / circumference;
  }

  function roadWidthExpression(multiplier = 1, extraMeters = 0, factor = 1) {
    const lanes = roadLaneCountExpression();
    const hasLaneTags = [
      "any", ["has", "lanes"], ["has", "lanes:forward"], ["has", "lanes:backward"]
    ];
    const widthTag = ["to-number", ["get", "width"], 0];
    const validWidth = ["all", ["has", "width"], [">", widthTag, 0]];
    const laneWidth = [
      "+", ["*", ["max", 1, ["min", 12, lanes]], 3.25], 0.35
    ];
    const classWidth = [
      "match", ["get", "class"],
      "motorway", 12.5, "trunk", 10.5, "primary", 9.5,
      "secondary", 8.2, "tertiary", 7.2, "minor", 6.4,
      "street", 6.4, "street_limited", 6.4,
      "service", 4.6, "track", 3.6, "path", 2.0,
      "pedestrian", 3.2, 5.0
    ];
    const widthMeters = [
      "case",
      validWidth, widthTag,
      ["all", hasLaneTags, [">", lanes, 0]], laneWidth,
      classWidth
    ];
    return [
      "interpolate", ["exponential", 2], ["zoom"],
      5, ["+", ["*", widthMeters, multiplier, roadWidthScale, factor, pixelsPerMeterAtZoom(5)], extraMeters * roadWidthScale * pixelsPerMeterAtZoom(5)],
      20, ["+", ["*", widthMeters, multiplier, roadWidthScale, factor, pixelsPerMeterAtZoom(20)], extraMeters * roadWidthScale * pixelsPerMeterAtZoom(20)]
    ];
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
    } else if (kind === "mixed") {
      drawBroadleaf(22, 10, 31, "#315b46", "#78a16d");
      drawPine(72, 43, 37, "#294e40", "#6b9b6e");
      drawBroadleaf(76, 2, 24, "#315b46", "#78a16d");
      drawPine(20, 64, 24, "#294e40", "#5e8a62");
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
      ["wemaps-forest-generic", "mixed"],
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
    const vectorSource = Object.entries(style.sources || {}).find(([id, source]) => (
      source && source.type === "vector" && (id === "openmaptiles" || /planet|openfreemap/i.test(source.url || ""))
    )) || Object.entries(style.sources || {}).find(([, source]) => source && source.type === "vector");

    const sourceId = footprint ? footprint.source : (vectorSource ? vectorSource[0] : null);
    if (!sourceId) {
      console.warn("No vector source available for the OpenMapTiles building layer.");
      return;
    }

    let extrusions = findExtrusionLayers();
    if (!extrusions.length) {
      let beforeId;
      if (footprint) {
        const footprintIndex = style.layers.findIndex((layer) => layer.id === footprint.id);
        beforeId = style.layers[footprintIndex + 1]?.id;
      } else {
        beforeId = style.layers.find((layer) => layer.type === "symbol")?.id;
      }

      map.addLayer({
        id: "wemaps-building-3d",
        type: "fill-extrusion",
        source: sourceId,
        "source-layer": "building",
        minzoom: 13.5,
        filter: [
          "all",
          ["!", ["to-boolean", ["get", "hide_3d"]]],
          [">", ["to-number", ["coalesce", ["get", "render_height"], ["get", "height"]], 0], 0]
        ],
        paint: {
          "fill-extrusion-base": ["coalesce", ["to-number", ["get", "render_min_height"]], 0],
          "fill-extrusion-height": [
            "coalesce",
            ["to-number", ["get", "render_height"]],
            ["to-number", ["get", "height"]],
            0
          ],
          "fill-extrusion-color": ["coalesce", ["get", "colour"], readPalette().buildingRoof],
          "fill-extrusion-opacity": buildingOpacity,
          "fill-extrusion-vertical-gradient": true
        }
      }, beforeId);
      extrusions = findExtrusionLayers();
    }

    extrusions.forEach((layer) => {
      map.setFilter(layer.id, [
        "all",
        ["!", ["to-boolean", ["get", "hide_3d"]]],
        [">", ["to-number", ["coalesce", ["get", "render_height"], ["get", "height"]], 0], 0]
      ]);
      map.setPaintProperty(layer.id, "fill-extrusion-base", [
        "coalesce", ["to-number", ["get", "render_min_height"]], 0
      ]);
      map.setPaintProperty(layer.id, "fill-extrusion-height", [
        "coalesce",
        ["to-number", ["get", "render_height"]],
        ["to-number", ["get", "height"]],
        0
      ]);
      map.setPaintProperty(layer.id, "fill-extrusion-color", [
        "coalesce", ["get", "colour"], readPalette().buildingRoof
      ]);
      map.setPaintProperty(layer.id, "fill-extrusion-opacity", currentExtrusionOpacity);
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
      "street", "street_limited", "minor", "service", "track", "path", "pedestrian"
    ]]];
  }

  function ensureRoadDepthLayers() {
    const road = getVectorSourceForLayer("transportation", "line");
    if (!road) return;

    const firstSymbol = map.getStyle().layers.find((layer) => layer.type === "symbol");
    const beforeId = firstSymbol ? firstSymbol.id : undefined;
    const baseFilter = roadFilter();
    const bridgeFilter = ["all", baseFilter, ["==", ["get", "brunnel"], "bridge"]];
    const rampFilter = ["all", baseFilter, ["==", ["get", "ramp"], 1]];
    const laneCount = roadLaneCountExpression();
    const laneFilter = [
      "all",
      ["in", ["get", "class"], ["literal", [
        "motorway", "trunk", "primary", "secondary", "tertiary", "minor"
      ]]],
      [">=", laneCount, 2],
      ["!=", ["get", "brunnel"], "tunnel"]
    ];
    const multiLaneFilter = ["all", laneFilter, [">=", laneCount, 3]];

    if (!map.getLayer("wemaps-road-depth-shadow")) {
      map.addLayer({
        id: "wemaps-road-depth-shadow",
        type: "line",
        source: road.source,
        "source-layer": road.sourceLayer,
        minzoom: 10,
        filter: baseFilter,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#07050c",
          "line-width": roadWidthExpression(1.14, 0.9),
          "line-opacity": 0.4,
          "line-translate": [0, 1.2],
          "line-translate-anchor": "viewport"
        }
      }, beforeId);
    }

    if (!map.getLayer("wemaps-bridge-deck-edge")) {
      map.addLayer({
        id: "wemaps-bridge-deck-edge",
        type: "line",
        source: road.source,
        "source-layer": road.sourceLayer,
        minzoom: 11,
        filter: bridgeFilter,
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": "#21182e",
          "line-width": roadWidthExpression(1.10, 0.7),
          "line-opacity": 0.98
        }
      }, beforeId);
    }

    if (!map.getLayer("wemaps-ramp-highlight")) {
      map.addLayer({
        id: "wemaps-ramp-highlight",
        type: "line",
        source: road.source,
        "source-layer": road.sourceLayer,
        minzoom: 12,
        filter: rampFilter,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#a88ac7",
          "line-width": roadWidthExpression(0.98, 0.15),
          "line-opacity": 0.42
        }
      }, beforeId);
    }

    if (!map.getLayer("wemaps-road-lane-center")) {
      map.addLayer({
        id: "wemaps-road-lane-center",
        type: "line",
        source: road.source,
        "source-layer": road.sourceLayer,
        minzoom: 14.5,
        filter: laneFilter,
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": "#fff4ff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 14.5, 1.0, 17, 1.35, 20, 1.6],
          "line-opacity": 1,
          "line-dasharray": ["literal", [3.2, 2.2]]
        }
      }, beforeId);
    }

    [-1, 1].forEach((side) => {
      const id = side < 0 ? "wemaps-road-lane-outer-left" : "wemaps-road-lane-outer-right";
      if (map.getLayer(id)) return;
      map.addLayer({
        id,
        type: "line",
        source: road.source,
        "source-layer": road.sourceLayer,
        minzoom: 15.5,
        filter: multiLaneFilter,
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": "#f0e3ff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 15.5, 0.9, 18, 1.2, 20, 1.4],
          "line-offset": roadWidthExpression(1, 0, side * 0.25),
          "line-opacity": 0.96,
          "line-dasharray": ["literal", [2.8, 2.2]]
        }
      }, beforeId);
    });
  }

  function parseBearing(value) {
    if (value === undefined || value === null) return null;
    const raw = String(value).trim().toUpperCase();
    const numeric = Number(raw.replace(/[°º]/g, ""));
    if (raw !== "" && Number.isFinite(numeric)) return ((numeric % 360) + 360) % 360;
    const compass = {
      N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5,
      SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225,
      WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5
    };
    return Object.prototype.hasOwnProperty.call(compass, raw) ? compass[raw] : null;
  }

  function destinationPoint(lon, lat, bearing, distanceMeters) {
    const earthRadius = 6371008.8;
    const angularDistance = distanceMeters / earthRadius;
    const theta = bearing * Math.PI / 180;
    const phi1 = lat * Math.PI / 180;
    const lambda1 = lon * Math.PI / 180;
    const sinPhi2 = Math.sin(phi1) * Math.cos(angularDistance)
      + Math.cos(phi1) * Math.sin(angularDistance) * Math.cos(theta);
    const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
    const lambda2 = lambda1 + Math.atan2(
      Math.sin(theta) * Math.sin(angularDistance) * Math.cos(phi1),
      Math.cos(angularDistance) - Math.sin(phi1) * Math.sin(phi2)
    );
    return [((lambda2 * 180 / Math.PI + 540) % 360) - 180, phi2 * 180 / Math.PI];
  }

  function makeCameraSector(lon, lat, bearing, properties) {
    const points = [[lon, lat]];
    for (let angle = bearing - 18; angle <= bearing + 18.01; angle += 3) {
      points.push(destinationPoint(lon, lat, angle, 72));
    }
    points.push([lon, lat]);
    return {
      type: "Feature",
      properties: Object.assign({}, properties, { kind: "camera-sector" }),
      geometry: { type: "Polygon", coordinates: [points] }
    };
  }

  function makeOverlayIcon(kind) {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (kind === "camera" || kind === "camera-direction") {
      ctx.shadowColor = "rgba(0,0,0,.65)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#21142c";
      ctx.beginPath();
      ctx.arc(32, 34, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#ff9b83";
      ctx.lineWidth = 3.5;
      ctx.stroke();
      if (kind === "camera-direction") {
        ctx.fillStyle = "#f5c1ff";
        ctx.beginPath();
        ctx.moveTo(32, 5);
        ctx.lineTo(22, 26);
        ctx.lineTo(42, 26);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = "#fff4ff";
      ctx.beginPath();
      ctx.arc(32, 38, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#9a63be";
      ctx.beginPath();
      ctx.arc(32, 38, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.shadowColor = "rgba(0,0,0,.65)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#392347";
      ctx.beginPath();
      ctx.arc(32, 32, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#ffca75";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = "#fff0c5";
      ctx.beginPath();
      ctx.moveTo(32, 12);
      ctx.lineTo(43, 32);
      ctx.lineTo(32, 26);
      ctx.lineTo(21, 32);
      ctx.closePath();
      ctx.fill();
    }
    return canvas;
  }

  function registerOverlayImages() {
    if (!map.hasImage("wemaps-speed-camera")) {
      map.addImage("wemaps-speed-camera", makeOverlayIcon("camera"), { pixelRatio: 2 });
    }
    if (!map.hasImage("wemaps-speed-camera-direction")) {
      map.addImage("wemaps-speed-camera-direction", makeOverlayIcon("camera-direction"), { pixelRatio: 2 });
    }
    if (!map.hasImage("wemaps-junction-marker")) {
      map.addImage("wemaps-junction-marker", makeOverlayIcon("junction"), { pixelRatio: 2 });
    }
  }

  function makeOverlayPopup(title, rows) {
    const root = document.createElement("div");
    root.className = "wemaps-popup";
    const heading = document.createElement("strong");
    heading.textContent = title;
    root.appendChild(heading);
    rows.filter((row) => row && row.value !== undefined && row.value !== "").forEach((row) => {
      const line = document.createElement("div");
      line.textContent = row.label + ": " + row.value;
      root.appendChild(line);
    });
    return root;
  }

  function bindOverlayClickHandlers() {
    if (overlayClickHandlersBound) return;
    overlayClickHandlersBound = true;

    map.on("click", "wemaps-osm-measured-road-fill", (event) => {
      const feature = event.features && event.features[0];
      if (!feature) return;
      const props = feature.properties || {};
      new maplibregl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat(event.lngLat)
        .setDOMContent(makeOverlayPopup("Ширина дороги из OSM", [
          { label: "Ширина", value: Number(props.widthMeters).toFixed(1) + " м" },
          { label: "Тег", value: props.widthTag },
          { label: "Полосы", value: props.lanes || "не указано" },
          { label: "OSM", value: props.osmId }
        ]))
        .addTo(map);
    });

    map.on("click", "wemaps-camera-symbols", (event) => {
      const feature = event.features && event.features[0];
      if (!feature) return;
      const props = feature.properties || {};
      const rows = [
        { label: "Тип", value: props.cameraType },
        { label: "Скорость", value: props.maxspeed ? props.maxspeed + " км/ч" : "" },
        { label: "Направление", value: props.directionKnown === "yes" ? props.direction + "° от севера" : "не указано в OSM" },
        { label: "Объект OSM", value: props.osmId }
      ];
      new maplibregl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat(event.lngLat)
        .setDOMContent(makeOverlayPopup("Камера", rows))
        .addTo(map);
    });

    map.on("click", "wemaps-junction-symbols", (event) => {
      const feature = event.features && event.features[0];
      if (!feature) return;
      const props = feature.properties || {};
      new maplibregl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat(event.lngLat)
        .setDOMContent(makeOverlayPopup("Авторазвязка / съезд", [
          { label: "Номер", value: props.ref },
          { label: "Название", value: props.name },
          { label: "Объект OSM", value: props.osmId }
        ]))
        .addTo(map);
    });
  }

  function ensureOsmOverlayLayers() {
    registerOverlayImages();
    if (!map.getSource("wemaps-osm-live")) {
      map.addSource("wemaps-osm-live", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
    }

    const beforeId = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
    const source = "wemaps-osm-live";
    if (!map.getLayer("wemaps-osm-measured-road-fill")) {
      map.addLayer({
        id: "wemaps-osm-measured-road-fill",
        type: "fill",
        source,
        minzoom: 14.5,
        filter: ["==", ["get", "kind"], "measured-road"],
        paint: {
          "fill-color": [
            "match", ["get", "roadClass"],
            "motorway", "#34263f",
            "trunk", "#31243b",
            "primary", "#2e2238",
            "secondary", "#2a2033",
            "tertiary", "#271e30",
            "residential", "#241c2d",
            "service", "#211a29",
            "#261e31"
          ],
          "fill-opacity": 1,
          "fill-outline-color": "#100c17"
        }
      }, beforeId);
    }
    if (!map.getLayer("wemaps-osm-measured-lane-markings")) {
      map.addLayer({
        id: "wemaps-osm-measured-lane-markings",
        type: "line",
        source,
        minzoom: 15.5,
        filter: ["==", ["get", "kind"], "measured-lanes"],
        layout: { "line-cap": "butt", "line-join": "round" },
        paint: {
          "line-color": "#fff7ff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 15.5, 1.05, 18, 1.45],
          "line-opacity": 1,
          "line-dasharray": ["literal", [3.2, 2.0]]
        }
      }, beforeId);
    }


    if (!map.getLayer("wemaps-camera-view-cones")) {
      map.addLayer({
        id: "wemaps-camera-view-cones",
        type: "fill",
        source,
        filter: ["==", ["get", "kind"], "camera-sector"],
        paint: {
          "fill-color": "#ff9b83",
          "fill-opacity": 0.2,
          "fill-outline-color": "#ffd0a6"
        }
      }, beforeId);
    }
    if (!map.getLayer("wemaps-camera-points")) {
      map.addLayer({
        id: "wemaps-camera-points",
        type: "circle",
        source,
        filter: ["==", ["get", "kind"], "camera"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11.5, 4.5, 16, 7.5, 19, 9],
          "circle-color": "#28162f",
          "circle-stroke-color": "#ffb09a",
          "circle-stroke-width": 1.8,
          "circle-opacity": 0.98
        }
      }, beforeId);
    }
    if (!map.getLayer("wemaps-camera-symbols")) {
      map.addLayer({
        id: "wemaps-camera-symbols",
        type: "symbol",
        source,
        filter: ["==", ["get", "kind"], "camera"],
        layout: {
          "icon-image": [
            "case",
            ["==", ["get", "directionKnown"], "yes"],
            "wemaps-speed-camera-direction",
            "wemaps-speed-camera"
          ],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 11.5, 0.48, 16, 0.7, 19, 0.82],
          "icon-rotate": ["to-number", ["get", "direction"], 0],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true
        }
      }, beforeId);
    }
    if (!map.getLayer("wemaps-junction-symbols")) {
      map.addLayer({
        id: "wemaps-junction-symbols",
        type: "symbol",
        source,
        filter: ["==", ["get", "kind"], "junction"],
        layout: {
          "icon-image": "wemaps-junction-marker",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 11.5, 0.42, 15, 0.65, 18, 0.78],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-field": ["coalesce", ["get", "ref"], ["get", "name"], ""],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
          "text-offset": [0, 1.35],
          "text-anchor": "top",
          "text-allow-overlap": false
        },
        paint: {
          "text-color": "#ffdc9e",
          "text-halo-color": "#17101f",
          "text-halo-width": 1.2
        }
      }, beforeId);
    }

    bindOverlayClickHandlers();
  }

  function osmOverlayStatus(message) {
    const node = document.querySelector("#mapFeatureStatus");
    if (node) node.textContent = message;
  }

  function parseOsmWidthMeters(tags) {
    const candidates = [
      ["width:carriageway", tags["width:carriageway"]],
      ["width", tags.width],
      ["width:effective", tags["width:effective"]]
    ];
    for (const [key, raw] of candidates) {
      if (!raw) continue;
      const value = String(raw).trim().toLowerCase().replace(",", ".");
      const match = value.match(/(\\d+(?:\\.\\d+)?)/);
      if (!match) continue;
      let widthMeters = Number(match[1]);
      if (!Number.isFinite(widthMeters) || widthMeters <= 0 || widthMeters > 100) continue;
      if (/\\b(ft|foot|feet)\\b|['′]/.test(value)) widthMeters *= 0.3048;
      return { widthMeters, widthTag: key };
    }
    return null;
  }

  function parseOsmLaneCount(tags) {
    const direct = Number.parseFloat(String(tags.lanes || "").replace(",", "."));
    if (Number.isFinite(direct) && direct > 0 && direct <= 20) return Math.round(direct);
    const forward = Number.parseFloat(String(tags["lanes:forward"] || "").replace(",", "."));
    const backward = Number.parseFloat(String(tags["lanes:backward"] || "").replace(",", "."));
    const total = (Number.isFinite(forward) ? forward : 0) + (Number.isFinite(backward) ? backward : 0);
    return total > 0 && total <= 20 ? Math.round(total) : null;
  }

  function osmBearing(a, b) {
    const lon1 = a[0] * Math.PI / 180;
    const lon2 = b[0] * Math.PI / 180;
    const lat1 = a[1] * Math.PI / 180;
    const lat2 = b[1] * Math.PI / 180;
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2)
      - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function offsetOsmLine(coordinates, offsetMeters) {
    return coordinates.map((point, index) => {
      const previous = coordinates[Math.max(0, index - 1)];
      const next = coordinates[Math.min(coordinates.length - 1, index + 1)];
      const tangentBearing = osmBearing(previous, next);
      const tangent = tangentBearing * Math.PI / 180;
      const bearing = (tangent * 180 / Math.PI + (offsetMeters >= 0 ? 90 : -90) + 360) % 360;
      return destinationPoint(point[0], point[1], bearing, Math.abs(offsetMeters));
    });
  }

  function makeOsmRoadPolygon(coordinates, widthMeters) {
    if (!coordinates || coordinates.length < 2 || !widthMeters) return null;
    const left = offsetOsmLine(coordinates, widthMeters / 2);
    const right = offsetOsmLine(coordinates, -widthMeters / 2).reverse();
    return left.concat(right, [left[0]]);
  }

  function buildOsmOverlayFeatures(data) {
    const features = [];
    const seen = new Set();
    let cameras = 0;
    let junctions = 0;
    let measuredWidthRoads = 0;
    let laneTaggedRoads = 0;

    (data.elements || []).forEach((element) => {
      const tags = element.tags || {};
      const id = element.type + "/" + element.id;
      if (seen.has(id)) return;

      const geometry = Array.isArray(element.geometry)
        ? element.geometry.filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat))
          .map((point) => [point.lon, point.lat])
        : [];
      const point = Number.isFinite(element.lat) && Number.isFinite(element.lon)
        ? [element.lon, element.lat]
        : (element.center && Number.isFinite(element.center.lon) && Number.isFinite(element.center.lat)
          ? [element.center.lon, element.center.lat]
          : null);

      if (element.type === "way" && tags.highway && geometry.length >= 2) {
        const width = parseOsmWidthMeters(tags);
        const lanes = parseOsmLaneCount(tags);
        if (width) {
          const polygon = makeOsmRoadPolygon(geometry, width.widthMeters);
          if (polygon) {
            measuredWidthRoads += 1;
            features.push({
              type: "Feature",
              properties: {
                kind: "measured-road",
                osmId: id,
                roadClass: tags.highway,
                widthMeters: width.widthMeters,
                widthTag: width.widthTag,
                lanes: lanes || 0,
                name: tags.name || ""
              },
              geometry: { type: "Polygon", coordinates: [polygon] }
            });
          }
        }
        if (lanes) {
          laneTaggedRoads += 1;
          const widthMeters = width ? width.widthMeters : lanes * 3.25;
          const dividers = [];
          for (let divider = 1; divider < lanes; divider += 1) {
            dividers.push(offsetOsmLine(geometry, (divider / lanes - 0.5) * widthMeters));
          }
          if (dividers.length) {
            features.push({
              type: "Feature",
              properties: {
                kind: "measured-lanes",
                osmId: id,
                lanes,
                widthKnown: width ? "yes" : "no"
              },
              geometry: { type: "MultiLineString", coordinates: dividers }
            });
          }
        }
      }

      if (!point) return;
      if (tags.highway === "motorway_junction") {
        seen.add(id);
        junctions += 1;
        features.push({
          type: "Feature",
          properties: {
            kind: "junction",
            osmId: id,
            ref: tags.ref || "",
            name: tags.name || "",
            destination: tags.destination || ""
          },
          geometry: { type: "Point", coordinates: point }
        });
        return;
      }

      const isSpeedCamera = tags.highway === "speed_camera";
      const isTrafficSurveillance = tags.man_made === "surveillance"
        && /^(camera|alpr)$/i.test(tags["surveillance:type"] || "")
        && /^(traffic|road|street|motorway)$/i.test(tags["surveillance:zone"] || "");
      if (!isSpeedCamera && !isTrafficSurveillance) return;

      seen.add(id);
      cameras += 1;
      const bearing = parseBearing(tags["camera:direction"] || tags.direction);
      const properties = {
        kind: "camera",
        osmId: id,
        cameraType: isSpeedCamera ? "Контроль скорости" : "Дорожное наблюдение",
        maxspeed: tags.maxspeed || "",
        direction: bearing === null ? 0 : bearing,
        directionKnown: bearing === null ? "no" : "yes",
        name: tags.name || "",
        operator: tags.operator || ""
      };
      features.push({
        type: "Feature",
        properties,
        geometry: { type: "Point", coordinates: point }
      });
      if (bearing !== null) {
        features.push(makeCameraSector(point[0], point[1], bearing, properties));
      }
    });

    return {
      collection: { type: "FeatureCollection", features },
      cameras,
      junctions,
      measuredWidthRoads,
      laneTaggedRoads
    };
  }

  function osmCacheKey(bounds) {
    return [
      bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()
    ].map((value) => value.toFixed(4)).join("|");
  }

  async function fetchOsmOverlays() {
    if (!map || !styleReady || !map.getSource("wemaps-osm-live")) return;
    if (map.getZoom() < CAMERA_MIN_ZOOM) {
      map.getSource("wemaps-osm-live").setData({ type: "FeatureCollection", features: [] });
      osmOverlayStatus("Камеры OSM · приблизь карту");
      return;
    }

    const bounds = map.getBounds();
    const area = Math.abs((bounds.getEast() - bounds.getWest()) * (bounds.getNorth() - bounds.getSouth()));
    if (area > CAMERA_MAX_BBOX_AREA) {
      map.getSource("wemaps-osm-live").setData({ type: "FeatureCollection", features: [] });
      osmOverlayStatus("OSM-слои · приблизь карту для точных данных");
      return;
    }

    const key = osmCacheKey(bounds);
    const cached = osmCache.get(key);
    if (cached && Date.now() - cached.time < OSM_CACHE_TTL_MS) {
      map.getSource("wemaps-osm-live").setData(cached.collection);
      osmOverlayStatus("OSM · кэш: камеры " + cached.cameras + " · ширина из OSM " + cached.measuredWidthRoads);
      return;
    }

    if (osmRequestController) osmRequestController.abort();
    if (osmRequestTimeout !== null) {
      window.clearTimeout(osmRequestTimeout);
      osmRequestTimeout = null;
    }

    const controller = new AbortController();
    osmRequestController = controller;
    const serial = ++osmRequestSerial;
    const bbox = [
      bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()
    ].map((value) => value.toFixed(5)).join(",");
    const includeRoadGeometry = map.getZoom() >= ROAD_DATA_MIN_ZOOM;
    const queryParts = [
      "[out:json][timeout:10];",
      "(",
      'node["highway"="speed_camera"](' + bbox + ");",
      'nwr["man_made"="surveillance"]["surveillance:type"~"^(camera|ALPR)$"]["surveillance:zone"~"^(traffic|road|street|motorway)$"](' + bbox + ");",
      'node["highway"="motorway_junction"](' + bbox + ");"
    ];
    if (includeRoadGeometry) {
      queryParts.push(
        'way["highway"]["width"](' + bbox + ");",
        'way["highway"]["width:effective"](' + bbox + ");",
        'way["highway"]["width:carriageway"](' + bbox + ");",
        'way["highway"]["lanes"](' + bbox + ");",
        'way["highway"]["lanes:forward"](' + bbox + ");",
        'way["highway"]["lanes:backward"](' + bbox + ");"
      );
    }
    queryParts.push(");out center geom tags;");
    const query = queryParts.join("");

    osmOverlayStatus(includeRoadGeometry
      ? "OSM · камеры и размеченная ширина дорог…"
      : "OSM · загрузка камер…");

    osmRequestTimeout = window.setTimeout(() => {
      if (serial === osmRequestSerial && !controller.signal.aborted) controller.abort();
    }, OVERPASS_TIMEOUT_MS);

    try {
      const response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("Overpass HTTP " + response.status);
      const data = await response.json();
      if (controller.signal.aborted || serial !== osmRequestSerial) return;

      const result = buildOsmOverlayFeatures(data);
      const source = map.getSource("wemaps-osm-live");
      if (source) source.setData(result.collection);
      osmCache.set(key, {
        time: Date.now(),
        collection: result.collection,
        cameras: result.cameras,
        junctions: result.junctions,
        measuredWidthRoads: result.measuredWidthRoads,
        laneTaggedRoads: result.laneTaggedRoads
      });
      while (osmCache.size > 24) {
        osmCache.delete(osmCache.keys().next().value);
      }
      osmOverlayStatus(
        "OSM: камеры " + result.cameras +
        " · ширина из OSM " + result.measuredWidthRoads +
        " · полосы " + result.laneTaggedRoads +
        " · съезды " + result.junctions
      );
    } catch (error) {
      if (error.name === "AbortError") {
        if (serial === osmRequestSerial) osmOverlayStatus("OSM · запрос превысил 12 секунд");
        return;
      }
      console.warn("OpenStreetMap live overlays:", error);
      osmOverlayStatus("OSM · источник недоступен, базовая карта работает");
    } finally {
      if (serial === osmRequestSerial && osmRequestTimeout !== null) {
        window.clearTimeout(osmRequestTimeout);
        osmRequestTimeout = null;
      }
    }
  }

  function scheduleOsmOverlayFetch() {
    if (osmRequestTimer !== null) window.clearTimeout(osmRequestTimer);
    osmRequestTimer = window.setTimeout(() => {
      osmRequestTimer = null;
      fetchOsmOverlays();
    }, 1450);
  }

  function refreshRoadWidthExpressions(force = false) {
    if (!map || !layerCache) return;
    const latitude = map.getCenter().lat;
    if (!force && Number.isFinite(lastRoadScaleLatitude)
      && Math.abs(latitude - lastRoadScaleLatitude) < 0.2) return;
    lastRoadScaleLatitude = latitude;

    layerCache.transportation.forEach((layer) => {
      const id = String(layer.id || "").toLowerCase();
      if (/rail|aerialway|ferry|transit|cable/.test(id)) return;
      map.setPaintProperty(layer.id, "line-width", roadWidthExpression(id.includes("casing") ? 1.42 : 1));
    });

    [
      ["wemaps-road-depth-shadow", 1.2, 1.0],
      ["wemaps-bridge-deck-edge", 1.12, 0.9],
      ["wemaps-ramp-highlight", 1.04, 0.2]
    ].forEach(([id, multiplier, extra]) => {
      if (map.getLayer(id)) {
        map.setPaintProperty(id, "line-width", roadWidthExpression(multiplier, extra));
      }
    });
    if (map.getLayer("wemaps-road-lane-outer-left")) {
      map.setPaintProperty("wemaps-road-lane-outer-left", "line-offset", roadWidthExpression(1, 0, -0.25));
    }
    if (map.getLayer("wemaps-road-lane-outer-right")) {
      map.setPaintProperty("wemaps-road-lane-outer-right", "line-offset", roadWidthExpression(1, 0, 0.25));
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
      map.setPaintProperty(layer.id, "fill-extrusion-opacity", currentExtrusionOpacity);
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

    refreshRoadWidthExpressions();

    refreshAdaptiveCamera(false);
  }

  function updateCamera(animate = true) {
    if (!map) return;

    preferredPitch = Number($("#pitch").value);
    const zoom = Number($("#zoom").value);
    $("#zoomValue").textContent = zoom.toFixed(1);

    const automatic2D = getVisibleWidthKm(zoom) > AUTO_2D_WIDTH_KM;
    const targetPitch = automatic2D ? 0 : preferredPitch;

    if (animate) {
      transitionCamera(targetPitch, zoom);
    } else {
      map.jumpTo({ pitch: targetPitch, zoom });
      syncBuildingVisibility(targetPitch < 1, false);
    }

    $("#pitchValue").textContent = automatic2D
      ? "0° · авто"
      : String(Math.round(targetPitch)) + "°";
    $("#view2d").classList.toggle("selected", targetPitch < 1);
    $("#view3d").classList.toggle("selected", targetPitch >= 1);
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
      "wemaps:road-style": "Road class widths, visual depth casing, top sheen, and schematic zoom-gated lane dividers; inferred counts are not surveyed geometry",
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
        activeStyleDefinition = style;
        map.setStyle(style);
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
      const zoom = 15.2;
      $("#zoom").value = zoom;
      $("#pitch").value = DEFAULT_PITCH;
      preferredPitch = DEFAULT_PITCH;
      const targetPitch = getVisibleWidthKm(zoom) > AUTO_2D_WIDTH_KM ? 0 : preferredPitch;
      $("#zoomValue").textContent = zoom.toFixed(1);
      transitionCamera(targetPitch, zoom, { center: CENTER, bearing: -18 });
      saveSettings();
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
      const targetZoom = 15.2;
      const targetPitch = getVisibleWidthKm(targetZoom) > AUTO_2D_WIDTH_KM ? 0 : preferredPitch;
      transitionCamera(targetPitch, targetZoom, { center: CENTER, bearing: -18 });
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
      transformStyle: (_previousStyle, nextStyle) => {
        const transformed = JSON.parse(JSON.stringify(nextStyle));
        transformed.layers = transformed.layers.map((layer) => {
          if (layer.type === "background") {
            layer.paint = Object.assign({}, layer.paint || {}, { "background-color": DEFAULTS.background });
          }
          return layer;
        });
        return transformed;
      },
      center: CENTER,
      zoom: Number($("#zoom").value),
      pitch: 0,
      bearing: -18,
      reduceMotion: false,
      dragPan: {
        linearity: 0.22,
        easing: (t) => t * (2 - t),
        maxSpeed: 1900,
        deceleration: 1450
      },
      maxPitch: 80,
      minZoom: 3,
      maxZoom: 20,
      attributionControl: true,
      renderWorldCopies: false,
      fadeDuration: 420,
      maxTileCacheZoomLevels: 8,
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

    map.on("style.load", () => {
      errorNode.hidden = true;
      styleReady = true;
      styleLoadRetries = 0;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }

      layerCache = null;
      registerVegetationPatterns();
      ensureBuildingLayer();
      ensureForestDetailLayers();
      ensureRoadDepthLayers();
      ensureOsmOverlayLayers();
      refreshLayerCache();
      currentExtrusionOpacity = buildingOpacity;
      applyStyle();
      refreshAdaptiveCamera(false);
      updateBuildingControls();
      updateRoadControls();

      setStatus("Карта загружена · Violet Night");
      scheduleOsmOverlayFetch();
    });

    map.on("zoomend", () => {
      const actualZoom = map.getZoom();
      $("#zoom").value = String(Math.min(19, Math.max(5, actualZoom)));
      $("#zoomValue").textContent = actualZoom.toFixed(1);
      refreshAdaptiveCamera(true);
      saveSettings();
    });

    map.on("resize", () => {
      refreshAdaptiveCamera(false);
      refreshRoadWidthExpressions(true);
    });
    map.on("moveend", () => {
      refreshRoadWidthExpressions(false);
      scheduleOsmOverlayFetch();
    });
    map.on("pitchend", () => refreshAdaptiveCamera(false));

    map.on("error", (event) => {
      const message = event && event.error && event.error.message
        ? event.error.message
        : "Неизвестная ошибка загрузки карты";
      const isTruncated = /Content-Length header of network response exceeds response Body/i.test(message);
      console.warn("MapLibre error:", message);

      if (isTruncated && interruptedResponseRetries < 2 && networkRetryTimer === null) {
        interruptedResponseRetries += 1;
        const attempt = interruptedResponseRetries;
        setStatus("Ответ карты оборвался · повтор " + attempt + "/2");
        networkRetryTimer = window.setTimeout(() => {
          networkRetryTimer = null;
          if (!map) return;
          try {
            map.setStyle(activeStyleDefinition, { diff: false });
          } catch (retryError) {
            console.warn("Interrupted response retry failed:", retryError);
          }
        }, 900 * attempt);
        return;
      }

      if (!styleReady && styleLoadRetries < 3 && retryTimer === null) {
        styleLoadRetries += 1;
        const attempt = styleLoadRetries;
        setStatus("Повторная загрузка карты · " + attempt + "/3");
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          if (!styleReady && map) {
            try {
              map.setStyle(activeStyleDefinition, { diff: false });
            } catch (retryError) {
              console.warn("Map style retry failed:", retryError);
            }
          }
        }, 700 * attempt);
        return;
      }

      if (isTruncated) {
        showError(
          "Ответ карты снова оборвался: браузер получил меньше данных, чем указано в Content-Length. " +
          "Автоматические повторы не помогли. Это сетевая ошибка загрузки OpenFreeMap, а не ошибка цветовой темы. " +
          "Обнови страницу или проверь работу через другое соединение. Подробности: " + message
        );
      } else if (!styleReady) {
        showError(
          "Не удалось загрузить стиль карты после нескольких попыток. " +
          "Проверь интернет-соединение. Источник данных: OpenFreeMap. Подробности: " + message
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