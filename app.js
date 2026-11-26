// Centro aproximado del Gran San Juan.
const SAN_JUAN_CENTER = [-31.54, -68.58];

const TYPE_COLORS = {
  Vivienda: "#2f6f5e",
  Comercial: "#b5543c",
  Interiorismo: "#c08a2d",
};

let map;
const markers = {};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  document.getElementById("wa-link").href =
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hola! Quiero consultar por un proyecto.")}`;

  initMap();
  renderMapList();
  renderFilters();
  renderGrid("Todos");
  initModal();
});

function initMap() {
  map = L.map("map", { scrollWheelZoom: false }).setView(SAN_JUAN_CENTER, 11);

  addBaseLayer();

  PROJECTS.forEach((p) => {
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 9,
      color: "#fff",
      weight: 2,
      fillColor: TYPE_COLORS[p.type] || "#333",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip(p.name, { direction: "top", offset: [0, -8] })
      .on("click", () => openProject(p.id));
    markers[p.id] = marker;
  });

  const bounds = L.latLngBounds(PROJECTS.map((p) => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [40, 40] });

  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = Object.entries(TYPE_COLORS)
      .map(([type, color]) => `<span><i style="background:${color}"></i>${type}</span>`)
      .join("");
    return div;
  };
  legend.addTo(map);
}

// Mapa base: OpenStreetMap (sin API key) y, si sus tiles fallan, el estilo HOT de OSM Francia.
// CARTO no se usa: sus basemaps ahora exigen API key y devuelven tiles "API KEY REQUIRED".
const BASE_LAYERS = [
  {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  {
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; OSM France',
  },
];

function addBaseLayer(index = 0) {
  const { url, attribution } = BASE_LAYERS[index];
  const layer = L.tileLayer(url, { attribution, maxZoom: 19 }).addTo(map);
  let errors = 0;
  layer.on("tileerror", () => {
    errors += 1;
    if (errors === 3 && index + 1 < BASE_LAYERS.length) {
      map.removeLayer(layer);
      addBaseLayer(index + 1);
    }
  });
}

function renderMapList() {
  const list = document.getElementById("map-list");
  list.innerHTML = PROJECTS.map(
    (p) => `
      <button class="map-item" data-id="${p.id}">
        <i style="background:${TYPE_COLORS[p.type]}"></i>
        <span><strong>${p.name}</strong><small>${p.location} · ${p.type}</small></span>
      </button>`
  ).join("");

  list.querySelectorAll(".map-item").forEach((btn) => {
    const p = PROJECTS.find((x) => x.id === btn.dataset.id);
    btn.addEventListener("mouseenter", () => markers[p.id].openTooltip());
    btn.addEventListener("mouseleave", () => markers[p.id].closeTooltip());
    btn.addEventListener("click", () => {
      map.flyTo([p.lat, p.lng], 14, { duration: 0.8 });
      openProject(p.id);
    });
  });
}

function renderFilters() {
  const types = ["Todos", ...new Set(PROJECTS.map((p) => p.type))];
  const filters = document.getElementById("filters");
  filters.innerHTML = types
    .map((t, i) => `<button class="chip${i === 0 ? " active" : ""}" data-type="${t}">${t}</button>`)
    .join("");
  filters.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      filters.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderGrid(chip.dataset.type);
    })
  );
}

function renderGrid(type) {
  const grid = document.getElementById("grid");
  const items = type === "Todos" ? PROJECTS : PROJECTS.filter((p) => p.type === type);
  grid.innerHTML = items
    .map(
      (p) => `
      <button class="card" data-id="${p.id}">
        <div class="card-img" style="${coverStyle(p)}"></div>
        <div class="card-body">
          <small>${p.type} · ${p.year}</small>
          <h3>${p.name}</h3>
          <p>${p.location}</p>
        </div>
      </button>`
    )
    .join("");
  grid.querySelectorAll(".card").forEach((card) =>
    card.addEventListener("click", () => openProject(card.dataset.id))
  );
}

function coverStyle(p) {
  return p.image
    ? `background-image:url('${p.image}')`
    : `background:linear-gradient(135deg, ${p.color}, #2b2b2b)`;
}

function initModal() {
  const modal = document.getElementById("modal");
  modal.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", () => (modal.hidden = true))
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") modal.hidden = true;
  });
}

function openProject(id) {
  const p = PROJECTS.find((x) => x.id === id);
  document.getElementById("modal-cover").style.cssText = coverStyle(p);
  document.getElementById("modal-tag").textContent = p.type;
  document.getElementById("modal-title").textContent = p.name;
  document.getElementById("modal-desc").textContent = p.description;
  document.getElementById("modal-meta").innerHTML = `
    <div><dt>Ubicación</dt><dd>${p.location}, San Juan</dd></div>
    <div><dt>Superficie</dt><dd>${p.area}</dd></div>
    <div><dt>Año</dt><dd>${p.year}</dd></div>`;
  document.getElementById("modal").hidden = false;
}
