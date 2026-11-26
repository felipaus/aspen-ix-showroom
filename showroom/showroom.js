// Showroom virtual: intro → vuelo sobre San Juan → el edificio se levanta → pisos y unidades.

const START_VIEW = { center: [-65.5, -34.5], zoom: 3.3, pitch: 0, bearing: 0 };
const FINAL_VIEW = { zoom: 17.7, pitch: 60, bearing: -35 };
const FLY_TO_CITY_MS = 5500;
const FLY_TO_LOT_MS = 5000;
const RISE_MS = 2600;
const INTRO_TOTAL_MS = FLY_TO_CITY_MS + FLY_TO_LOT_MS + RISE_MS;

// Vista "desde arriba" al elegir un piso: los pisos de encima se levantan y desaparecen.
const CUTAWAY_VIEW = { pitch: 40, bearing: 0 };
// Medido: a zoom 19.4 la planta ocupa ~600×264 px en pantalla. Con eso se calcula el zoom para el espacio libre.
const CUTAWAY_REF = { zoom: 19.4, width: 600, height: 264 };
const LIFT_MS = 900;
const LIFT_METERS = 70;

// Edificios de la ciudad: blancos y casi sólidos. Translúcidos se veían "fantasma" y se transparentaban a través de la torre.
const CITY_COLOR = "#f2efe9";
const CITY_OPACITY = 0.92;
const CITY_LAYERS = ["city-buildings", "near-buildings"];
const NEAR_BUILDINGS_ZOOM = 16;

// Elevación de Mapzen/Tilezen en AWS Open Data: gratis, sin clave y con CORS abierto.
const TERRAIN_SOURCE = {
  type: "raster-dem",
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  encoding: "terrarium", // si no se aclara, MapLibre asume "mapbox" y el relieve sale con ruido
  tileSize: 256,
  maxzoom: 14,
  attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Elevación: Mapzen, AWS</a>',
};
const TERRAIN = { source: "terrain", exaggeration: 1 };

const STATUS_COLORS = { disponible: "#3a9a6e", reservada: "#d9a23a", vendida: "#9a9a9a" };
const STATUS_HOVER_COLORS = { disponible: "#62c796", reservada: "#f2c063", vendida: "#c2c2c2" };

// Departamentos en la planta del piso (coordenadas del SVG del panel, 340×220). El mapa usa las mismas.
const PLAN = { x: 10, y: 10, width: 320, height: 200 };
const UNIT_BOXES = { A: [10, 10, 175, 100], B: [185, 10, 145, 100], C: [200, 110, 130, 100], D: [10, 110, 190, 100] };
const CORE_BOX = [160, 90, 40, 40];
const STATUS_LABELS = { disponible: "Disponible", reservada: "Reservada", vendida: "Vendida" };
const INTERACTION_HANDLERS = ["scrollZoom", "boxZoom", "dragRotate", "dragPan", "keyboard", "doubleClickZoom", "touchZoomRotate"];

const $ = (id) => document.getElementById(id);

// Implantación (data.js). Si no está, el showroom muestra la torre como siempre.
const sitePlan = typeof SITE_PLAN === "undefined" ? null : SITE_PLAN;
const TOWER_LAYERS = ["lot-fill", "lot-line", "project-floors", "floor-units"];
// Intro con implantación: llega al lote en perspectiva, marca las calles y el terreno, y baja a la vista desde arriba.
const LOT_VIEW = { zoom: 16.9, pitch: 50 };
const MARK_STREETS_MS = 2200; // las calles se dibujan desde el lote hacia afuera
const DRAW_LOT_MS = 1800;
const LOT_FILL_MS = 500;
const TOP_DOWN_MS = 2600;
const PLAN_FADE_MS = 1800; // la imagen aparece mientras la cámara termina de bajar
const LOT_FILL_OPACITY = 0.18;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let streetsDrawing = []; // tramos de calle listos para dibujarse de a poco (prepareStreets)
const NO_TRANSITION = { duration: 0, delay: 0 }; // ver el comentario de la capa "site-plan"
let streetLabels = [];
let amenitiesPin = null;
let introDone = false;
let planViewOn = false;
let currentPlanFloor = null;
let gallery = null; // lo que muestra el visor: { title, items, index }
let unitViewOpen = false; // hay un departamento o la pileta a pantalla completa
let openUnitId = null; // el departamento abierto (null si es la pileta)

let map;
let skipped = false;
let orbiting = false;
let hoveredFloor = null;
let selectedFloor = null;
let cutFloor = null;
let liftFrame = null;
let hoveredUnit = null;

document.addEventListener("DOMContentLoaded", () => {
  $("project-name").textContent = PROJECT.name;
  $("project-tagline").textContent = PROJECT.tagline;
  $("intro-name").textContent = PROJECT.name;
  $("intro-tagline").textContent = PROJECT.tagline;
  if (PROJECT.cover) $("intro").style.setProperty("--intro-bg", `url("${PROJECT.cover}")`);
  initMap();
  initUi();
});

// ---------- Mapa ----------

function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Imágenes © Esri, Maxar, Earthstar Geographics",
        },
        openmaptiles: {
          type: "vector",
          url: "https://tiles.openfreemap.org/planet",
          attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
        // Relieve real (gratis, sin clave): la Sierra Chica de Zonda y la Precordillera alrededor del valle.
        // Dos fuentes con los mismos datos: MapLibre recomienda no compartir una entre terreno y sombreado.
        terrain: TERRAIN_SOURCE,
        hillshade: TERRAIN_SOURCE,
        // Edificios de OSM a 1 km del lote, uno por uno y sin los que tocan el lote (tools/edificios_osm.py).
        "near-buildings": {
          type: "geojson",
          data: "buildings.geojson",
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      },
      terrain: TERRAIN,
      sky: {
        "sky-color": "#7fb3e0",
        "horizon-color": "#e9dcc6",
        "fog-color": "#e9dcc6",
        "sky-horizon-blend": 0.6,
        "horizon-fog-blend": 0.7,
        "fog-ground-blend": 0.85,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 12, 0.6, 16, 0],
      },
      layers: [
        { id: "satellite", type: "raster", source: "satellite" },
        {
          id: "hillshade",
          type: "hillshade",
          source: "hillshade",
          paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#3b2f22", "hillshade-highlight-color": "#fff6e6" },
        },
        // De lejos: edificios del mapa base. Vienen agrupados, así que no se puede quitar el que cae sobre el lote;
        // por eso de cerca (zoom 16+) los reemplaza "near-buildings".
        {
          id: "city-buildings",
          type: "fill-extrusion",
          source: "openmaptiles",
          "source-layer": "building",
          minzoom: 14,
          maxzoom: NEAR_BUILDINGS_ZOOM,
          paint: {
            "fill-extrusion-color": CITY_COLOR,
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": CITY_OPACITY,
          },
        },
        {
          id: "near-buildings",
          type: "fill-extrusion",
          source: "near-buildings",
          minzoom: NEAR_BUILDINGS_ZOOM,
          paint: {
            "fill-extrusion-color": CITY_COLOR,
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "min_height"],
            "fill-extrusion-opacity": CITY_OPACITY,
          },
        },
      ],
    },
    ...START_VIEW,
    attributionControl: { compact: true },
    maxPitch: 75,
  });

  INTERACTION_HANDLERS.forEach((h) => map[h].disable());

  map.on("load", () => {
    map.addSource("lot", { type: "geojson", data: lotFeature() });
    map.addLayer({ id: "lot-fill", type: "fill", source: "lot", paint: { "fill-color": "#c08a2d", "fill-opacity": 0.35 } }, "city-buildings");
    map.addLayer({ id: "lot-line", type: "line", source: "lot", paint: { "line-color": "#f3c76a", "line-width": 2 } }, "city-buildings");

    map.addSource("project", { type: "geojson", data: buildingFeatures(0) });
    map.addLayer({
      id: "project-floors",
      type: "fill-extrusion",
      source: "project",
      paint: {
        "fill-extrusion-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false], "#c08a2d",
          ["boolean", ["feature-state", "hover"], false], "#2f6f5e",
          ["==", ["get", "kind"], "lobby"], "#3b3f3c",
          ["==", ["get", "kind"], "roof"], "#2b2b2b",
          "#f1ebe1",
        ],
        "fill-extrusion-height": ["get", "top"],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-opacity": 0.97,
      },
    }, "city-buildings"); // antes que los edificios de la ciudad

    // Departamentos del piso abierto, vistos desde arriba.
    map.addSource("floor-units", { type: "geojson", data: floorUnitsFeatures(null), promoteId: "id" });
    map.addLayer({
      id: "floor-units",
      type: "fill-extrusion",
      source: "floor-units",
      paint: {
        "fill-extrusion-color": [
          "case",
          ["==", ["get", "kind"], "slab"], "#ddd5c8",
          ["==", ["get", "kind"], "core"], "#3b3f3c",
          ["boolean", ["feature-state", "hover"], false], statusColor(STATUS_HOVER_COLORS),
          statusColor(STATUS_COLORS),
        ],
        "fill-extrusion-height": ["get", "top"],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-opacity": 0.97,
      },
    }, "city-buildings");

    // Un departamento tapa al piso de abajo: si el puntero está sobre uno, el piso no reacciona.
    const overUnit = (e) => map.queryRenderedFeatures(e.point, { layers: ["floor-units"] }).length > 0;

    map.on("mousemove", "project-floors", (e) => {
      if (overUnit(e)) return;
      const f = e.features[0];
      if (f.properties.kind !== "floor") return clearHover();
      setHover(f.id);
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "project-floors", () => {
      clearHover();
      map.getCanvas().style.cursor = "";
    });
    map.on("click", "project-floors", (e) => {
      if (overUnit(e)) return;
      const f = e.features[0];
      if (f.properties.kind === "floor") openFloor(f.id);
    });

    map.on("mousemove", "floor-units", (e) => {
      const f = e.features.find((x) => x.properties.kind === "unit");
      if (!f) return clearUnitHover();
      clearHover();
      setUnitHover(f.properties.id, e.originalEvent);
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "floor-units", () => {
      clearUnitHover();
      map.getCanvas().style.cursor = "";
    });
    map.on("click", "floor-units", (e) => {
      const f = e.features.find((x) => x.properties.kind === "unit");
      if (f) openUnit(f.properties.id);
    });

    if (sitePlan) {
      // Arranca invisible y aparece al llegar al lote (fadeInSitePlan). Va debajo de los edificios de la ciudad.
      // Sin transición en la opacidad: con relieve, MapLibre redibuja la imagen sobre el terreno solo cuando cambia el
      // estilo, así que con la transición de 300 ms por defecto quedaba congelada a medio aparecer (semitransparente).
      // Calles marcadas (debajo de la imagen, que tapa el tramo que ya dibuja).
      const streetNames = ["in", ["get", "name"], ["literal", sitePlan.streets.map((s) => s.name)]];
      // Arranca vacía: markStreets la va llenando para que las calles se dibujen de a poco.
      map.addSource("streets", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "streets-glow", type: "line", source: "streets", filter: streetNames,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f3c76a", "line-width": 22, "line-blur": 10, "line-opacity": 0.55 },
      }, "city-buildings");
      map.addLayer({
        id: "streets-line", type: "line", source: "streets", filter: streetNames,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#fff6e6", "line-width": 6 },
      }, "city-buildings");
      fetch("streets.geojson")
        .then((r) => r.json())
        .then((data) => {
          streetsDrawing = prepareStreets(data);
          streetLabels = addStreetLabels(data);
          if (skipped) showSitePlanFinal(); // se omitió la intro antes de que llegaran las calles
        });

      map.addSource("site-plan", { type: "image", url: sitePlan.image, coordinates: sitePlanCorners() });
      map.addLayer(
        {
          id: "site-plan",
          type: "raster",
          source: "site-plan",
          paint: { "raster-opacity": 0, "raster-opacity-transition": NO_TRANSITION, "raster-fade-duration": 0 },
        },
        "city-buildings"
      );

      // Terreno: rectángulo de la implantación, alineado con la calle. El borde se dibuja de a poco (drawLot).
      map.addSource("plan-lot", { type: "geojson", data: { type: "Feature", geometry: { type: "Polygon", coordinates: [lotRing()] }, properties: {} } });
      map.addSource("plan-lot-outline", { type: "geojson", data: lotOutline(0) });
      map.addLayer({
        id: "plan-lot-fill", type: "fill", source: "plan-lot",
        paint: { "fill-color": "#c08a2d", "fill-opacity": 0, "fill-opacity-transition": NO_TRANSITION },
      }, "city-buildings");
      map.addLayer({
        id: "plan-lot-line", type: "line", source: "plan-lot-outline",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#f3c76a", "line-width": 3 },
      }, "city-buildings");

      TOWER_LAYERS.forEach((id) => map.setLayoutProperty(id, "visibility", "none"));

      if (sitePlan.amenities) {
        amenitiesPin = addAmenitiesPin();
        map.on("mousemove", (e) => {
          if (introDone) map.getCanvas().style.cursor = onPool(e.lngLat) ? "pointer" : "";
        });
        map.on("click", (e) => {
          if (!introDone || e.originalEvent.target.closest?.(".amenities-pin")) return;
          amenitiesPin.getElement().hidden = !onPool(e.lngLat);
        });
      }
    }
  });

  // Cualquier interacción del usuario corta la rotación automática.
  ["mousedown", "touchstart", "wheel"].forEach((ev) =>
    map.getCanvasContainer().addEventListener(ev, () => (orbiting = false), { passive: true })
  );

  startLoadingProgress();
}

// Rectángulo del lote alrededor del centro, en metros → grados.
function footprint(insetMeters = 0) {
  const [lng, lat] = PROJECT.center;
  const mPerDegLat = 110_950;
  const mPerDegLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  const dx = (PROJECT.widthMeters / 2 - insetMeters) / mPerDegLng;
  const dy = (PROJECT.depthMeters / 2 - insetMeters) / mPerDegLat;
  return [[
    [lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy], [lng - dx, lat - dy],
  ]];
}

// Ejes de la implantación en metros: `up` apunta al borde de arriba de la imagen y `right` 90° a su derecha ([este, norte]).
function sitePlanAxes() {
  const b = (sitePlan.topBearing * Math.PI) / 180;
  return {
    up: [Math.sin(b), Math.cos(b)],
    right: [Math.cos(b), -Math.sin(b)],
    mPerDegLat: 110_950,
    mPerDegLng: 111_320 * Math.cos((sitePlan.center[1] * Math.PI) / 180),
  };
}

// Punto del mapa que corresponde a (x, y) de la imagen, en fracción (0 a 1) desde arriba a la izquierda.
function sitePlanPoint(x, y) {
  const { up, right, mPerDegLat, mPerDegLng } = sitePlanAxes();
  const across = (x - 0.5) * sitePlan.widthMeters;
  const along = (0.5 - y) * sitePlan.heightMeters;
  const [lng, lat] = sitePlan.center;
  return [
    lng + (across * right[0] + along * up[0]) / mPerDegLng,
    lat + (across * right[1] + along * up[1]) / mPerDegLat,
  ];
}

// Lo inverso: en qué lugar de la imagen (fracción 0 a 1) cae un punto del mapa.
function sitePlanFraction({ lng, lat }) {
  const { up, right, mPerDegLat, mPerDegLng } = sitePlanAxes();
  const dx = (lng - sitePlan.center[0]) * mPerDegLng;
  const dy = (lat - sitePlan.center[1]) * mPerDegLat;
  return {
    x: 0.5 + (dx * right[0] + dy * right[1]) / sitePlan.widthMeters,
    y: 0.5 - (dx * up[0] + dy * up[1]) / sitePlan.heightMeters,
  };
}

// Esquinas de la implantación en el orden que pide la fuente "image": arriba-izq, arriba-der, abajo-der, abajo-izq.
function sitePlanCorners() {
  return [sitePlanPoint(0, 0), sitePlanPoint(1, 0), sitePlanPoint(1, 1), sitePlanPoint(0, 1)];
}

// ¿El punto del mapa cae sobre la pileta? (con un margen chico para que sea fácil de tocar)
function onPool(lngLat) {
  const pool = sitePlan?.amenities?.pool;
  if (!pool) return false;
  const { x, y } = sitePlanFraction(lngLat);
  const m = 0.01;
  return x >= pool.x[0] - m && x <= pool.x[1] + m && y >= pool.y[0] - m && y <= pool.y[1] + m;
}

// Botón "Amenities" sobre la pileta: aparece al tocarla y abre la imagen.
function addAmenitiesPin() {
  const { pool, label } = sitePlan.amenities;
  const el = document.createElement("button");
  el.className = "amenities-pin glass";
  el.textContent = `${label} · Ver ›`;
  el.hidden = true;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    el.hidden = true;
    openAmenities();
  });
  const at = sitePlanPoint((pool.x[0] + pool.x[1]) / 2, pool.y[0]);
  return new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -6] }).setLngLat(at).addTo(map);
}

// Contorno cerrado del terreno (mismas esquinas que la imagen).
function lotRing() {
  const corners = sitePlanCorners();
  return [...corners, corners[0]];
}

// El contorno recorrido hasta `fraction` (0 a 1) del perímetro, para dibujarlo de a poco.
function lotOutline(fraction) {
  const ring = lotRing();
  const sides = [sitePlan.widthMeters, sitePlan.heightMeters, sitePlan.widthMeters, sitePlan.heightMeters];
  let left = fraction * sides.reduce((a, b) => a + b, 0);
  const coords = [ring[0]];
  for (let i = 0; i < 4 && left > 0; i++) {
    const t = Math.min(1, left / sides[i]);
    const [a, b] = [ring[i], ring[i + 1]];
    coords.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    left -= sides[i];
  }
  if (coords.length < 2) coords.push(ring[0]);
  return { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} };
}

// Carteles con el nombre de cada calle, en un punto a 75 m o más del centro para no tapar el terreno.
// Distancia en metros desde el centro de la implantación (o entre dos puntos [lng, lat]).
function metersBetween([lngA, latA], [lngB, latB] = sitePlan.center) {
  const mPerDegLng = 111_320 * Math.cos((sitePlan.center[1] * Math.PI) / 180);
  return Math.hypot((lngA - lngB) * mPerDegLng, (latA - latB) * 110_950);
}

// Cada tramo de calle se dibuja desde su punto más cercano al lote hacia los dos lados. `reach` es a qué distancia
// del lote (yendo por la calle) queda cada vértice; las calles más lejanas, como Libertador, empiezan después.
function prepareStreets(data) {
  const names = new Set(sitePlan.streets.map((s) => s.name));
  return data.features
    .filter((f) => names.has(f.properties.name))
    .map((f) => {
      const pts = f.geometry.coordinates;
      const near = pts.reduce((best, p, i) => (metersBetween(p) < metersBetween(pts[best]) ? i : best), 0);
      const reach = new Array(pts.length);
      reach[near] = metersBetween(pts[near]);
      for (let i = near + 1; i < pts.length; i++) reach[i] = reach[i - 1] + metersBetween(pts[i], pts[i - 1]);
      for (let i = near - 1; i >= 0; i--) reach[i] = reach[i + 1] + metersBetween(pts[i], pts[i + 1]);
      return { name: f.properties.name, pts, near, reach };
    });
}

// Las calles dibujadas hasta `distance` metros desde el lote.
function streetsUpTo(distance) {
  const features = [];
  for (const { name, pts, near, reach } of streetsDrawing) {
    if (reach[near] > distance) continue;
    let lo = near;
    let hi = near;
    while (lo > 0 && reach[lo - 1] <= distance) lo--;
    while (hi < pts.length - 1 && reach[hi + 1] <= distance) hi++;
    const coordinates = pts.slice(lo, hi + 1);
    if (coordinates.length < 2) coordinates.push(coordinates[0]);
    features.push({ type: "Feature", properties: { name }, geometry: { type: "LineString", coordinates } });
  }
  return { type: "FeatureCollection", features };
}

// Carteles con el nombre de cada calle, en un punto a 75 m o más del centro para no tapar el terreno.
// `start` es a qué distancia empieza a dibujarse esa calle: el cartel aparece en ese momento.
function addStreetLabels(data) {
  return sitePlan.streets
    .map(({ name, label }) => {
      const points = data.features.filter((f) => f.properties.name === name).flatMap((f) => f.geometry.coordinates);
      if (!points.length) return null;
      const far = points.filter((p) => metersBetween(p) >= 75);
      const at = (far.length ? far : points).reduce((a, b) => (metersBetween(a) <= metersBetween(b) ? a : b));
      // MapLibre maneja la opacidad del elemento del marcador (y la baja si lo cree tapado por el relieve):
      // el cartel visible va adentro, así su fundido no se pisa.
      const el = document.createElement("div");
      el.innerHTML = `<span class="street-label glass"></span>`;
      el.firstChild.textContent = label;
      const start = Math.min(...points.map((p) => metersBetween(p)));
      const marker = new maplibregl.Marker({ element: el, opacity: "1", opacityWhenCovered: "1" }).setLngLat(at).addTo(map);
      return { marker, start };
    })
    .filter(Boolean);
}

// Vista al terminar la intro: la torre en perspectiva o, con implantación, desde arriba y con la imagen derecha.
// Con implantación, la cámara queda exactamente como la vista a pantalla completa: la imagen del mismo tamaño y en
// el mismo lugar (el `padding` deja el centro donde queda el centro de .plan-stage), así el paso no tiene salto.
// La altura de la cámara tiene que ser la del relieve real bajo la imagen: con otra, la imagen se ve más chica o
// más grande que lo que dice el zoom.
function finalView() {
  if (!sitePlan) return { center: PROJECT.center, ...FINAL_VIEW };
  return {
    center: sitePlan.center,
    zoom: sitePlanZoom(),
    pitch: 0,
    bearing: sitePlan.topBearing,
    elevation: map.queryTerrainElevation(sitePlan.center) ?? PROJECT.groundElevation,
    padding: PLAN_VIEW_PADDING,
  };
}

// Márgenes de .plan-view (arriba la barra, abajo el selector de planta).
const PLAN_VIEW_PADDING = { top: 76, bottom: 84, left: 16, right: 16 };
const isPhone = () => window.matchMedia("(max-width: 760px)").matches;

// Ancho de la imagen en la vista a pantalla completa (.plan-stage). En el celular es más ancha que la pantalla
// (se desliza) y arranca centrada.
function planStageWidth() {
  const ratio = sitePlan.widthMeters / sitePlan.heightMeters;
  return isPhone() ? (window.innerHeight - 168) * ratio : Math.min(window.innerWidth - 32, (window.innerHeight - 160) * ratio);
}

function sitePlanZoom() {
  const metersPerPixelAtZoom0 = (40_075_016.7 * Math.cos((sitePlan.center[1] * Math.PI) / 180)) / 512;
  return Math.log2(metersPerPixelAtZoom0 / (sitePlan.widthMeters / planStageWidth()));
}

function lotFeature() {
  return { type: "Feature", geometry: { type: "Polygon", coordinates: footprint(-4) }, properties: {} };
}

// Un feature por piso (id = número de piso) para poder resaltarlos y tocarlos.
// Con `cut`, ese piso y los de arriba se levantan `lift` metros, o se quitan si `removeAbove`.
function buildingFeatures(floorsUp, { cut = null, lift = 0, removeAbove = false } = {}) {
  const { groundFloorHeight: g, floorHeight: h } = PROJECT;
  const isAbove = (floor) => cut !== null && floor >= cut;
  const features = [];
  if (floorsUp >= 0.01) {
    features.push(feature(0, "lobby", 0, g * Math.min(1, floorsUp), 0));
  }
  for (let floor = 1; floor <= Math.floor(floorsUp); floor++) {
    if (isAbove(floor) && removeAbove) continue;
    const base = floorBase(floor) + (isAbove(floor) ? lift : 0);
    features.push(feature(floor, "floor", base, base + h - 0.4, 0.6));
  }
  if (floorsUp >= PROJECT.floors && !(cut !== null && removeAbove)) {
    const top = g + PROJECT.floors * h + (cut !== null ? lift : 0);
    features.push(feature(99, "roof", top, top + 1.4, 3));
  }
  return { type: "FeatureCollection", features };
}

function floorBase(floor) {
  return PROJECT.groundFloorHeight + (floor - 1) * PROJECT.floorHeight;
}

// Losa + núcleo + un bloque por departamento, ubicados como en la planta del panel.
function floorUnitsFeatures(floor) {
  if (floor === null) return { type: "FeatureCollection", features: [] };
  const slabTop = floorBase(floor) + 0.35;
  const part = (id, kind, coordinates, top, extra = {}) => ({
    type: "Feature",
    geometry: { type: "Polygon", coordinates },
    properties: { id, kind, base: kind === "slab" ? floorBase(floor) : slabTop, top, ...extra },
  });
  return {
    type: "FeatureCollection",
    features: [
      part("slab", "slab", footprint(0.6), slabTop),
      part("core", "core", planPolygon(CORE_BOX, 0), slabTop + 2.8),
      ...UNITS.filter((u) => u.floor === floor).map((u) =>
        part(u.id, "unit", planPolygon(UNIT_BOXES[u.letter], 2.5), slabTop + 1.2, { status: u.status })
      ),
    ],
  };
}

// Caja de la planta (coordenadas del SVG) → polígono sobre la planta real del edificio.
function planPolygon([x, y, w, h], gap) {
  const ring = footprint(0.6)[0];
  const [west, south] = ring[0];
  const [east, north] = ring[2];
  const lng = (px) => west + ((px - PLAN.x) / PLAN.width) * (east - west);
  const lat = (py) => north - ((py - PLAN.y) / PLAN.height) * (north - south);
  const [x1, y1, x2, y2] = [lng(x + gap), lat(y + gap), lng(x + w - gap), lat(y + h - gap)];
  return [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]];
}

function statusColor(colors) {
  return ["match", ["get", "status"], ...Object.entries(colors).flat(), "#9a9a9a"];
}

function feature(id, kind, base, top, inset) {
  return { type: "Feature", id, geometry: { type: "Polygon", coordinates: footprint(inset) }, properties: { kind, base, top } };
}

function setHover(floor) {
  if (hoveredFloor === floor) return;
  clearHover();
  hoveredFloor = floor;
  map.setFeatureState({ source: "project", id: floor }, { hover: true });
  highlightRail(floor);
}

function clearHover() {
  if (hoveredFloor !== null) map.setFeatureState({ source: "project", id: hoveredFloor }, { hover: false });
  hoveredFloor = null;
  highlightRail(selectedFloor);
}

function selectFloor(floor) {
  if (selectedFloor !== null) map.setFeatureState({ source: "project", id: selectedFloor }, { selected: false });
  selectedFloor = floor;
  if (floor !== null) map.setFeatureState({ source: "project", id: floor }, { selected: true });
  highlightRail(floor);
}

// ---------- Intro ----------

function startLoadingProgress() {
  const ring = $("ring-fg");
  const circumference = 2 * Math.PI * 54;
  ring.style.strokeDasharray = circumference;
  let progress = 0;
  let ready = false;
  map.once("idle", () => (ready = true));
  // Por si alguna imagen tarda, pero contando desde que el mapa cargó: antes de eso todavía no están las capas del
  // proyecto y entrar rompe la intro.
  map.once("load", () => setTimeout(() => (ready = true), 8000));

  const tick = () => {
    const target = ready ? 100 : 90;
    progress = Math.min(target, progress + (ready ? 4 : 1.2));
    ring.style.strokeDashoffset = circumference * (1 - progress / 100);
    $("intro-progress").textContent = `${Math.round(progress)}%`;
    if (progress < 100) return requestAnimationFrame(tick);
    $("intro-progress").hidden = true;
    $("enter-btn").hidden = false;
  };
  requestAnimationFrame(tick);
}

async function runIntro() {
  $("intro").classList.add("fade-out");
  setTimeout(() => ($("intro").hidden = true), 700);
  $("intro-controls").hidden = false;
  const startedAt = performance.now();
  const total = sitePlan
    ? FLY_TO_CITY_MS + FLY_TO_LOT_MS + MARK_STREETS_MS + DRAW_LOT_MS + LOT_FILL_MS + TOP_DOWN_MS * 0.4 + PLAN_FADE_MS
    : INTRO_TOTAL_MS;
  const countdown = setInterval(() => {
    const left = Math.max(0, Math.ceil((total - (performance.now() - startedAt)) / 1000));
    $("countdown").textContent = `faltan ${left}s`;
  }, 250);

  // flyTo mantiene durante todo el vuelo la altura del centro con la que arranca. Si arranca con la del punto
  // de partida (~335 m en La Pampa), al llegar al lote (~640 m) la cámara queda bajo el relieve, MapLibre la
  // empuja y la intro se rompe. Se fija la altura del lote y se suelta el "centro pegado al suelo" hasta el final.
  map.setCenterClampedToGround(false);
  map.jumpTo({ elevation: PROJECT.groundElevation });
  await flyTo({ center: PROJECT.center, zoom: 11.6, pitch: 25, bearing: 0, duration: FLY_TO_CITY_MS, curve: 1.6 });
  if (skipped) return clearInterval(countdown);
  $("title-card").hidden = false;
  if (sitePlan) {
    await flyTo({ center: sitePlan.center, ...LOT_VIEW, bearing: sitePlan.topBearing, duration: FLY_TO_LOT_MS });
    if (!skipped) await markStreets();
    if (!skipped) await drawLot();
    // Baja a la vista desde arriba (sin el alejarse/acercarse de flyTo) y la imagen aparece mientras termina.
    // El título se va antes, para no quedar encima de la implantación.
    if (!skipped) {
      $("title-card").classList.add("leaving");
      await Promise.all([
        easeTo({ ...finalView(), duration: TOP_DOWN_MS }),
        delay(TOP_DOWN_MS * 0.4).then(fadeInSitePlan),
      ]);
    }
    if (skipped) return clearInterval(countdown);
  } else {
    await flyTo({ ...finalView(), duration: FLY_TO_LOT_MS });
    if (skipped) return clearInterval(countdown);
    await riseBuilding();
  }
  clearInterval(countdown);
  if (!skipped) finishIntro();
}

function flyTo(options) {
  return new Promise((resolve) => {
    map.once("moveend", resolve);
    map.flyTo({ ...options, essential: true });
  });
}

function riseBuilding() {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      if (skipped) return resolve();
      const t = Math.min(1, (now - start) / RISE_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      map.getSource("project").setData(buildingFeatures(eased * PROJECT.floors));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

// Llama a `apply` en cada cuadro con el avance (0 a 1, suavizado con `ease`) durante `ms`. Se corta si se omite la intro.
function animate(ms, apply, ease = easeOut) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      if (skipped) return resolve();
      // El primer cuadro puede traer una hora apenas anterior a `start`: sin el máximo, el avance daría negativo.
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      apply(ease(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function easeTo(options) {
  return new Promise((resolve) => {
    map.once("moveend", resolve);
    map.easeTo({ ...options, easing: easeInOut, essential: true });
  });
}

// Las calles se dibujan desde el lote hacia afuera y cada nombre aparece cuando su calle empieza a dibujarse.
function markStreets() {
  const farthest = Math.max(0, ...streetsDrawing.flatMap((s) => s.reach));
  return animate(MARK_STREETS_MS, (e) => {
    const distance = e * farthest;
    map.getSource("streets").setData(streetsUpTo(distance));
    streetLabels.forEach(({ marker, start }) => marker.getElement().classList.toggle("on", start <= distance));
  }, easeInOut);
}

// Se dibuja el borde del terreno y después se rellena apenas.
async function drawLot() {
  await animate(DRAW_LOT_MS, (e) => map.getSource("plan-lot-outline").setData(lotOutline(e)), easeInOut);
  await animate(LOT_FILL_MS, (e) => map.setPaintProperty("plan-lot-fill", "fill-opacity", LOT_FILL_OPACITY * e));
}

// La implantación aparece de a poco sobre el terreno marcado (el relleno se va), en lugar de levantarse la torre.
function fadeInSitePlan() {
  return animate(PLAN_FADE_MS, (e) => {
    map.setPaintProperty("site-plan", "raster-opacity", e);
    map.setPaintProperty("plan-lot-fill", "fill-opacity", LOT_FILL_OPACITY * (1 - e));
  }, easeInOut);
}

// Estado final de la intro con implantación (también al omitirla).
function showSitePlanFinal() {
  map.getSource("streets").setData(streetsUpTo(Infinity));
  streetLabels.forEach(({ marker }) => marker.getElement().classList.add("on"));
  map.getSource("plan-lot-outline").setData(lotOutline(1));
  map.setPaintProperty("plan-lot-fill", "fill-opacity", 0);
  map.setPaintProperty("site-plan", "raster-opacity", 1);
}

function skipIntro() {
  skipped = true;
  map.stop();
  map.jumpTo({ elevation: PROJECT.groundElevation, ...finalView() });
  finishIntro();
}

function finishIntro() {
  map.setCenterClampedToGround(true);
  map.getSource("project").setData(buildingFeatures(PROJECT.floors));
  if (sitePlan) showSitePlanFinal();
  $("intro-controls").hidden = true;
  setTimeout(() => ($("title-card").hidden = true), skipped ? 0 : 1800);
  INTERACTION_HANDLERS.forEach((h) => map[h].enable());
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  introDone = true;
  if (sitePlan) {
    // Sin riel ni buscador: las plantas se cambian abajo y Render/360° salen al tocar un departamento.
    // Terminada la intro se sale del mapa: la implantación queda sola, a pantalla completa.
    $("topbar").hidden = false;
    $("facade-btn").hidden = !sitePlan.facade;
    $("nearby-btn").hidden = false;
    $("search-btn").hidden = true;
    $("tour-btn").hidden = true;
    $("view-toggle").hidden = false;
    setTimeout(() => showPlanView(true), skipped ? 0 : 300);
  } else {
    ["topbar", "floor-rail", "hint"].forEach((id) => ($(id).hidden = false));
    setTimeout(() => ($("hint").hidden = true), 6000);
    renderFloorRail();
    startOrbit();
  }
}

function startOrbit() {
  orbiting = true;
  const spin = () => {
    if (!orbiting) return;
    map.setBearing(map.getBearing() + 0.04);
    requestAnimationFrame(spin);
  };
  requestAnimationFrame(spin);
}

// ---------- Pisos ----------

function renderFloorRail() {
  const list = $("floor-list");
  const floors = Array.from({ length: PROJECT.floors }, (_, i) => PROJECT.floors - i);
  list.innerHTML = floors
    .map((f) => {
      const free = UNITS.filter((u) => u.floor === f && u.status === "disponible").length;
      return `<button class="rail-floor" data-floor="${f}"><strong>${f}</strong><small>${free ? `${free} disp.` : "agotado"}</small></button>`;
    })
    .join("");
  list.querySelectorAll(".rail-floor").forEach((btn) => {
    const f = +btn.dataset.floor;
    btn.addEventListener("mouseenter", () => setHover(f));
    btn.addEventListener("mouseleave", clearHover);
    btn.addEventListener("click", () => openFloor(f));
  });
}

function highlightRail(floor) {
  document.querySelectorAll(".rail-floor").forEach((b) => b.classList.toggle("active", +b.dataset.floor === floor));
}

function openFloor(floor) {
  orbiting = false;
  selectFloor(floor);
  $("hint").hidden = true;
  const units = UNITS.filter((u) => u.floor === floor);
  $("floor-title").textContent = `Piso ${floor}`;
  $("floor-plan").innerHTML = floorPlanSvg(units);
  $("floor-plan").querySelectorAll("[data-unit]").forEach((el) =>
    el.addEventListener("click", () => openUnit(el.dataset.unit))
  );
  $("floor-units").innerHTML = units.map(unitRow).join("");
  $("floor-units").querySelectorAll("[data-unit]").forEach((el) =>
    el.addEventListener("click", () => openUnit(el.dataset.unit))
  );
  $("floor-panel").hidden = false;
  cutAway(floor);
  const panel = $("floor-panel");
  const padding = window.innerWidth > 760 ? { right: panel.offsetWidth + 16, bottom: 0 } : { right: 0, bottom: panel.offsetHeight };
  map.easeTo({ center: cutawayCenter(floor), zoom: cutawayZoom(padding), ...CUTAWAY_VIEW, padding, duration: 1400 });
}

// Zoom para que la planta ocupe ~70% del espacio que deja libre el panel (descontando la barra de arriba).
function cutawayZoom(padding) {
  const freeWidth = window.innerWidth - padding.right;
  const freeHeight = window.innerHeight - padding.bottom - 80;
  const scale = Math.min((0.7 * freeWidth) / CUTAWAY_REF.width, (0.7 * freeHeight) / CUTAWAY_REF.height);
  return Math.min(20, Math.max(18.3, CUTAWAY_REF.zoom + Math.log2(scale)));
}

function closeFloor() {
  $("floor-panel").hidden = true;
  selectFloor(null);
  cancelAnimationFrame(liftFrame);
  cutFloor = null;
  clearUnitHover();
  map.getSource("project").setData(buildingFeatures(PROJECT.floors));
  map.getSource("floor-units").setData(floorUnitsFeatures(null));
  CITY_LAYERS.forEach((id) => map.setPaintProperty(id, "fill-extrusion-opacity", CITY_OPACITY));
  map.easeTo({ ...finalView(), padding: { right: 0, bottom: 0 }, duration: 1200 });
}

// Corta el edificio en `floor`: la primera vez los pisos de arriba se levantan y desaparecen;
// al cambiar de piso con uno ya abierto, el corte es directo.
function cutAway(floor) {
  cancelAnimationFrame(liftFrame);
  const wasCut = cutFloor !== null;
  cutFloor = floor;
  clearUnitHover();
  map.getSource("floor-units").setData(floorUnitsFeatures(floor));
  // Los edificios vecinos más altos que el piso elegido taparían la planta vista desde arriba.
  CITY_LAYERS.forEach((id) => map.setPaintProperty(id, "fill-extrusion-opacity", 0));
  const done =() => map.getSource("project").setData(buildingFeatures(PROJECT.floors, { cut: floor, removeAbove: true }));
  if (wasCut) return done();
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / LIFT_MS);
    if (t === 1) return done();
    map.getSource("project").setData(buildingFeatures(PROJECT.floors, { cut: floor, lift: t * t * LIFT_METERS }));
    liftFrame = requestAnimationFrame(step);
  };
  liftFrame = requestAnimationFrame(step);
}

// MapLibre centra la cámara en el suelo; se corre hacia el norte para que el piso elevado quede al medio.
function cutawayCenter(floor) {
  const [lng, lat] = PROJECT.center;
  const shiftMeters = floorBase(floor) * Math.tan((CUTAWAY_VIEW.pitch * Math.PI) / 180);
  return [lng, lat + shiftMeters / 110_950];
}

function setUnitHover(id, mouse) {
  if (hoveredUnit !== id) {
    clearUnitHover();
    hoveredUnit = id;
    map.setFeatureState({ source: "floor-units", id }, { hover: true });
    const u = UNITS.find((x) => x.id === id);
    $("unit-tip").innerHTML = `<strong>${u.id}</strong> ${u.rooms} amb · ${u.area} m² <em class="badge ${u.status}">${STATUS_LABELS[u.status]}</em>`;
    $("unit-tip").hidden = false;
  }
  $("unit-tip").style.transform = `translate(${mouse.clientX + 14}px, ${mouse.clientY + 14}px)`;
}

function clearUnitHover() {
  if (hoveredUnit !== null) map.setFeatureState({ source: "floor-units", id: hoveredUnit }, { hover: false });
  hoveredUnit = null;
  $("unit-tip").hidden = true;
}

// Planta esquemática del piso: 4 departamentos alrededor del núcleo.
function floorPlanSvg(units) {
  const rects = units
    .map((u) => {
      const [x, y, w, h] = UNIT_BOXES[u.letter];
      return `<g class="plan-unit ${u.status}" data-unit="${u.id}">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${STATUS_COLORS[u.status]}" />
        <text x="${x + w / 2}" y="${y + h / 2 - 4}">${u.id}</text>
        <text class="small" x="${x + w / 2}" y="${y + h / 2 + 14}">${u.area} m²</text>
      </g>`;
    })
    .join("");
  const [cx, cy, cw, ch] = CORE_BOX;
  return `<svg viewBox="0 0 340 220">${rects}<rect class="core" x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="3" /><text class="core-text" x="${cx + cw / 2}" y="${cy + 24}">núcleo</text></svg>`;
}

function unitRow(u) {
  return `<button class="unit-row" data-unit="${u.id}">
    <strong>${u.id}</strong>
    <span>${u.rooms} amb · ${u.area} m²</span>
    <em class="badge ${u.status}">${STATUS_LABELS[u.status]}</em>
  </button>`;
}

// ---------- Buscador ----------

function initSearch() {
  const areas = UNITS.map((u) => u.area);
  const slider = $("area-filter");
  slider.min = Math.floor(Math.min(...areas));
  slider.max = Math.ceil(Math.max(...areas));
  slider.value = slider.min;

  const rooms = ["Todos", ...[...new Set(UNITS.map((u) => u.rooms))].sort()];
  $("rooms-filter").innerHTML = rooms
    .map((r, i) => `<button class="chip${i === 0 ? " active" : ""}" data-rooms="${r}">${r === "Todos" ? r : `${r} amb`}</button>`)
    .join("");
  $("rooms-filter").querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      $("rooms-filter").querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderResults();
    })
  );
  slider.addEventListener("input", renderResults);
  $("available-filter").addEventListener("change", renderResults);
  renderResults();
}

function renderResults() {
  const rooms = document.querySelector("#rooms-filter .chip.active").dataset.rooms;
  const minArea = +$("area-filter").value;
  const onlyAvailable = $("available-filter").checked;
  $("area-value").textContent = `${minArea} m²`;

  const list = UNITS.filter(
    (u) =>
      (rooms === "Todos" || u.rooms === +rooms) &&
      u.area >= minArea &&
      (!onlyAvailable || u.status === "disponible")
  );
  $("results-count").textContent = `${list.length} unidades encontradas`;
  $("results").innerHTML = list
    .map(
      (u) => `<button class="result" data-unit="${u.id}">
        <div class="result-head"><strong>${u.id}</strong><em class="badge ${u.status}">${STATUS_LABELS[u.status]}</em></div>
        <p>${u.area} m² · ${u.rooms} ambientes · Piso ${u.floor}</p>
        ${u.balcony ? '<span class="tag">Balcón</span>' : ""}
      </button>`
    )
    .join("");
  $("results").querySelectorAll(".result").forEach((el) =>
    el.addEventListener("click", () => {
      const unit = UNITS.find((u) => u.id === el.dataset.unit);
      $("search-modal").hidden = true;
      openFloor(unit.floor);
      openUnit(unit.id);
    })
  );
}

// ---------- Ficha de unidad ----------

function openUnit(id) {
  const u = UNITS.find((x) => x.id === id);
  $("unit-status").textContent = STATUS_LABELS[u.status];
  $("unit-status").className = `badge ${u.status}`;
  $("unit-title").textContent = `Unidad ${u.id}`;
  $("unit-plan").innerHTML = unitPlanSvg(u);
  $("unit-meta").innerHTML = [
    ["Superficie", `${u.area} m²`],
    ["Ambientes", u.rooms],
    ["Piso", u.floor],
    ["Orientación", u.orientation],
    ["Balcón", u.balcony ? "Sí" : "No"],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join("");
  const msg = `Hola! Me interesa la unidad ${u.id} de ${PROJECT.name}.`;
  $("unit-wa").href = `https://wa.me/${PROJECT.whatsapp}?text=${encodeURIComponent(msg)}`;
  $("unit-modal").hidden = false;
}

// Plano ilustrativo según la cantidad de ambientes.
function unitPlanSvg(u) {
  const rooms = { 2: ["Living-comedor", "Dormitorio"], 3: ["Living-comedor", "Dormitorio", "Dormitorio"], 4: ["Living-comedor", "Suite", "Dormitorio", "Dormitorio"] }[u.rooms];
  const w = 300 / rooms.length;
  const cells = rooms
    .map((r, i) => `<rect x="${10 + i * w}" y="10" width="${w}" height="120" /><text x="${10 + i * w + w / 2}" y="74">${r}</text>`)
    .join("");
  const balcony = u.balcony ? `<rect class="balcony" x="10" y="130" width="300" height="26" /><text class="small" x="160" y="147">Balcón</text>` : "";
  return `<svg viewBox="0 0 320 166">${cells}${balcony}</svg>`;
}

// ---------- Recorridos 360° ----------

function openTour(id = TOURS_360[0].id) {
  orbiting = false;
  $("tour-tabs").innerHTML = TOURS_360.map((t) => `<button class="chip${t.id === id ? " active" : ""}" data-tour="${t.id}">${t.label}</button>`).join("");
  $("tour-tabs").querySelectorAll("[data-tour]").forEach((el) => el.addEventListener("click", () => openTour(el.dataset.tour)));
  const tour = TOURS_360.find((t) => t.id === id);
  if ($("tour-frame").src !== tour.url) $("tour-frame").src = tour.url;
  $("tour-link").href = tour.url;
  $("tour-modal").hidden = false;
}

// Vaciar el iframe al cerrar para que el recorrido deje de cargar en segundo plano.
function closeTour() {
  $("tour-modal").hidden = true;
  $("tour-modal").classList.remove("fullscreen"); // la pone el botón del departamento (ver initPlanView)
  $("tour-frame").removeAttribute("src");
}

function closeGallery() {
  galleryToken++; // descarta las esperas pendientes de la vista abierta
  $("gallery-modal").hidden = true;
  $("gallery-modal").classList.remove("fullscreen");
  $("gallery-media").classList.add("out"); // al volver a abrir aparece fundida desde negro
  stopGalleryVideo();
}

function stopGalleryVideo() {
  const player = $("gallery-video");
  player.onplaying = player.onended = null;
  player.pause();
  player.classList.remove("shown", "slow");
  player.hidden = true;
  player.removeAttribute("src");
  player.load(); // suelta la descarga
}

// ---------- Implantación a pantalla completa ----------

// Arma la vista: la imagen con la proporción real, el fondo desenfocado y la zona tocable de la pileta.
function initPlanView() {
  const view = $("plan-view");
  view.style.setProperty("--plan-ratio", sitePlan.widthMeters / sitePlan.heightMeters);
  view.style.setProperty("--plan-bg", `url("${sitePlan.image}")`);
  $("plan-img").src = sitePlan.image;
  $("view-toggle").addEventListener("click", () => (!$("nearby-panel").hidden ? closeNearby() : showPlanView(!planViewOn)));
  initUnitSpots();
  $("unit-view-close").addEventListener("click", closeUnitView);
  $("unit-view-renders").addEventListener("click", () => {
    const unit = sitePlan.units.find((u) => u.id === openUnitId);
    openRenders(rendersIndexFor(unit));
    $("gallery-modal").classList.add("fullscreen");
  });
  $("unit-view-tour").addEventListener("click", () => {
    openTour(sitePlan.units.find((u) => u.id === openUnitId).typology);
    $("tour-modal").classList.add("fullscreen");
  });
  $("unit-view-video").addEventListener("ended", showPoolImage);
  unitParallax = createParallax($("unit-view"), () => [$("unit-view-img"), $("unit-view-video")]);
  resetParallax(unitParallax);
  $("unit-view-skip").addEventListener("click", showPoolImage);
  const pool = sitePlan.amenities?.pool;
  if (!pool) return ($("pool-hotspot").hidden = true);
  Object.assign($("pool-hotspot").style, {
    left: pct(pool.x[0]), top: pct(pool.y[0]), width: pct(pool.x[1] - pool.x[0]), height: pct(pool.y[1] - pool.y[0]),
  });
  $("pool-hotspot").addEventListener("click", openPoolView);
}

const pct = (v) => `${(v * 100).toFixed(2)}%`;

// Un botón por departamento (SITE_PLAN.units) y el selector de planta. Arranca en la primera planta.
function initUnitSpots() {
  const [w, h] = sitePlan.imageSize;
  $("unit-spots").innerHTML = sitePlan.units
    .map(({ id, box: [x0, y0, x1, y1] }) => {
      const style = `left:${pct(x0 / w)};top:${pct(y0 / h)};width:${pct((x1 - x0) / w)};height:${pct((y1 - y0) / h)}`;
      return `<button class="unit-spot" data-unit="${id}" style="${style}" aria-label="Departamento ${id}"></button>`;
    })
    .join("");
  $("unit-spots").querySelectorAll("[data-unit]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      hideUnitSpotTip();
      openUnitView(el.dataset.unit);
    });
    // Con mouse: etiqueta con tipología, número y estado al pasar por encima.
    el.addEventListener("pointermove", (e) => e.pointerType === "mouse" && showUnitSpotTip(el.dataset.unit, e));
    el.addEventListener("pointerleave", hideUnitSpotTip);
  });
  $("floor-switch").innerHTML = sitePlan.floors.map((f) => `<button data-floor="${f.id}">${f.label}</button>`).join("");
  $("floor-switch").querySelectorAll("[data-floor]").forEach((el) => el.addEventListener("click", () => setPlanFloor(el.dataset.floor)));
  setPlanFloor(sitePlan.floors[0].id);
}

function unitStatus(unitId) {
  const floor = sitePlan.floors.find((f) => f.id === currentPlanFloor);
  return floor.except?.[unitId] ?? floor.status;
}

// Cambia de planta: misma imagen, cada departamento con el color de su estado en esa planta.
function setPlanFloor(floorId) {
  currentPlanFloor = floorId;
  $("floor-switch").querySelectorAll("[data-floor]").forEach((el) => el.classList.toggle("active", el.dataset.floor === floorId));
  $("unit-spots").querySelectorAll("[data-unit]").forEach((el) => {
    el.classList.remove("disponible", "reservada", "vendida");
    el.classList.add(unitStatus(el.dataset.unit));
  });
  const free = sitePlan.units.filter((u) => unitStatus(u.id) === "disponible").length;
  $("floor-count").textContent = free ? `${free} ${free === 1 ? "disponible" : "disponibles"}` : "Sin unidades disponibles";
}

function unitLabel(unit) {
  return `${TOURS_360.find((t) => t.id === unit.typology)?.label ?? unit.typology} · ${unit.id}`;
}

function showUnitSpotTip(unitId, e) {
  const tip = $("unit-tip");
  if (tip.dataset.unit !== unitId) {
    const status = unitStatus(unitId);
    tip.innerHTML = `<strong>${unitLabel(sitePlan.units.find((u) => u.id === unitId))}</strong><em class="badge ${status}">${STATUS_LABELS[status]}</em>`;
    tip.dataset.unit = unitId;
  }
  tip.hidden = false;
  tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
}

function hideUnitSpotTip() {
  $("unit-tip").hidden = true;
  delete $("unit-tip").dataset.unit;
}

// Renders de la tipología del departamento; sin renders propios, los del Duplex (el general).
function rendersIndexFor(unit) {
  const i = sitePlan.renders.findIndex((r) => r.id === unit.typology);
  return i >= 0 ? i : 0;
}

const ZOOM_IN_MS = 750; // un poco menos que la transición de .plan-stage: la vista se abre mientras termina de acercarse
const UNIT_FADE_MS = 500;
const MEDIA_FADE_MS = 600; // .unit-view-media

// Acerca la implantación a `box` ([izq, arriba, der, abajo] en píxeles de la imagen): lo escala hasta que llene
// ~85% y lo lleva al centro de lo que se ve (en el celular la imagen puede estar deslizada). Después abre la vista
// a pantalla completa. Devuelve false si ya había una abierta.
function zoomIntoPlan(box) {
  if (unitViewOpen) return false;
  unitViewOpen = true;
  hideUnitSpotTip();
  const stage = document.querySelector(".plan-stage");
  const rect = stage.getBoundingClientRect();
  const view = $("plan-view").getBoundingClientRect();
  const [w, h] = sitePlan.imageSize;
  const [x0, y0, x1, y1] = box;
  const scale = 0.85 * Math.min(w / (x1 - x0), h / (y1 - y0));
  // La transformación escala desde el centro de la imagen: el centro del departamento tiene que terminar en el
  // centro de lo visible. Coordenadas relativas a la imagen sin transformar.
  const ux = ((x0 + x1) / 2 / w) * rect.width;
  const uy = ((y0 + y1) / 2 / h) * rect.height;
  const tx = view.left + view.width / 2 - rect.left;
  const ty = view.top + view.height / 2 - rect.top;
  const dx = tx - rect.width / 2 - scale * (ux - rect.width / 2);
  const dy = ty - rect.height / 2 - scale * (uy - rect.height / 2);
  stage.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  setTimeout(() => {
    if (!unitViewOpen) return;
    const view = $("unit-view");
    view.hidden = false;
    void view.offsetWidth; // que arranque en opacidad 0 y haya fundido
    view.classList.add("visible");
  }, ZOOM_IN_MS);
  return true;
}

// Tocar un departamento: se acerca y se abre su imagen a pantalla completa, con "Ver unidad" (renders) y
// "Recorrido 360°" arriba.
function openUnitView(unitId) {
  const unit = sitePlan.units.find((u) => u.id === unitId);
  if (!zoomIntoPlan(unit.box)) return;
  openUnitId = unitId;
  const tour = TOURS_360.find((t) => t.id === unit.typology);
  const status = unitStatus(unitId);
  const group = rendersIndexFor(unit);
  const { plan, images } = sitePlan.renders[group];
  $("unit-spots").querySelector(`[data-unit="${unitId}"]`).classList.add("active");
  // Con plano, eso es lo primero que se ve (y cada ambiente abre su render); si no, el primer render.
  if (plan) showUnitPlan(plan, group);
  else showUnitViewImage(images[0].image, unitLabel(unit));
  $("unit-view-name").textContent = unitLabel(unit);
  $("unit-view-status").hidden = false;
  $("unit-view-status").className = `badge ${status}`;
  $("unit-view-status").textContent = STATUS_LABELS[status];
  $("unit-view-renders").hidden = false;
  $("unit-view-tour").hidden = !tour;
  $("unit-view-skip").hidden = true;
  const msg = `Hola! Me interesa el ${unitLabel(unit).replace(" · ", " ")} de ${PROJECT.name}.`;
  $("unit-view-wa").href = `https://wa.me/${PROJECT.whatsapp}?text=${encodeURIComponent(msg)}`;
  $("unit-view-wa").hidden = !PROJECT.whatsapp;
}

// Tocar la pileta: se acerca, pasa el video de la pileta a pantalla completa y al terminar queda la imagen entera.
function openPoolView(e) {
  e.stopPropagation();
  const { pool, label, video, image } = sitePlan.amenities;
  const [w, h] = sitePlan.imageSize;
  if (!zoomIntoPlan([pool.x[0] * w, pool.y[0] * h, pool.x[1] * w, pool.y[1] * h])) return;
  $("unit-view-name").textContent = label;
  $("unit-view-status").hidden = true;
  $("unit-view-renders").hidden = true;
  $("unit-view-tour").hidden = true;
  $("unit-view-wa").hidden = true;
  $("unit-plan").hidden = true;
  resetParallax(unitParallax);
  if (!video) return showUnitViewImage(image, label);
  const { start = image } = sitePlan.amenities;
  // Mientras el video carga se ve su primer cuadro; el video aparece fundido encima, sin salto.
  showUnitViewImage(start, label);
  $("unit-view-skip").hidden = false;
  const player = $("unit-view-video");
  player.classList.add("faded");
  player.classList.remove("slow");
  player.onplaying = () => player.classList.remove("faded");
  player.hidden = false;
  player.src = video;
  // Con sonido si el navegador lo deja (el toque cuenta como gesto del usuario); si no, sin sonido.
  player.muted = false;
  player.play().catch(() => {
    player.muted = true;
    player.play().catch(showPoolImage);
  });
}

// Fin del video de la pileta (o "Saltar video"): debajo queda su último cuadro y el video se funde lento en él.
function showPoolImage() {
  if (!unitViewOpen || $("unit-view-skip").hidden) return;
  const { image, end = image, label } = sitePlan.amenities;
  $("unit-view-skip").hidden = true;
  const img = $("unit-view-img");
  img.src = end;
  const swap = () => {
    if (!unitViewOpen) return;
    showUnitViewImage(end, label);
    const player = $("unit-view-video");
    player.onplaying = null;
    player.classList.add("slow", "faded");
    setTimeout(() => player.classList.contains("slow") && stopPoolVideo(), 1450); // "slow": sigue siendo este fundido
  };
  img.decode().then(swap, swap);
}

// Plano de la tipología con un botón por ambiente: cada uno abre el visor de renders en su imagen.
function showUnitPlan(plan, group) {
  const [w, h] = plan.size;
  $("unit-view-img").classList.add("faded");
  $("unit-view").style.setProperty("--unit-bg", `url("${plan.image}")`);
  $("unit-plan").style.setProperty("--plan-ratio", w / h);
  $("unit-plan-img").src = plan.image;
  $("unit-plan-img").alt = `Plano ${sitePlan.renders[group].typology}`;
  $("unit-rooms").innerHTML = plan.rooms
    .map(({ label, box: [x0, y0, x1, y1] }, i) => {
      const style = `left:${pct(x0 / w)};top:${pct(y0 / h)};width:${pct((x1 - x0) / w)};height:${pct((y1 - y0) / h)}`;
      return `<button class="room-spot" data-room="${i}" style="${style}" aria-label="Ver ${label}" title="${label}"></button>`;
    })
    .join("");
  $("unit-rooms").querySelectorAll("[data-room]").forEach((el) =>
    el.addEventListener("click", () => {
      openRenders(group, plan.rooms[+el.dataset.room].view);
      $("gallery-modal").classList.add("fullscreen");
    })
  );
  $("unit-plan").hidden = false;
}

function showUnitViewImage(image, alt) {
  $("unit-plan").hidden = true;
  $("unit-view-img").src = image;
  $("unit-view-img").alt = alt;
  $("unit-view-img").classList.remove("faded");
  $("unit-view").style.setProperty("--unit-bg", `url("${image}")`);
}

function stopPoolVideo() {
  const player = $("unit-view-video");
  player.onplaying = null;
  player.pause();
  player.classList.remove("slow");
  player.hidden = true;
  player.removeAttribute("src");
  player.load(); // suelta la descarga del video
}

// Cerrar: se va la vista y la implantación vuelve a alejarse a la vista del edificio.
function closeUnitView() {
  if (!unitViewOpen) return;
  const view = $("unit-view");
  view.classList.remove("visible");
  $("unit-view-video").pause();
  setTimeout(() => {
    view.hidden = true;
    stopPoolVideo();
    document.querySelector(".plan-stage").style.transform = "";
    $("unit-spots").querySelectorAll(".unit-spot.active").forEach((el) => el.classList.remove("active"));
    openUnitId = null;
    unitViewOpen = false;
  }, UNIT_FADE_MS);
}

// Sale del mapa a la imagen sola (o vuelve), con un fundido.
function showPlanView(show) {
  planViewOn = show;
  const view = $("plan-view");
  if (amenitiesPin) amenitiesPin.getElement().hidden = true;
  $("view-toggle").textContent = show ? "Ver en el mapa" : "Ver implantación";
  if (show) {
    view.hidden = false;
    void view.offsetWidth; // que el navegador vea opacidad 0 antes de pasar a 1, si no no hay fundido
    if (isPhone()) view.scrollLeft = (view.scrollWidth - view.clientWidth) / 2; // arranca en el centro del conjunto
    morphFromMap();
    preloadUnitImages();
  } else {
    setTimeout(() => planViewOn || (view.hidden = true), 800);
  }
  view.classList.toggle("visible", show);
}

// Al pasar del mapa a la vista a pantalla completa, la imagen arranca exactamente donde y del tamaño en que se ve en
// el mapa y se acomoda suave a su lugar: así el pase queda centrado y sin salto en cualquier pantalla.
function morphFromMap() {
  const stage = document.querySelector(".plan-stage");
  stage.style.transition = "none";
  stage.style.transform = "";
  const r = stage.getBoundingClientRect();
  const ps = sitePlanCorners().map((c) => map.project(c));
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  // Si la imagen en el mapa quedó muy distinta (se omitió la intro, o el mapa se movió a mano), solo el fundido.
  const scale = w / r.width;
  if (!(scale > 0.6 && scale < 1.6)) return (stage.style.transition = "");
  stage.style.transform = `translate(${cx - (r.left + r.width / 2)}px, ${cy - (r.top + r.height / 2)}px) scale(${scale})`;
  void stage.offsetWidth; // que el navegador tome la posición de arranque antes de animar
  stage.style.transition = "";
  stage.style.transform = "";
}

// Baja de antemano lo primero que se ve al tocar un departamento o la pileta, así se abre sin esperas.
let preloaded = false;
function preloadUnitImages() {
  if (preloaded) return;
  preloaded = true;
  const urls = sitePlan.renders.flatMap((r) => [r.plan?.image, r.images[0]?.image]);
  urls.push(sitePlan.amenities?.image);
  urls.filter(Boolean).forEach((src) => (new Image().src = src));
}

// ---------- Imágenes (amenities y vista exterior) ----------

function openAmenities() {
  $("gallery-groups").hidden = true;
  openGallery(sitePlan.amenities.label, [{ label: sitePlan.amenities.label, image: sitePlan.amenities.image }]);
}

function openFacade() {
  $("gallery-groups").hidden = true;
  $("gallery-modal").classList.add("fullscreen"); // a pantalla completa, como los renders del departamento
  openGallery("Vista exterior", sitePlan.facade);
}

// Renders del interior, con una pestaña por ambiente. Se abre siempre desde un departamento: solo los de su
// tipología. Se muestran enteros (sin recortar) porque son casi cuadrados y el visor es apaisado.
function openRenders(group = 0, view = 0) {
  const { typology, images } = sitePlan.renders[group];
  $("gallery-groups").hidden = true;
  openGallery(`Render · ${typology}`, images.map((it) => ({ ...it, fit: "contain" })), view);
}

// `items`: [{ label, image, focus?, fit?, video?, start?, end? } o { label, caption?, stages: [...] }]. Con más de una
// se muestran pestañas para cambiar de vista. `fit: "contain"` muestra la imagen entera sobre un fondo desenfocado de
// ella misma; si no, llena el visor. `stages` (el dormitorio 2 en Niñez, Juventud y Adultez) agrega una línea de
// tiempo sobre el video: `stage` es la etapa que se muestra.
function openGallery(title, items, index = 0, stage = 0) {
  orbiting = false;
  if (amenitiesPin) amenitiesPin.getElement().hidden = true;
  $("gallery-title").textContent = title;
  const tabs = $("gallery-tabs");
  tabs.hidden = items.length < 2;
  tabs.innerHTML = items.map((it, i) => `<button class="chip${i === index ? " active" : ""}" data-view="${i}">${it.label}</button>`).join("");
  tabs.querySelectorAll("[data-view]").forEach((el) => el.addEventListener("click", () => openGallery(title, items, +el.dataset.view)));
  // Si el visor ya estaba abierto, la vista actual se funde a negro antes de cambiar; si no, aparece directamente.
  const switching = !$("gallery-modal").hidden;
  gallery = { title, items, index, stage };
  renderGalleryStages(items[index], stage);
  const shown = galleryShown(items[index], stage);
  const several = items.length > 1;
  $("gallery-prev").hidden = $("gallery-next").hidden = $("gallery-count").hidden = !several;
  $("gallery-count").textContent = `${index + 1} / ${items.length}`;
  $("gallery-replay").hidden = true;
  $("gallery-modal").hidden = false;
  const token = ++galleryToken;
  if (switching) {
    $("gallery-media").classList.add("out");
    setTimeout(() => token === galleryToken && showGalleryItem(title, shown, token), GALLERY_FADE_MS);
  } else {
    resetParallax(galleryParallax);
    showGalleryItem(title, shown, token);
  }
  // Lo primero de la siguiente vista ya queda bajando, así pasar de una a otra es instantáneo.
  if (several) new Image().src = galleryStill(items[(index + 1) % items.length]);
}

// Videos ya vistos en esta visita: al volver a su pestaña se muestra directo la imagen final (con "Ver de nuevo").
const galleryWatched = new Set();
let galleryToken = 0; // cambia con cada vista; las esperas de una vista anterior se descartan
const GALLERY_FADE_MS = 450; // .gallery-media

// La vista que se muestra: la misma, o la etapa elegida si tiene línea de tiempo.
function galleryShown(item, stage) {
  if (!item.stages) return item;
  const s = item.stages[stage];
  return { ...s, label: `${item.label} · ${s.label}`, stage: true };
}

// Línea de tiempo de las etapas (como en la presentación: Niñez — Juventud — Adultez). Tocar una etapa, o la misma
// otra vez, reinicia su video desde el principio.
function renderGalleryStages(item, active) {
  const box = $("gallery-stages");
  box.hidden = !item.stages;
  if (!item.stages) return (box.innerHTML = "");
  box.innerHTML =
    (item.caption ? `<span class="stages-caption">${item.caption}</span>` : "") +
    `<div class="stages-line">${item.stages
      .map((s, i) => `<button class="stage${i === active ? " active" : ""}" data-stage="${i}"><i></i><span>${s.label}</span></button>`)
      .join("")}</div>`;
  box.querySelectorAll("[data-stage]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openGallery(gallery.title, gallery.items, gallery.index, +el.dataset.stage);
    })
  );
}

// Lo que se ve quieto de una vista: la imagen, o el primer cuadro del video (o el último si ya se vio).
function galleryStill(item) {
  if (item.stages) item = item.stages[0];
  if (!item.video) return item.image;
  return galleryWatched.has(item.video) ? item.end || item.image : item.start || item.image;
}

function showGalleryItem(title, item, token) {
  stopGalleryVideo();
  const img = $("gallery-img");
  const still = galleryStill(item);
  // Los videos son apaisados como la pantalla: llenan el visor. Las imágenes casi cuadradas se ven enteras.
  img.style.objectFit = item.video ? "cover" : item.fit || "cover";
  img.style.objectPosition = item.focus || "50% 50%";
  img.classList.toggle("media-video", !!item.video);
  img.alt = `${title} · ${item.label}`;
  img.src = still;
  const ready = () => {
    if (token !== galleryToken) return;
    $("gallery-media").style.setProperty("--gallery-bg", `url("${still}")`);
    $("gallery-media").classList.remove("out");
    if (!item.video) return;
    // Las etapas se reproducen siempre que se tocan; las demás vistas, solo la primera vez.
    if (galleryWatched.has(item.video) && !item.stage) $("gallery-replay").hidden = false;
    else playGalleryVideo(item, token);
  };
  img.decode().then(ready, ready);
}

// El video arranca exactamente en la imagen que ya se ve (su primer cuadro), así no hay salto.
function playGalleryVideo(item, token) {
  const player = $("gallery-video");
  player.onplaying = () => token === galleryToken && player.classList.add("shown");
  player.onended = () => finishGalleryVideo(item, token);
  player.src = item.video;
  player.hidden = false;
  player.play().catch(() => finishGalleryVideo(item, token));
}

// Fin del video: debajo se pone la imagen final (su último cuadro, o el render si es otro) y el video se funde en ella.
function finishGalleryVideo(item, token) {
  if (token !== galleryToken) return;
  galleryWatched.add(item.video);
  const end = item.end || item.image;
  const img = $("gallery-img");
  img.src = end;
  const swap = () => {
    if (token !== galleryToken) return;
    $("gallery-media").style.setProperty("--gallery-bg", `url("${end}")`);
    const player = $("gallery-video");
    player.classList.add("slow");
    player.classList.remove("shown");
    setTimeout(() => {
      if (token !== galleryToken) return;
      stopGalleryVideo();
      $("gallery-replay").hidden = !!item.stage; // en las etapas se repite tocando la etapa
    }, 1450);
  };
  img.decode().then(swap, swap);
}

function replayGalleryVideo() {
  if (!gallery) return;
  galleryWatched.delete(gallery.items[gallery.index].video);
  openGallery(gallery.title, gallery.items, gallery.index, gallery.stage);
}

// Pasa a la imagen anterior (-1) o siguiente (+1), dando la vuelta al llegar a un extremo.
function stepGallery(delta) {
  if (!gallery || gallery.items.length < 2) return;
  const n = gallery.items.length;
  openGallery(gallery.title, gallery.items, (gallery.index + delta + n) % n);
}

// Sensación de profundidad ("falso 3D"): la vista, con un poco de zoom, se corre y gira apenas hacia el lado
// contrario al puntero. Sigue al puntero con suavidad (se acerca un poco en cada cuadro) y vuelve al centro al salir.
const PARALLAX_ZOOM = 1.05; // deja ~2,5% de margen por lado: el corrimiento máximo es menor, así no se ven bordes
function createParallax(surface, targets) {
  const p = { x: 0, y: 0, tx: 0, ty: 0, raf: 0, targets };
  const step = () => {
    p.x += (p.tx - p.x) * 0.06;
    p.y += (p.ty - p.y) * 0.06;
    applyParallax(p);
    p.raf = Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y) > 0.0005 ? requestAnimationFrame(step) : 0;
  };
  p.kick = () => p.raf || (p.raf = requestAnimationFrame(step));
  surface.addEventListener("pointermove", (e) => {
    const box = surface.getBoundingClientRect();
    p.tx = (e.clientX - box.left) / box.width - 0.5;
    p.ty = (e.clientY - box.top) / box.height - 0.5;
    p.kick();
  });
  surface.addEventListener("pointerleave", () => {
    p.tx = p.ty = 0;
    p.kick();
  });
  return p;
}

function applyParallax(p) {
  const t = `scale(${PARALLAX_ZOOM}) translate3d(${(-p.x * 3.5).toFixed(3)}%, ${(-p.y * 3).toFixed(3)}%, 0) ` +
    `rotateY(${(p.x * 2.5).toFixed(3)}deg) rotateX(${(-p.y * 2).toFixed(3)}deg)`;
  p.targets().forEach((el) => (el.style.transform = t));
}

function resetParallax(p) {
  if (!p) return;
  p.x = p.y = p.tx = p.ty = 0;
  applyParallax(p);
}

let galleryParallax = null;
let unitParallax = null;

// ---------- Alrededores ----------

// Categorías de nearby.geojson (tools/lugares_osm.py): nombre, color e ícono (trazo SVG de 24×24).
const NEARBY_CATEGORIES = {
  educacion: { label: "Educación", color: "#3f6fb5", icon: "M2 9l10-5 10 5-10 5-10-5zm4 2.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" },
  salud: { label: "Salud", color: "#c9473f", icon: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" },
  compras: { label: "Compras", color: "#d08a2a", icon: "M5 7h14l-1.5 12h-11zM9 7a3 3 0 016 0" },
  gastronomia: { label: "Gastronomía", color: "#8b5a3c", icon: "M7 3v8m-2-8v5a2 2 0 004 0V3M7 11v10m9-18c-2 0-3 3-3 6s1 4 3 4v8" },
  verde: { label: "Plazas y deporte", color: "#3a9a6e", icon: "M12 3l5 7h-3l4 6H6l4-6H7zm0 13v5" },
  servicios: { label: "Servicios", color: "#5f6b7a", icon: "M4 10l8-5 8 5M6 10v8m4-8v8m4-8v8m4-8v8M4 20h16" },
  transporte: { label: "Colectivos", color: "#7a4fb0", icon: "M6 4h12a2 2 0 012 2v10H4V6a2 2 0 012-2zm-2 8h16M7 19v1m10-1v1M7.5 15.5h.01M16.5 15.5h.01" },
};
const KIND_LABELS = {
  school: "Escuela", kindergarten: "Jardín", university: "Universidad", college: "Instituto",
  hospital: "Hospital", clinic: "Clínica", pharmacy: "Farmacia", doctors: "Consultorio",
  supermarket: "Supermercado", mall: "Shopping", convenience: "Almacén", bakery: "Panadería",
  restaurant: "Restaurante", cafe: "Café", fast_food: "Comidas", ice_cream: "Heladería",
  park: "Plaza", playground: "Juegos", sports_centre: "Club", fitness_centre: "Gimnasio",
  bank: "Banco", atm: "Cajero", fuel: "Estación de servicio", police: "Policía", bus_stop: "Parada de colectivo",
};
const WALK_M_PER_MIN = 80;
const NEARBY_FIT_M = 800;
const NEARBY_VIEW = { pitch: 45, bearing: -20 };

let nearby = null; // { places, markers, lotMarker, category, active }

const iconSvg = (path) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

// Sale de la implantación al mapa y muestra los lugares cercanos.
async function openNearby() {
  if (!nearby) {
    const data = await (await fetch("nearby.geojson")).json();
    const places = data.features
      .filter((f) => NEARBY_CATEGORIES[f.properties.category])
      .map((f, i) => ({ id: i, ...f.properties, at: f.geometry.coordinates }));
    nearby = { places, markers: new Map(), category: "todos", active: null };
    initNearbyMap(places);
    renderNearbyCats();
  }
  if (planViewOn) showPlanView(false);
  $("nearby-btn").hidden = true;
  $("nearby-panel").hidden = false;
  setNearbyLayers(true);
  setNearbyCategory(nearby.category);
}

// Vuelve a la implantación: la cámara regresa sobre el lote y después pasa a la imagen a pantalla completa.
async function closeNearby() {
  $("nearby-panel").hidden = true;
  $("nearby-btn").hidden = false;
  setNearbyLayers(false);
  await easeTo({ ...finalView(), duration: 1300 });
  showPlanView(true);
}

// Marcadores de los lugares, el del lote y la línea punteada al lugar elegido.
function initNearbyMap(places) {
  map.addSource("nearby-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "nearby-route", type: "line", source: "nearby-route", layout: { "line-cap": "round", visibility: "none" },
    paint: { "line-color": "#fff", "line-width": 3, "line-dasharray": [1, 2] },
  });
  for (const p of places) {
    const cat = NEARBY_CATEGORIES[p.category];
    const el = document.createElement("button");
    el.className = "poi-pin";
    el.style.setProperty("--cat", cat.color);
    el.setAttribute("aria-label", p.name);
    el.innerHTML = `${iconSvg(cat.icon)}<span class="poi-label"></span>`;
    el.querySelector(".poi-label").textContent = p.name;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      focusNearby(p.id);
    });
    const marker = new maplibregl.Marker({ element: el, opacity: "1", opacityWhenCovered: "1" }).setLngLat(p.at);
    nearby.markers.set(p.id, marker);
  }
  const lot = document.createElement("div");
  lot.className = "lot-pin";
  lot.textContent = PROJECT.name;
  nearby.lotMarker = new maplibregl.Marker({ element: lot, anchor: "bottom", opacity: "1", opacityWhenCovered: "1" }).setLngLat(sitePlan.center);
}

function setNearbyLayers(show) {
  if (!nearby) return;
  for (const m of nearby.markers.values()) show ? m.addTo(map) : m.remove();
  show ? nearby.lotMarker.addTo(map) : nearby.lotMarker.remove();
  streetLabels.forEach(({ marker }) => (marker.getElement().style.visibility = show ? "hidden" : "")); // se pisaban con el lote
  map.setLayoutProperty("nearby-route", "visibility", show ? "visible" : "none");
  if (!show) setNearbyActive(null);
}

function renderNearbyCats() {
  const counts = (c) => nearby.places.filter((p) => c === "todos" || p.category === c).length;
  const cats = [["todos", { label: "Todos", color: "#1f1f1f", icon: "M4 6h16M4 12h16M4 18h16" }], ...Object.entries(NEARBY_CATEGORIES)];
  $("nearby-cats").innerHTML = cats
    .filter(([id]) => counts(id))
    .map(([id, c]) => `<button class="nearby-cat" data-cat="${id}" style="--cat:${c.color}">${iconSvg(c.icon)}${c.label}</button>`)
    .join("");
  $("nearby-cats").querySelectorAll("[data-cat]").forEach((el) => el.addEventListener("click", () => setNearbyCategory(el.dataset.cat)));
}

// Filtra lista y mapa por categoría y encuadra la cámara para ver el lote y esos lugares.
function setNearbyCategory(category) {
  nearby.category = category;
  setNearbyActive(null);
  $("nearby-cats").querySelectorAll("[data-cat]").forEach((el) => el.classList.toggle("active", el.dataset.cat === category));
  const shown = nearby.places
    .filter((p) => category === "todos" || p.category === category)
    .sort((a, b) => a.distance - b.distance);
  for (const [id, m] of nearby.markers) m.getElement().classList.toggle("off", !shown.some((p) => p.id === id));
  $("nearby-list").innerHTML = shown
    .map((p) => {
      const cat = NEARBY_CATEGORIES[p.category];
      const minutes = Math.max(1, Math.round(p.distance / WALK_M_PER_MIN));
      return `<li><button class="nearby-item" data-place="${p.id}">
        <span class="nearby-icon" style="--cat:${cat.color}">${iconSvg(cat.icon)}</span>
        <span class="nearby-text"><strong></strong><small>${KIND_LABELS[p.kind] ?? cat.label}</small></span>
        <span class="nearby-dist">${formatDistance(p.distance)}<small>${minutes} min a pie</small></span>
      </button></li>`;
    })
    .join("");
  $("nearby-list").querySelectorAll("[data-place]").forEach((el) => {
    el.querySelector("strong").textContent = nearby.places[+el.dataset.place].name; // nombre como texto, no HTML
    el.addEventListener("click", () => focusNearby(+el.dataset.place));
    el.addEventListener("mouseenter", () => nearby.markers.get(+el.dataset.place).getElement().classList.add("active"));
    el.addEventListener("mouseleave", () => nearby.active !== +el.dataset.place && nearby.markers.get(+el.dataset.place).getElement().classList.remove("active"));
  });
  // Encuadre: lo que está a una cuadra larga; lo más lejano queda marcado aunque no entre de entrada.
  const bounds = new maplibregl.LngLatBounds(sitePlan.center, sitePlan.center);
  const near = shown.filter((p) => p.distance <= NEARBY_FIT_M);
  (near.length ? near : shown).forEach((p) => bounds.extend(p.at));
  map.fitBounds(bounds, { padding: nearbyPadding(), maxZoom: 17, ...NEARBY_VIEW, duration: 1400, essential: true });
}

// Margen para encuadrar sin que el panel tape los lugares.
function nearbyPadding() {
  const panel = $("nearby-panel");
  return isPhone()
    ? { top: 80, bottom: panel.offsetHeight + 30, left: 40, right: 40 }
    : { top: 90, bottom: 60, left: panel.offsetWidth + 60, right: 70 };
}

// Lleva la cámara al lugar, lo resalta y lo une con el lote.
function focusNearby(id) {
  const p = nearby.places[id];
  setNearbyActive(id);
  $("nearby-list").querySelector(`[data-place="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const bounds = new maplibregl.LngLatBounds(sitePlan.center, sitePlan.center).extend(p.at);
  map.fitBounds(bounds, { padding: nearbyPadding(), maxZoom: 17.5, ...NEARBY_VIEW, duration: 1200, essential: true });
}

function setNearbyActive(id) {
  if (!nearby) return;
  if (nearby.active !== null) nearby.markers.get(nearby.active)?.getElement().classList.remove("active");
  $("nearby-list").querySelectorAll(".nearby-item.active").forEach((el) => el.classList.remove("active"));
  nearby.active = id;
  const features = [];
  if (id !== null) {
    nearby.markers.get(id).getElement().classList.add("active");
    $("nearby-list").querySelector(`[data-place="${id}"]`)?.classList.add("active");
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [sitePlan.center, nearby.places[id].at] } });
  }
  map.getSource("nearby-route")?.setData({ type: "FeatureCollection", features });
}

// ---------- UI general ----------

function initUi() {
  $("enter-btn").addEventListener("click", runIntro);
  $("skip-btn").addEventListener("click", skipIntro);
  $("search-btn").addEventListener("click", () => {
    orbiting = false;
    $("search-modal").hidden = false;
  });
  $("fullscreen-btn").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });
  document.querySelectorAll("[data-close-panel]").forEach((el) => el.addEventListener("click", closeFloor));
  document.querySelectorAll("[data-close-search]").forEach((el) => el.addEventListener("click", () => ($("search-modal").hidden = true)));
  document.querySelectorAll("[data-close-unit]").forEach((el) => el.addEventListener("click", () => ($("unit-modal").hidden = true)));
  $("tour-btn").addEventListener("click", () => openTour());
  $("unit-tour").addEventListener("click", () => openTour());
  $("floor-tour").addEventListener("click", () => openTour());
  document.querySelectorAll("[data-close-tour]").forEach((el) => el.addEventListener("click", closeTour));
  $("facade-btn").addEventListener("click", openFacade);
  $("nearby-btn").addEventListener("click", openNearby);
  document.querySelectorAll("[data-close-nearby]").forEach((el) => el.addEventListener("click", closeNearby));
  document.querySelectorAll("[data-close-gallery]").forEach((el) => el.addEventListener("click", closeGallery));
  galleryParallax = createParallax($("gallery-frame"), () => [$("gallery-media")]);
  resetParallax(galleryParallax);
  $("gallery-replay").addEventListener("click", replayGalleryVideo);
  $("gallery-prev").addEventListener("click", () => stepGallery(-1));
  $("gallery-next").addEventListener("click", () => stepGallery(1));
  // Deslizar con el dedo para pasar de imagen.
  let swipeX = null;
  $("gallery-frame").addEventListener("pointerdown", (e) => (swipeX = e.pointerType === "mouse" ? null : e.clientX));
  $("gallery-frame").addEventListener("pointerup", (e) => {
    if (swipeX !== null && Math.abs(e.clientX - swipeX) > 50) stepGallery(e.clientX < swipeX ? 1 : -1);
    swipeX = null;
  });
  document.addEventListener("keydown", (e) => {
    if (!$("gallery-modal").hidden && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      return stepGallery(e.key === "ArrowLeft" ? -1 : 1);
    }
    if (e.key !== "Escape") return;
    if (!$("gallery-modal").hidden) closeGallery();
    else if (!$("tour-modal").hidden) closeTour();
    else if (unitViewOpen) closeUnitView();
    else if (!$("nearby-panel").hidden) closeNearby();
    else if (!$("unit-modal").hidden) $("unit-modal").hidden = true;
    else if (!$("search-modal").hidden) $("search-modal").hidden = true;
    else if (!$("floor-panel").hidden) closeFloor();
  });
  initSearch();
  if (sitePlan) initPlanView();
}
