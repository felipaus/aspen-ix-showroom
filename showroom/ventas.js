// Ventas: buscador de unidades, favoritas, comparador, link para compartir cada unidad, ficha para descargar (PDF)
// y consulta por WhatsApp con los datos de la unidad.
// Usa lo de showroom.js (sitePlan, setPlanFloor, openMaqueta, ...) y se entera de lo que pasa ahí por los eventos
// "showroom:*" que dispara (plan, floor, maqueta, unit).
(() => {
  if (typeof SITE_PLAN === "undefined") return;

  const FAV_KEY = "aspen-ix:favoritas";
  const CONTACT_KEY = "aspen-ix:contacto";
  const MAX_COMPARE = 4;
  const STATUS_ORDER = { disponible: 0, reservada: 1, vendida: 2 };
  const TYPE_ORDER = Object.keys(SITE_PLAN.typologyInfo ?? {});

  const typeLabel = (t) => TOURS_360.find((x) => x.id === t)?.label ?? t;
  const floorLabel = (f) => SITE_PLAN.floors.find((x) => x.id === f)?.label ?? "";
  const fmtArea = (a) => (a ? `${String(a).replace(".", ",")} m²` : "");
  const infoOf = (u) => SITE_PLAN.typologyInfo?.[u.typology] ?? {};
  const statusAt = (id, floorId) => {
    const f = SITE_PLAN.floors.find((x) => x.id === floorId);
    return f?.except?.[id] ?? f?.status ?? "disponible";
  };
  const keyOf = (id, floor) => `${id}@${floor}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Cada departamento en cada planta, con su estado ahí.
  const ALL = SITE_PLAN.floors.flatMap((f) =>
    SITE_PLAN.units.map((u) => ({
      id: u.id,
      typology: u.typology,
      floor: f.id,
      key: keyOf(u.id, f.id),
      status: statusAt(u.id, f.id),
      area: u.area ?? infoOf(u).area ?? null,
      price: u.price ?? null,
    }))
  );
  const byKey = (k) => ALL.find((u) => u.key === k);
  const sortUnits = (a, b) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    TYPE_ORDER.indexOf(a.typology) - TYPE_ORDER.indexOf(b.typology) ||
    a.id.localeCompare(b.id, "es", { numeric: true });

  // ---------- Íconos ----------
  const svg = (d, fill = false) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const STAR = "<path d='M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z'/>";
  const ICONS = {
    star: svg(STAR),
    starOn: svg(STAR, true),
    share: svg("<circle cx='18' cy='5.5' r='2.5'/><circle cx='6' cy='12' r='2.5'/><circle cx='18' cy='18.5' r='2.5'/><path d='M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1'/>"),
    download: svg("<path d='M12 4v11M7 10.5l5 5 5-5M5 19.5h14'/>"),
    chat: svg("<path d='M20 11.5a7.5 7.5 0 0 1-11.2 6.5L4 19.5l1.5-4.6A7.5 7.5 0 1 1 20 11.5z'/>"),
    compare: svg("<rect x='3.5' y='4.5' width='7' height='15' rx='1.5'/><rect x='13.5' y='4.5' width='7' height='15' rx='1.5'/>"),
  };

  // ---------- Favoritas (quedan guardadas en este navegador) ----------
  const favs = new Set(
    (() => {
      try {
        const list = JSON.parse(localStorage.getItem(FAV_KEY));
        return Array.isArray(list) ? list.filter(byKey) : [];
      } catch {
        return [];
      }
    })()
  );
  const saveFavs = () => {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
    } catch {}
  };
  function toggleFav(u) {
    if (favs.has(u.key)) {
      favs.delete(u.key);
      toast(`Unidad ${u.id} quitada de favoritas`);
    } else {
      favs.add(u.key);
      toast(`Unidad ${u.id} guardada en favoritas`);
    }
    saveFavs();
    refreshFavUi();
  }
  function refreshFavUi() {
    $("units-fav-count").textContent = favs.size ? String(favs.size) : "";
    $("units-fav-count").hidden = !favs.size;
    $("search-btn").classList.toggle("has-favs", favs.size > 0);
    $("search-btn").dataset.favs = favs.size || "";
    if (current) setFavButtons(current);
    if (!$("units-panel").hidden) renderList();
  }
  function setFavButtons(u) {
    const on = favs.has(u.key);
    document.querySelectorAll("[data-act='fav']").forEach((b) => {
      b.setAttribute("aria-pressed", String(on));
      b.querySelector(".ic").innerHTML = on ? ICONS.starOn : ICONS.star;
      const label = b.querySelector(".lb");
      if (label) label.textContent = on ? "Guardada" : "Guardar";
      b.title = on ? "Quitar de favoritas" : "Guardar en favoritas";
    });
  }

  // ---------- Unidad que se está mirando (maqueta o departamento) y su link ----------
  let current = null;
  const unitUrl = (u) => `${location.origin}${location.pathname}#/unidad/${encodeURIComponent(u.id)}/${encodeURIComponent(u.floor)}`;
  const setHash = (u) => {
    try {
      history.replaceState(null, "", u ? `#/unidad/${encodeURIComponent(u.id)}/${encodeURIComponent(u.floor)}` : location.pathname + location.search);
    } catch {}
  };
  function setCurrent(id) {
    current = id ? byKey(keyOf(id, currentPlanFloor)) ?? null : null;
    setHash(current);
    if (current) setFavButtons(current);
  }
  document.addEventListener("showroom:maqueta", (e) => setCurrent(e.detail.unitId));
  document.addEventListener("showroom:maqueta-close", () => !unitViewOpen && setCurrent(null));
  document.addEventListener("showroom:unit", (e) => setCurrent(e.detail.unitId));
  document.addEventListener("showroom:unit-close", () => setCurrent(null));

  async function shareUnit(u) {
    const url = unitUrl(u);
    const title = `${PROJECT.name} · Unidad ${u.id}`;
    const text = `${typeLabel(u.typology)} · ${floorLabel(u.floor)}${u.area ? ` · ${fmtArea(u.area)}` : ""}`;
    // En el celular, el menú de compartir del sistema (WhatsApp, etc.); en la compu, se copia el link.
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link de la unidad copiado");
    } catch {
      toast(url, 6000);
    }
  }

  // ---------- Aviso corto abajo ----------
  let toastTimer = null;
  function toast(msg, ms = 2600) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("visible");
      toastTimer = setTimeout(() => (el.hidden = true), 300);
    }, ms);
  }

  // ---------- Botones de la unidad: maqueta, departamento y ficha técnica ----------
  const actionBtn = (act, icon, label, cls = "") =>
    `<button type="button" class="u-act ${cls}" data-act="${act}"><span class="ic">${ICONS[icon]}</span><span class="lb">${label}</span></button>`;
  function initUnitActions() {
    $("maqueta-actions").innerHTML =
      actionBtn("fav", "star", "Guardar") + actionBtn("share", "share", "Compartir") + actionBtn("pdf", "download", "Ficha PDF") + actionBtn("ask", "chat", "Consultar", "primary");
    $("unit-view-tools").innerHTML =
      `<button type="button" class="u-tool" data-act="fav" title="Guardar en favoritas"><span class="ic">${ICONS.star}</span></button>` +
      `<button type="button" class="u-tool" data-act="share" title="Compartir esta unidad"><span class="ic">${ICONS.share}</span></button>`;
    $("unit-sheet-actions").innerHTML = actionBtn("pdf", "download", "Descargar ficha") + actionBtn("ask", "chat", "Consultar", "primary");
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn || !current) return;
      if (!btn.closest("#maqueta, #unit-view")) return;
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === "fav") toggleFav(current);
      else if (act === "share") shareUnit(current);
      else if (act === "pdf") printSheet(current);
      else if (act === "ask") openAsk(current);
    });
    // "Consultar" del departamento: abre el formulario (que arma el mensaje de WhatsApp con los datos).
    $("unit-view-wa").addEventListener("click", (e) => {
      if (!current) return;
      e.preventDefault();
      openAsk(current);
    });
  }

  // ---------- Panel de unidades ----------
  const state = { tab: "all", type: "all", onlyFree: true };

  function initPanel() {
    $("search-btn").addEventListener("click", (e) => {
      e.stopImmediatePropagation();
      $("units-panel").hidden ? openPanel() : closePanel();
    }, true);
    document.querySelectorAll("[data-close-units]").forEach((el) => el.addEventListener("click", closePanel));
    const types = [["all", "Todas"], ...TYPE_ORDER.map((t) => [t, typeLabel(t)])];
    $("units-types").innerHTML = types.map(([id, label]) => `<button type="button" class="chip" data-type="${id}">${esc(label)}</button>`).join("");
    $("units-types").addEventListener("click", (e) => {
      const b = e.target.closest("[data-type]");
      if (!b) return;
      state.type = b.dataset.type;
      renderList();
    });
    $("units-floors").innerHTML = SITE_PLAN.floors.map((f) => `<button type="button" data-floor="${f.id}">${esc(f.label)}</button>`).join("");
    $("units-floors").addEventListener("click", (e) => {
      const b = e.target.closest("[data-floor]");
      if (b) setPlanFloor(b.dataset.floor); // el plano cambia de planta y el panel se entera por "showroom:floor"
    });
    $("units-free").addEventListener("change", (e) => {
      state.onlyFree = e.target.checked;
      renderList();
    });
    $("units-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (!b) return;
      state.tab = b.dataset.tab;
      renderList();
    });
    $("units-compare").addEventListener("click", openCompare);
    const list = $("units-list");
    list.addEventListener("click", (e) => {
      const row = e.target.closest("[data-key]");
      if (!row) return;
      const u = byKey(row.dataset.key);
      if (e.target.closest(".u-fav")) return toggleFav(u);
      goToUnit(u);
    });
    // Al pasar por una fila se marca su departamento en la implantación.
    list.addEventListener("pointerover", (e) => peek(e.target.closest("[data-key]")?.dataset.key));
    list.addEventListener("pointerleave", () => peek(null));
    document.addEventListener("showroom:floor", () => !$("units-panel").hidden && renderList());
  }

  function openPanel() {
    if (!$("nearby-panel").hidden) closeNearby();
    if (!planViewOn) showPlanView(true);
    else setTopbarMenu(false); // el menú de arriba se guarda al abrir el panel
    $("units-panel").hidden = false;
    $("plan-view").classList.add("with-panel"); // la implantación se achica y queda entera al lado del panel
    $("search-btn").setAttribute("aria-expanded", "true");
    renderList();
  }

  function closePanel() {
    $("units-panel").hidden = true;
    $("plan-view").classList.remove("with-panel");
    $("search-btn").setAttribute("aria-expanded", "false");
    peek(null);
    spots().forEach((el) => el.classList.remove("dim"));
  }

  const spots = () => document.querySelectorAll("#unit-spots .unit-spot");
  const spotOf = (id) => document.querySelector(`#unit-spots [data-unit="${CSS.escape(id)}"]`);

  function peek(key) {
    spots().forEach((el) => el.classList.remove("peek"));
    const u = key && byKey(key);
    if (u && u.floor === currentPlanFloor) spotOf(u.id)?.classList.add("peek");
  }

  function renderList() {
    const floor = currentPlanFloor;
    const fav = state.tab === "fav";
    $("units-tabs").querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    $("units-types").querySelectorAll("[data-type]").forEach((b) => b.classList.toggle("active", b.dataset.type === state.type));
    $("units-floors").querySelectorAll("[data-floor]").forEach((b) => b.classList.toggle("active", b.dataset.floor === floor));
    $("units-filters").hidden = fav;
    $("units-compare-bar").hidden = !fav;
    const list = (fav
      ? ALL.filter((u) => favs.has(u.key))
      : ALL.filter((u) => u.floor === floor && (state.type === "all" || u.typology === state.type) && (!state.onlyFree || u.status === "disponible"))
    ).sort(sortUnits);
    // Resumen y, en la implantación, se apagan los departamentos que no entran en la búsqueda.
    if (fav) {
      $("units-count").textContent = favs.size ? `${favs.size} ${favs.size === 1 ? "unidad guardada" : "unidades guardadas"}` : "";
      $("units-compare").disabled = favs.size < 2;
      $("units-compare").textContent = favs.size > MAX_COMPARE ? `Comparar las primeras ${MAX_COMPARE}` : "Comparar favoritas";
    } else {
      const free = ALL.filter((u) => u.floor === floor && u.status === "disponible").length;
      $("units-count").innerHTML = `<strong>${list.length}</strong> ${list.length === 1 ? "unidad" : "unidades"} · ${free} disponibles en ${esc(floorLabel(floor).toLowerCase())}`;
    }
    const match = new Set(list.filter((u) => u.floor === floor).map((u) => u.id));
    spots().forEach((el) => el.classList.toggle("dim", !match.has(el.dataset.unit)));
    $("units-list").innerHTML = list.length
      ? list.map((u) => rowHtml(u, fav)).join("")
      : `<li class="units-empty">${
          fav
            ? `Todavía no guardaste unidades.<br />Tocá <span class="inline-ic">${ICONS.star}</span> en una unidad para guardarla y compararla.`
            : "No hay unidades con esos filtros en esta planta.<br />Probá con otra tipología o con la otra planta."
        }</li>`;
  }

  function rowHtml(u, showFloor) {
    const info = infoOf(u);
    const on = favs.has(u.key);
    const sub = [typeLabel(u.typology), fmtArea(u.area)].filter(Boolean).join(" · ");
    return `<li class="u-row ${u.status}" data-key="${esc(u.key)}">
      <button type="button" class="u-main">
        <span class="u-thumb">${info.model3d ? `<img src="${esc(info.model3d)}" alt="" loading="lazy" />` : ""}</span>
        <span class="u-text"><strong>Unidad ${esc(u.id)}</strong><small>${esc(sub)}</small>${showFloor ? `<small>${esc(floorLabel(u.floor))}</small>` : ""}</span>
        <em class="badge ${u.status}">${STATUS_LABELS[u.status]}</em>
      </button>
      <button type="button" class="u-fav" aria-pressed="${on}" aria-label="${on ? "Quitar de favoritas" : "Guardar en favoritas"}">${on ? ICONS.starOn : ICONS.star}</button>
    </li>`;
  }

  // Lleva a la unidad: cambia de planta si hace falta, la centra (en el celular la implantación se desliza) y abre su maqueta.
  function goToUnit(u) {
    if (isPhone()) closePanel();
    closeCompare();
    if (!$("nearby-panel").hidden) closeNearby();
    const wait = planViewOn ? 0 : 900;
    if (!planViewOn) showPlanView(true);
    setTimeout(() => {
      if (currentPlanFloor !== u.floor) setPlanFloor(u.floor);
      const spot = spotOf(u.id);
      if (!spot) return;
      spot.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      setTimeout(() => (modelFor(u.id) ? openMaqueta(u.id, spot) : openUnitView(u.id)), isPhone() ? 380 : 60);
    }, wait);
  }

  // ---------- Comparador ----------
  function openCompare() {
    const list = [...favs].map(byKey).filter(Boolean).sort(sortUnits).slice(0, MAX_COMPARE);
    if (list.length < 2) return;
    const col = (fn) => list.map((u) => `<td>${fn(u, infoOf(u))}</td>`).join("");
    const extra = (info) => (info.areas ?? []).slice(1).map(([v, l]) => `${esc(v)} ${esc(l)}`).join("<br />") || "—";
    const rows = [
      ["", (u, i) => `<div class="cmp-img">${i.model3d ? `<img src="${esc(i.model3d)}" alt="Plano 3D ${esc(typeLabel(u.typology))}" />` : ""}</div>`],
      ["Unidad", (u) => `<strong class="cmp-id">${esc(u.id)}</strong> <em class="badge ${u.status}">${STATUS_LABELS[u.status]}</em>`],
      ["Tipología", (u) => esc(typeLabel(u.typology))],
      ["Prototipo", (u, i) => esc(i.prototype ?? "—")],
      ["Planta", (u) => esc(floorLabel(u.floor))],
      ["Sup. cubierta", (u) => (u.area ? `<strong>${fmtArea(u.area)}</strong>` : "—")],
      ["Otras superficies", (u, i) => extra(i)],
      ["Ambientes", (u, i) => (i.rooms?.length ? `<ul>${i.rooms.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : "—")],
      ...(list.some((u) => u.price) ? [["Precio", (u) => (u.price && u.status !== "vendida" ? `<strong>${esc(u.price)}</strong>` : "—")]] : []),
      ["", (u) => `<div class="cmp-actions"><button type="button" class="btn btn-ghost" data-cmp-go="${esc(u.key)}">Ver unidad</button>${
        u.status !== "vendida" ? `<button type="button" class="btn" data-cmp-ask="${esc(u.key)}">Consultar</button>` : ""
      }</div>`],
    ];
    $("compare-table").innerHTML = `<tbody>${rows.map(([label, fn]) => `<tr><th scope="row">${label}</th>${col(fn)}</tr>`).join("")}</tbody>`;
    $("compare-modal").hidden = false;
  }
  function closeCompare() {
    $("compare-modal").hidden = true;
  }
  function initCompare() {
    document.querySelectorAll("[data-close-compare]").forEach((el) => el.addEventListener("click", closeCompare));
    $("compare-table").addEventListener("click", (e) => {
      const go = e.target.closest("[data-cmp-go]");
      const ask = e.target.closest("[data-cmp-ask]");
      if (go) {
        closePanel();
        goToUnit(byKey(go.dataset.cmpGo));
      } else if (ask) openAsk(byKey(ask.dataset.cmpAsk));
    });
  }

  // ---------- Consulta: formulario que arma el mensaje de WhatsApp ----------
  let askUnit = null;
  const unitText = (u) => `la Unidad ${u.id} (${typeLabel(u.typology)}, ${floorLabel(u.floor).toLowerCase()})`;

  function openAsk(u = null) {
    askUnit = u;
    const ctx = $("ask-unit");
    ctx.hidden = !u;
    if (u) {
      ctx.innerHTML = `<span class="u-thumb">${infoOf(u).model3d ? `<img src="${esc(infoOf(u).model3d)}" alt="" />` : ""}</span>
        <span class="u-text"><strong>Unidad ${esc(u.id)}</strong><small>${esc([typeLabel(u.typology), floorLabel(u.floor), fmtArea(u.area)].filter(Boolean).join(" · "))}</small></span>
        <em class="badge ${u.status}">${STATUS_LABELS[u.status]}</em>`;
    }
    $("ask-title").textContent = u ? "Consultar por esta unidad" : `Consultar por ${PROJECT.name}`;
    $("ask-msg").value = u
      ? u.status === "vendida"
        ? `Vi que ${unitText(u)} está vendida. ¿Tienen otra parecida disponible?`
        : `Me interesa ${unitText(u)}. ¿Me pasan precio y formas de pago?`
      : "Me interesa el proyecto. ¿Me pasan información de las unidades disponibles?";
    try {
      const saved = JSON.parse(localStorage.getItem(CONTACT_KEY)) ?? {};
      if (saved.name && !$("ask-name").value) $("ask-name").value = saved.name;
    } catch {}
    $("ask-modal").hidden = false;
    setTimeout(() => ($("ask-name").value ? $("ask-msg") : $("ask-name")).focus(), 60);
  }
  function closeAsk() {
    $("ask-modal").hidden = true;
  }
  function initAsk() {
    document.querySelectorAll("[data-close-ask]").forEach((el) => el.addEventListener("click", closeAsk));
    $("ask-fab").addEventListener("click", () => openAsk(null));
    $("ask-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("ask-name").value.trim();
      const when = $("ask-when").value;
      const msg = $("ask-msg").value.trim();
      if (!name) return $("ask-name").focus();
      try {
        localStorage.setItem(CONTACT_KEY, JSON.stringify({ name }));
      } catch {}
      const lines = [
        `Hola! Soy ${name}.`,
        msg,
        askUnit ? `Unidad ${askUnit.id} · ${typeLabel(askUnit.typology)} · ${floorLabel(askUnit.floor)}${askUnit.area ? ` · ${fmtArea(askUnit.area)}` : ""}` : "",
        when ? `Prefiero que me contacten ${when}.` : "",
        askUnit ? unitUrl(askUnit) : "",
      ].filter(Boolean);
      window.open(`https://wa.me/${PROJECT.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");
      closeAsk();
      toast("Te llevamos a WhatsApp para enviar la consulta");
    });
    document.addEventListener("showroom:plan", (e) => ($("ask-fab").hidden = !e.detail.show || !PROJECT.whatsapp));
  }

  // ---------- Ficha para descargar: hoja A4 que se imprime o se guarda como PDF ----------
  async function printSheet(u) {
    const info = infoOf(u);
    const date = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
    const areas = (info.areas ?? []).map(([v, l]) => `<div><dt>${esc(v)}</dt><dd>${esc(l)}</dd></div>`).join("");
    $("print-sheet").innerHTML = `
      <header class="ps-head">
        <div class="ps-brand">pilar de <span>diseño</span></div>
        <div class="ps-project"><strong>${esc(PROJECT.name)}</strong><span>${esc(PROJECT.tagline)}</span></div>
      </header>
      <section class="ps-title">
        <p class="ps-eyebrow">${esc(info.prototype ?? "Ficha técnica")} · ${esc(floorLabel(u.floor))}</p>
        <h1>Unidad ${esc(u.id)} <span>${esc(typeLabel(u.typology))}</span></h1>
        <p class="ps-status ${u.status}">${STATUS_LABELS[u.status]}</p>
      </section>
      ${info.model3d ? `<figure class="ps-img"><img id="ps-img" src="${esc(info.model3d)}" alt="" /></figure>` : ""}
      <section class="ps-grid">
        ${areas ? `<div><h2>Superficies</h2><dl class="ps-areas">${areas}</dl></div>` : ""}
        ${info.rooms?.length ? `<div><h2>Ambientes</h2><ul class="ps-rooms">${info.rooms.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
        ${u.price && u.status !== "vendida" ? `<div><h2>Precio</h2><p class="ps-price">${esc(u.price)}</p></div>` : ""}
      </section>
      <footer class="ps-foot">
        <span>Recorré la unidad en 360°: ${esc(unitUrl(u))}</span>
        <span>${esc(date)} · Imágenes ilustrativas</span>
      </footer>`;
    const img = $("ps-img");
    if (img) await img.decode().catch(() => {});
    const title = document.title;
    document.title = `${PROJECT.name} - Unidad ${u.id} - Ficha`; // nombre que propone el navegador para el PDF
    window.print();
    setTimeout(() => (document.title = title), 500);
  }

  // ---------- Link directo a una unidad: #/unidad/B1/baja ----------
  // Con el link, "Entrar" va directo a la unidad: sin el vuelo ni el video.
  const deep = location.hash.match(/^#\/unidad\/([^/]+)\/([^/]+)$/);
  let pending = deep ? byKey(keyOf(decodeURIComponent(deep[1]), decodeURIComponent(deep[2]))) : null;
  if (pending) {
    PROJECT.introVideo = null; // antes de que showroom.js empiece a bajar el video (DOMContentLoaded)
    $("enter-btn").textContent = `Ver unidad ${pending.id}`;
    $("enter-btn").addEventListener("click", (e) => {
      e.stopImmediatePropagation();
      $("intro").classList.add("fade-out");
      setTimeout(() => ($("intro").hidden = true), 700);
      skipIntro();
    }, true);
    document.addEventListener("showroom:plan", (e) => {
      if (!e.detail.show || !pending) return;
      const u = pending;
      pending = null;
      setTimeout(() => goToUnit(u), 700);
    });
  }

  // ---------- Teclado: Escape cierra primero lo de acá ----------
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = ["ask-modal", "compare-modal"].find((id) => !$(id).hidden);
    if (open) {
      e.stopImmediatePropagation();
      return open === "ask-modal" ? closeAsk() : closeCompare();
    }
    if (!$("units-panel").hidden && $("maqueta").hidden && !unitViewOpen) {
      e.stopImmediatePropagation();
      closePanel();
    }
  }, true);

  document.addEventListener("DOMContentLoaded", () => {
    initUnitActions();
    initPanel();
    initCompare();
    initAsk();
    refreshFavUi();
  });
})();
