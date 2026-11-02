(() => {
  "use strict";

  const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  const CENTER = [13.405, 52.52];
  const DEFAULTS = {
    background:"#100d18", residential:"#191424", park:"#19291f", water:"#142135",
    minor:"#655b7a", local:"#80709f", secondary:"#a18bc9", primary:"#b99ceb",
    trunk:"#c8a9eb", motorway:"#d1b7ff", casing:"#30243f",
    buildingRoof:"#3a2e50", buildingOutline:"#29213b"
  };
  const PRESETS = {
    violet:{...DEFAULTS},
    deep:{...DEFAULTS,background:"#090711",residential:"#13101d",park:"#14221d",water:"#101a2a",minor:"#514665",local:"#695982",secondary:"#806a9e",primary:"#987cba",trunk:"#aa8bcf",motorway:"#c2a1eb",casing:"#21192e",buildingRoof:"#2d2440",buildingOutline:"#211a30"},
    neon:{...DEFAULTS,background:"#100b19",residential:"#1b1428",park:"#18271f",water:"#132038",minor:"#765e91",local:"#9471b7",secondary:"#aa7ed2",primary:"#c18bea",trunk:"#ce96f4",motorway:"#e3b4ff",casing:"#392348",buildingRoof:"#49305e",buildingOutline:"#2c203d"}
  };
  const STORAGE_KEY = "wemaps.violet-night.style-lab.v1";
  const $ = (selector) => document.querySelector(selector);
  const colorInputs = [...document.querySelectorAll("[data-color]")];
  const statusNode = $("#mapStatus");
  const errorNode = $("#mapError");
  let map = null;
  let buildingsVisible = true;
  let buildingOpacity = 0.92;
  let buildingHeightScale = 1;

  function setStatus(text) { statusNode.textContent = text; }
  function showError(message) {
    errorNode.hidden = false;
    errorNode.textContent = message;
    setStatus("Ошибка загрузки");
  }
  function readPalette() {
    return Object.fromEntries(colorInputs.map((input) => [input.dataset.color,input.value.toLowerCase()]));
  }
  function updateColorLabels() {
    colorInputs.forEach((input) => {
      const value = input.value.toUpperCase();
      const code = input.parentElement.querySelector("code");
      const swatch = input.parentElement.querySelector(".swatch");
      if (code) code.textContent = value;
      if (swatch) swatch.style.setProperty("--swatch",value);
    });
  }
  function setPalette(palette) {
    colorInputs.forEach((input) => {
      if (palette[input.dataset.color]) input.value = palette[input.dataset.color];
    });
    updateColorLabels();
    applyStyle();
    saveSettings();
  }
  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify({
        palette:readPalette(),buildingOpacity:buildingOpacity,buildingHeightScale:buildingHeightScale,
        pitch:Number($("#pitch").value),zoom:Number($("#zoom").value)
      }));
    } catch (error) { console.warn("Could not save style-lab settings:",error); }
  }
  function restoreSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return;
      if (saved.palette) colorInputs.forEach((input) => {
        const value = saved.palette[input.dataset.color];
        if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) input.value = value;
      });
      if (Number.isFinite(saved.buildingOpacity)) {
        buildingOpacity = Math.min(1,Math.max(.35,saved.buildingOpacity));
        $("#buildingOpacity").value = Math.round(buildingOpacity*100);
      }
      if (Number.isFinite(saved.buildingHeightScale)) {
        buildingHeightScale = Math.min(1.8,Math.max(.6,saved.buildingHeightScale));
        $("#buildingHeight").value = Math.round(buildingHeightScale*100);
      }
      if (Number.isFinite(saved.pitch)) $("#pitch").value = Math.min(75,Math.max(35,saved.pitch));
      if (Number.isFinite(saved.zoom)) $("#zoom").value = Math.min(19,Math.max(5,saved.zoom));
    } catch (error) { console.warn("Saved settings could not be read:",error); }
  }
  function layerText(layer) {
    return String(layer.id || "") + " " + String(layer["source-layer"] || "") + " " + JSON.stringify(layer.filter || []);
  }
  function roadColor(layer,palette) {
    const text = layerText(layer).toLowerCase();
    if (text.includes("motorway")) return palette.motorway;
    if (text.includes("trunk")) return palette.trunk;
    if (text.includes("primary")) return palette.primary;
    if (text.includes("secondary")) return palette.secondary;
    if (text.includes("tertiary")) return palette.local;
    if (text.includes("residential") || text.includes("living_street") || text.includes("street")) return palette.local;
    if (text.includes("pedestrian") || text.includes("path") || text.includes("track") || text.includes("service")) return palette.minor;
    return palette.minor;
  }
  function findExtrusionLayers() {
    if (!map) return [];
    return map.getStyle().layers.filter((layer) => layer.type === "fill-extrusion");
  }
  function ensureBuildingLayer() {
    if (!map || findExtrusionLayers().length) return;
    const style = map.getStyle();
    const sourceId = Object.keys(style.sources || {}).find((id) => {
      const source = style.sources[id];
      return source.type === "vector" && (id === "openmaptiles" || String(source.url || "").includes("openfreemap"));
    });
    if (!sourceId) return;
    const footprint = style.layers.find((layer) => layer["source-layer"] === "building" && layer.type === "fill");
    if (!footprint) return;
    const footprintIndex = style.layers.findIndex((layer) => layer.id === footprint.id);
    const nextLayer = style.layers[footprintIndex + 1];
    map.addLayer({
      id:"wemaps-building-3d",type:"fill-extrusion",source:sourceId,"source-layer":"building",minzoom:14,
      paint:{
        "fill-extrusion-base":["coalesce",["get","render_min_height"],0],
        "fill-extrusion-height":["coalesce",["get","render_height"],9],
        "fill-extrusion-color":readPalette().buildingRoof,
        "fill-extrusion-opacity":buildingOpacity,
        "fill-extrusion-vertical-gradient":true
      }
    },nextLayer ? nextLayer.id : undefined);
  }
  function applyStyle() {
    if (!map || !map.isStyleLoaded()) return;
    const palette = readPalette();
    const layers = map.getStyle().layers;
    layers.forEach((layer) => {
      try {
        const sourceLayer = String(layer["source-layer"] || "").toLowerCase();
        const id = String(layer.id || "").toLowerCase();
        if (layer.type === "background") {
          map.setPaintProperty(layer.id,"background-color",palette.background);
          return;
        }
        if (sourceLayer === "transportation" && layer.type === "line") {
          map.setPaintProperty(layer.id,"line-color",id.includes("casing") ? palette.casing : roadColor(layer,palette));
          return;
        }
        if (sourceLayer === "water" && layer.type === "fill") {
          map.setPaintProperty(layer.id,"fill-color",palette.water);
          return;
        }
        if (sourceLayer === "waterway" && layer.type === "line") {
          map.setPaintProperty(layer.id,"line-color",palette.water);
          return;
        }
        if (layer.type === "fill" && sourceLayer === "park") {
          map.setPaintProperty(layer.id,"fill-color",palette.park);
          map.setPaintProperty(layer.id,"fill-outline-color",palette.park);
          return;
        }
        if (layer.type === "fill" && sourceLayer === "landcover") {
          if (/wood|forest|grass|park|scrub|heath/.test(layerText(layer).toLowerCase())) {
            map.setPaintProperty(layer.id,"fill-color",palette.park);
          }
          return;
        }
        if (layer.type === "fill" && sourceLayer === "landuse") {
          const text = layerText(layer).toLowerCase();
          if (/residential|commercial|industrial|retail/.test(text)) {
            map.setPaintProperty(layer.id,"fill-color",palette.residential);
          } else if (/park|garden|grass|forest|wood|pitch|village_green/.test(text)) {
            map.setPaintProperty(layer.id,"fill-color",palette.park);
          }
          return;
        }
        if (layer.type === "fill" && sourceLayer === "building") {
          map.setPaintProperty(layer.id,"fill-color",palette.buildingOutline);
          map.setPaintProperty(layer.id,"fill-outline-color",palette.buildingRoof);
          return;
        }
        if (layer.type === "fill-extrusion") {
          map.setPaintProperty(layer.id,"fill-extrusion-color",palette.buildingRoof);
          map.setPaintProperty(layer.id,"fill-extrusion-opacity",buildingOpacity);
          map.setPaintProperty(layer.id,"fill-extrusion-height",["*",["coalesce",["get","render_height"],9],buildingHeightScale]);
          map.setPaintProperty(layer.id,"fill-extrusion-base",["*",["coalesce",["get","render_min_height"],0],buildingHeightScale]);
          map.setPaintProperty(layer.id,"fill-extrusion-vertical-gradient",true);
          return;
        }
        if (layer.type === "symbol" && layer.layout && layer.layout["text-field"] !== undefined) {
          map.setPaintProperty(layer.id,"text-color","#e8def4");
          map.setPaintProperty(layer.id,"text-halo-color",palette.background);
          map.setPaintProperty(layer.id,"text-halo-width",1.15);
          map.setPaintProperty(layer.id,"text-halo-blur",0.35);
        }
      } catch (error) {
        console.debug("Skipped unsupported style property on layer",layer.id,error);
      }
    });
    if (buildingsVisible) ensureBuildingLayer();
    findExtrusionLayers().forEach((layer) => {
      map.setLayoutProperty(layer.id,"visibility",buildingsVisible ? "visible" : "none");
    });
    setStatus("Карта загружена · стиль применён");
  }
  function updateCamera() {
    if (!map) return;
    const pitch = Number($("#pitch").value);
    const zoom = Number($("#zoom").value);
    $("#pitchValue").textContent = String(pitch) + "°";
    $("#zoomValue").textContent = zoom.toFixed(1);
    map.easeTo({pitch:pitch,zoom:zoom,duration:250});
    saveSettings();
    $("#view2d").classList.toggle("selected",pitch < 10);
    $("#view3d").classList.toggle("selected",pitch >= 10);
  }
  function updateBuildingControls() {
    $("#buildingOpacityValue").textContent = String(Math.round(buildingOpacity*100)) + "%";
    $("#buildingHeightValue").textContent = buildingHeightScale.toFixed(1) + "×";
  }
  function downloadJson() {
    if (!map) return;
    const style = map.getStyle();
    style.name = "Wemaps Violet Night";
    style.metadata = Object.assign({},style.metadata || {},{
      "wemaps:style":"Violet Night",
      "wemaps:prototype":"Local Map Style Lab",
      "wemaps:export-note":"Review provider terms and attribution before production use."
    });
    const blob = new Blob([JSON.stringify(style,null,2)],{type:"application/json"});
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
        map.once("style.load",() => {
          ensureBuildingLayer();
          applyStyle();
          setStatus("Импортированный стиль загружен");
        });
      } catch (error) { showError("Не удалось импортировать стиль: " + error.message); }
    };
    reader.onerror = () => showError("Не удалось прочитать выбранный JSON-файл.");
    reader.readAsText(file);
  }
  function bindControls() {
    colorInputs.forEach((input) => input.addEventListener("input",() => {
      updateColorLabels();
      applyStyle();
      saveSettings();
      document.querySelectorAll(".preset").forEach((button) => button.classList.remove("active"));
    }));
    $("#buildingOpacity").addEventListener("input",(event) => {
      buildingOpacity = Number(event.target.value)/100;
      updateBuildingControls(); applyStyle(); saveSettings();
    });
    $("#buildingHeight").addEventListener("input",(event) => {
      buildingHeightScale = Number(event.target.value)/100;
      updateBuildingControls(); applyStyle(); saveSettings();
    });
    $("#pitch").addEventListener("input",updateCamera);
    $("#zoom").addEventListener("input",updateCamera);
    document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click",() => {
      setPalette(PRESETS[button.dataset.preset]);
      document.querySelectorAll(".preset").forEach((item) => item.classList.toggle("active",item === button));
    }));
    $("#resetStyle").addEventListener("click",() => {
      setPalette(DEFAULTS);
      document.querySelectorAll(".preset").forEach((item) => item.classList.toggle("active",item.dataset.preset === "violet"));
    });
    $("#resetCamera").addEventListener("click",() => {
      $("#pitch").value = 58; $("#zoom").value = 15.2; updateCamera();
      map.easeTo({center:CENTER,bearing:-18,duration:500});
    });
    $("#toggleBuildings").addEventListener("click",() => {
      buildingsVisible = !buildingsVisible;
      $("#toggleBuildings").textContent = "3D: " + (buildingsVisible ? "включено" : "выключено");
      applyStyle();
    });
    $("#view2d").addEventListener("click",() => { $("#pitch").value = 0; updateCamera(); });
    $("#view3d").addEventListener("click",() => { $("#pitch").value = 58; updateCamera(); });
    $("#recenter").addEventListener("click",() => map.easeTo({center:CENTER,zoom:15.2,pitch:Number($("#pitch").value),bearing:-18,duration:550}));
    $("#exportStyle").addEventListener("click",downloadJson);
    $("#importStyle").addEventListener("click",() => $("#styleFile").click());
    $("#styleFile").addEventListener("change",(event) => {
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
      container:"map",style:STYLE_URL,center:CENTER,zoom:Number($("#zoom").value),
      pitch:Number($("#pitch").value),bearing:-18,maxPitch:80,minZoom:3,maxZoom:20,
      attributionControl:true,renderWorldCopies:false,
      canvasContextAttributes:{antialias:true}
    });
    map.addControl(new maplibregl.NavigationControl({showCompass:true,showZoom:true,visualizePitch:true}),"top-right");
    map.addControl(new maplibregl.ScaleControl({unit:"metric"}),"bottom-right");
    map.once("load",() => {
      errorNode.hidden = true;
      ensureBuildingLayer();
      applyStyle();
      updateCamera();
      updateBuildingControls();
    });
    map.on("error",(event) => {
      const message = event && event.error && event.error.message ? event.error.message : "Неизвестная ошибка загрузки карты";
      console.warn("MapLibre error:",message);
      if (!map.loaded()) showError("Не удалось загрузить карту. Проверь интернет-соединение. Источник данных: OpenFreeMap. Подробности: " + message);
    });
  }
  restoreSettings();
  updateColorLabels();
  updateBuildingControls();
  bindControls();
  initMap();
})();