// Datos de ejemplo del proyecto. Reemplazar con los reales.
const PROJECT = {
  // Nombre tomado del cartel de la fachada en los renders.
  name: "Aspen IX",
  tagline: "27 unidades · Duplex, 1 y 2 dormitorios · Calle Santo Domingo, San Juan",
  // Imagen de fondo de la pantalla de inicio.
  cover: "img/fachada-noche.jpg",
  // Centro del lote (en Google Maps: clic derecho sobre el lugar y copiar las coordenadas).
  center: [-68.592140, -31.527967], // [lng, lat]
  // Altura del terreno en el lote, en metros sobre el nivel del mar. La cámara la necesita durante la intro:
  // sin ella usa la altura del punto de partida y queda "bajo tierra" al llegar. Se ve en Google Earth.
  groundElevation: 684,
  // Tamaño aproximado de la planta, en metros.
  widthMeters: 34,
  depthMeters: 22,
  floors: 12,
  groundFloorHeight: 4.5,
  floorHeight: 3.2,
  whatsapp: "5492640000000",
};

// Implantación: render del conjunto visto desde arriba, apoyado sobre el lote. Si está, reemplaza a la torre en el
// mapa: la imagen aparece al llegar y la intro termina mirándola desde arriba. Para volver a la torre, borrar este bloque.
const SITE_PLAN = {
  image: "img/implantacion.jpg",
  // Centro de la imagen. Está ~15 m hacia Santo Domingo desde el lote para que la calle de abajo caiga sobre la calle real.
  center: [-68.5919844, -31.5279488], // [lng, lat]
  // Medidas reales de lo que muestra la imagen, en metros (estimadas por el ancho de las unidades: ajustar con el plano).
  // El alto sale de la proporción de la imagen (1741 × 701 px) para que no se deforme.
  widthMeters: 119,
  heightMeters: 119 * (701 / 1741),
  // Hacia dónde apunta el borde de arriba de la imagen (0 norte, 90 este, 180 sur, 270 oeste).
  // Santo Domingo corre a 352,4° frente al lote: con 262,4 la calle de abajo queda paralela a ella, y la de la
  // izquierda al sur (hacia Libertador).
  topBearing: 262.4,
  // Calles que se marcan en la intro. `name` como en OpenStreetMap: tools/calles_osm.py las baja a streets.geojson.
  streets: [
    { name: "Santo Domingo", label: "Calle Santo Domingo" },
    { name: "Avenida Libertador General San Martín", label: "Av. Libertador" },
  ],
  // Plantas: al cambiar de una a otra se ve la misma imagen con cada departamento en el color de su estado
  // (disponible, reservada o vendida, que se ve en gris). `status` vale para toda la planta y `except` cambia
  // departamentos sueltos, por ejemplo { D3: "reservada" }. Para la demo: la baja toda disponible y la alta vendida.
  floors: [
    // DATOS DE DEMO: reemplazar por el estado real de cada departamento.
    {
      id: "baja", label: "Planta baja", status: "disponible",
      except: { D2: "vendida", D5: "reservada", D9: "vendida", A3: "vendida", A6: "reservada", B2: "vendida", B5: "vendida", B7: "reservada" },
    },
    {
      id: "alta", label: "Planta alta", status: "vendida",
      except: { D1: "disponible", D4: "disponible", D7: "reservada", D10: "disponible", A1: "disponible", A5: "disponible", A8: "reservada", B3: "disponible", B6: "disponible", B8: "reservada" },
    },
  ],
  // Características que muestra la tarjeta al pasar el mouse por un departamento, por tipología (salen de los planos:
  // confirmarlas con el cliente). `area` en m² (null = no se muestra). Un departamento puede pisar `area` o `price`
  // con sus propios valores en `units`, por ejemplo { id: "D1", ..., area: 92, price: "USD 98.000" }.
  typologyInfo: {
    duplex: { features: ["2 dormitorios", "2 baños", "Vestidor", "Dos plantas"], area: null },
    monoambiente: { features: ["Ambiente integrado", "Dormitorio, cocina y comedor"], area: null },
    "1-dormitorio": { features: ["1 dormitorio", "Cocina y comedor"], area: null },
    "2-dormitorios": { features: ["2 dormitorios", "Vestidor", "Living", "Cocina y comedor"], area: null },
  },
  // Departamentos marcados sobre la implantación. `box`: [izquierda, arriba, derecha, abajo] en píxeles de la imagen
  // (imageSize). `typology` es el id del recorrido 360° (TOURS_360) y de los renders; si una tipología todavía no
  // tiene renders propios, se muestran los del Duplex.
  imageSize: [1741, 701],
  units: [
    // Fila de arriba: duplex.
    { id: "D1", typology: "duplex", box: [372, 66, 466, 302] },
    { id: "D2", typology: "duplex", box: [466, 66, 564, 302] },
    { id: "D3", typology: "duplex", box: [564, 66, 657, 302] },
    { id: "D4", typology: "duplex", box: [657, 66, 755, 302] },
    { id: "D5", typology: "duplex", box: [755, 66, 847, 302] },
    { id: "D6", typology: "duplex", box: [847, 66, 942, 302] },
    { id: "D7", typology: "duplex", box: [1230, 66, 1325, 302] },
    { id: "D8", typology: "duplex", box: [1325, 66, 1420, 302] },
    { id: "D9", typology: "duplex", box: [1420, 66, 1515, 302] },
    { id: "D10", typology: "duplex", box: [1515, 66, 1610, 302] },
    { id: "D11", typology: "duplex", box: [1610, 66, 1702, 302] },
    // Abajo, primera hilera (la que da a la calle interna).
    { id: "A1", typology: "monoambiente", box: [377, 392, 485, 487] },
    { id: "A2", typology: "monoambiente", box: [485, 392, 585, 487] },
    { id: "A3", typology: "monoambiente", box: [585, 392, 692, 487] },
    { id: "A4", typology: "2-dormitorios", box: [730, 392, 930, 487] },
    { id: "A5", typology: "2-dormitorios", box: [1060, 392, 1260, 490] },
    { id: "A6", typology: "monoambiente", box: [1305, 392, 1407, 490] },
    { id: "A7", typology: "monoambiente", box: [1407, 392, 1512, 490] },
    { id: "A8", typology: "2-dormitorios", box: [1517, 392, 1712, 490] },
    // Abajo, segunda hilera (la que da a Santo Domingo).
    { id: "B1", typology: "1-dormitorio", box: [377, 507, 502, 660] },
    { id: "B2", typology: "1-dormitorio", box: [502, 507, 627, 660] },
    { id: "B3", typology: "1-dormitorio", box: [627, 507, 752, 660] },
    { id: "B4", typology: "2-dormitorios", box: [752, 507, 955, 660] },
    { id: "B5", typology: "2-dormitorios", box: [1035, 507, 1242, 660] },
    { id: "B6", typology: "1-dormitorio", box: [1242, 507, 1367, 660] },
    { id: "B7", typology: "1-dormitorio", box: [1367, 507, 1487, 660] },
    { id: "B8", typology: "1-dormitorio", box: [1487, 507, 1612, 660] },
  ],
  // Tocando la pileta en la implantación, la imagen se acerca a ella y se abre el video a pantalla completa;
  // cuando termina, se funde en `end` (su primer cuadro: la toma abierta, sin el acercamiento de la cámara). `image` es la de la galería de amenities.
  // Videos: `start` y `end` son su primer y último cuadro (img/cuadros/), para entrar y salir del video sin saltos.
  amenities: {
    label: "Amenities",
    video: "video/pileta.mp4", start: "img/cuadros/pileta-inicio.jpg", end: "img/cuadros/pileta-inicio.jpg" /* termina en la toma abierta del comienzo */,
    image: "img/amenities.jpg",
    // Dónde está la pileta en la imagen de la implantación, como fracción (0 a 1) desde arriba a la izquierda.
    pool: { x: [0.635, 0.7], y: [0.217, 0.302] },
  },
  // Vista exterior: renders del conjunto por fuera (zip "Exteriores"), enteros y con un leve movimiento en profundidad
  // al mover el puntero.
  facade: [
    { label: "Fachada", image: "img/exteriores/fachada.jpg", video: "video/exterior-fachada.mp4", start: "img/cuadros/exterior-fachada-inicio.jpg", end: "img/cuadros/exterior-fachada-inicio.jpg", fit: "contain" },
    { label: "Frente", image: "img/exteriores/frente.jpg", video: "video/exterior-frente.mp4", start: "img/cuadros/exterior-frente-inicio.jpg", end: "img/cuadros/exterior-frente-inicio.jpg", fit: "contain" },
    { label: "Acceso", image: "img/exteriores/acceso.jpg", video: "video/exterior-acceso.mp4", start: "img/cuadros/exterior-acceso-inicio.jpg", end: "img/cuadros/exterior-acceso-inicio.jpg", fit: "contain" },
    { label: "Calle interna", image: "img/exteriores/calle-interna.jpg", video: "video/exterior-calle-interna.mp4", start: "img/cuadros/exterior-calle-interna-inicio.jpg", end: "img/cuadros/exterior-calle-interna-inicio.jpg", fit: "contain" },
    { label: "Ingreso", image: "img/exteriores/ingreso.jpg", video: "video/exterior-ingreso.mp4", start: "img/cuadros/exterior-ingreso-inicio.jpg", end: "img/cuadros/exterior-ingreso-inicio.jpg", fit: "contain" },
    { label: "Atardecer", image: "img/fachada-atardecer.jpg", video: "video/exterior-atardecer.mp4", start: "img/cuadros/exterior-atardecer-inicio.jpg", end: "img/fachada-atardecer.jpg", fit: "contain" },
    { label: "Noche", image: "img/fachada-noche.jpg", fit: "contain" },
  ],
  // Renders del interior por tipología (plano y botón "Ver unidad" de cada departamento). El primero (Duplex) es el general:
  // las demás tipologías se suman como otro bloque { id, typology, images } con el `id` de TOURS_360.
  renders: [
    {
      id: "duplex",
      typology: "Duplex",
      // Plano: es lo primero que se ve al abrir un duplex. Cada ambiente se toca y abre su render (`view` es la
      // posición en `images`). `box`: [izquierda, arriba, derecha, abajo] en píxeles del plano (`size`).
      // Patio y balcón no tienen render, así que no se tocan.
      plan: {
        image: "img/renders/duplex/plano.jpg",
        size: [1080, 1350],
        rooms: [
          { label: "Living", view: 0, box: [30, 295, 435, 600] },
          { label: "Comedor", view: 1, box: [25, 600, 435, 860] },
          { label: "Cocina", view: 1, box: [25, 860, 190, 1100] },
          { label: "Baño 1", view: 4, box: [445, 295, 535, 540] },
          { label: "Dormitorio 2", view: 3, box: [595, 310, 860, 550] },
          { label: "Baño 2", view: 4, box: [595, 615, 790, 770] },
          { label: "Dormitorio 1", view: 2, box: [595, 780, 865, 1045] },
          { label: "Vestidor", view: 2, box: [865, 735, 1050, 1045] },
        ],
      },
      images: [
        { label: "Living", image: "img/renders/duplex/living.jpg" },
        { label: "Comedor y cocina", image: "img/renders/duplex/comedor-cocina.jpg" },
        { label: "Dormitorio principal", image: "img/renders/duplex/dormitorio-principal.jpg" },
        { label: "Dormitorio", image: "img/renders/duplex/dormitorio.jpg" },
        { label: "Baño", image: "img/renders/duplex/bano.jpg" },
      ],
    },
    {
      id: "monoambiente",
      typology: "Monoambiente",
      // Un solo render (dormitorio y cocina en el mismo ambiente). Baño y balcón no tienen render.
      plan: {
        image: "img/renders/monoambiente/plano.jpg",
        size: [1350, 1080],
        rooms: [
          { label: "Dormitorio", view: 0, box: [262, 375, 660, 905] },
          { label: "Cocina y comedor", view: 1, box: [660, 420, 1252, 1035] },
        ],
      },
      images: [
        { label: "Dormitorio y cocina", image: "img/renders/monoambiente/dormitorio-cocina.jpg", video: "video/mono-dormitorio.mp4", start: "img/cuadros/mono-dormitorio-inicio.jpg", end: "img/cuadros/mono-dormitorio-final.jpg" },
        { label: "Cocina y comedor", image: "img/renders/monoambiente/cocina.jpg", video: "video/mono-cocina.mp4", start: "img/cuadros/mono-cocina-inicio.jpg", end: "img/cuadros/mono-cocina-final.jpg" },
      ],
    },
    {
      id: "1-dormitorio",
      typology: "1 dormitorio",
      // El zip trae el mismo plano que el monoambiente (idéntico archivo): reemplazarlo si hay uno propio.
      plan: {
        image: "img/renders/1-dormitorio/plano.jpg",
        size: [1350, 1080],
        rooms: [
          { label: "Dormitorio", view: 1, box: [262, 375, 660, 905] },
          { label: "Cocina y comedor", view: 0, box: [660, 420, 1252, 1035] },
        ],
      },
      images: [
        { label: "Cocina y living", image: "img/renders/1-dormitorio/cocina-living.jpg" },
        { label: "Dormitorio", image: "img/renders/1-dormitorio/dormitorio.jpg" },
      ],
    },
    {
      id: "2-dormitorios",
      typology: "2 dormitorios",
      // El dormitorio 2 se muestra con tres ambientaciones posibles, cada una con su video (se reproduce en loop).
      plan: {
        image: "img/renders/2-dormitorios/plano.jpg",
        size: [1350, 1080],
        rooms: [
          { label: "Living", view: 0, box: [780, 75, 1155, 300] },
          { label: "Cocina y comedor", view: 1, box: [802, 300, 1268, 728] },
          { label: "Dormitorio 1", view: 2, box: [52, 495, 420, 833] },
          { label: "Vestidor", view: 2, box: [52, 232, 420, 495] },
          { label: "Dormitorio 2", view: 3, box: [442, 315, 780, 660] },
        ],
      },
      images: [
        { label: "Living", image: "img/renders/2-dormitorios/living.jpg", video: "video/2d-living.mp4", start: "img/cuadros/2d-living-inicio.jpg", end: "img/cuadros/2d-living-final.jpg" },
        { label: "Cocina y comedor", image: "img/renders/2-dormitorios/cocina-comedor.jpg" },
        { label: "Dormitorio principal", image: "img/renders/2-dormitorios/dormitorio-principal.jpg" },
        // "Imaginar": el mismo dormitorio en tres etapas de la vida. Adentro se elige la etapa en una línea de tiempo;
        // cada toque reinicia su video y al terminar se funde en `end`: el render del dormitorio ambientado, sin gente.
        {
          label: "Dormitorio 2",
          caption: "Imaginá tu espacio en unos años",
          stages: [
            { label: "Niñez", video: "video/dormitorio-bebe.mp4", start: "img/cuadros/dormitorio-bebe-inicio.jpg", end: "img/renders/2-dormitorios/dormitorio-bebe.jpg" },
            { label: "Juventud", video: "video/dormitorio-juvenil.mp4", start: "img/cuadros/dormitorio-juvenil-inicio.jpg", end: "img/renders/2-dormitorios/dormitorio-juvenil.jpg" },
            { label: "Adultez", video: "video/dormitorio-mayores.mp4", start: "img/cuadros/dormitorio-mayores-inicio.jpg", end: "img/renders/2-dormitorios/dormitorio-mayores.jpg" },
          ],
        },
      ],
    },
  ],
};

// Tipologías por letra de departamento.
const TYPOLOGIES = {
  A: { rooms: 4, area: 146, orientation: "Norte · esquina" },
  B: { rooms: 3, area: 104, orientation: "Norte" },
  C: { rooms: 2, area: 72, orientation: "Sur" },
  D: { rooms: 3, area: 118, orientation: "Sur · esquina" },
};

// Recorridos 360° (D5 Render). Se ven dentro del showroom con el botón "Recorrido 360°".
// Se usa la URL directa del visor (showreel.d5render.com/personal-krpano?...) para evitar la redirección
// del enlace corto (share.d5render.com/.../shortLink/...). El corto también funciona si se pega tal cual.
// Para sacar la directa: abrir el enlace corto en el navegador y copiar la URL a la que redirige.
const TOURS_360 = [
  // Corto: https://share.d5render.com/user-hub/showreel/shortLink/AYHOcP
  { id: "duplex", label: "Duplex", url: "https://showreel.d5render.com/personal-krpano?directory=https://usa.asset.d5cdn.com/tourProject/pano_roam_1780451440295_3717703/&tourId=2061989254366937089" },
  // Corto: https://share.d5render.com/user-hub/showreel/shortLink/c4QNl6
  { id: "2-dormitorios", label: "2 dormitorios", url: "https://showreel.d5render.com/personal-krpano?directory=https://usa.asset.d5cdn.com/tourProject/pano_roam_1780246621018_3717703/&tourId=2061130258235965441" },
  // Corto: https://share.d5render.com/user-hub/showreel/shortLink/GPNCvu
  { id: "1-dormitorio", label: "1 dormitorio", url: "https://showreel.d5render.com/personal-krpano?directory=https://usa.asset.d5cdn.com/tourProject/pano_roam_1780161487958_3717703/&tourId=2060773063308787713" },
  // Corto: https://share.d5render.com/user-hub/showreel/shortLink/MvePhy
  { id: "monoambiente", label: "Monoambiente", url: "https://showreel.d5render.com/personal-krpano?directory=https://usa.asset.d5cdn.com/tourProject/pano_roam_1780327298110_3717703/&tourId=2061468304005316610" },
];

// Estado de cada unidad. Generado de forma fija para la demo (siempre da lo mismo).
const UNITS = (() => {
  const statuses = ["disponible", "disponible", "disponible", "reservada", "vendida", "disponible", "vendida", "disponible"];
  const list = [];
  for (let floor = 1; floor <= PROJECT.floors; floor++) {
    Object.entries(TYPOLOGIES).forEach(([letter, t], i) => {
      const seed = (floor * 7 + i * 3) % statuses.length;
      list.push({
        id: `${floor}${letter}`,
        floor,
        letter,
        rooms: t.rooms,
        area: +(t.area + (floor % 3) * 0.6).toFixed(1),
        orientation: t.orientation,
        balcony: letter !== "C",
        status: statuses[seed],
      });
    });
  }
  return list;
})();

// Alrededores: lugares elegidos (no todo lo que hay en OpenStreetMap), con una descripción clara.
// `walk`: a pie, con distancia en línea recta desde el lote (m). `city`: lugares de la ciudad, con minutos en auto
// estimados (distancia por calles ≈ 1,35 × la recta, a la velocidad promedio de la zona). `summary`: el resumen de
// arriba del panel; cada ítem lleva a su categoría. Coordenadas de OpenStreetMap (tools/lugares_osm.py).
const NEARBY = {
  summary: [
    { label: "Hospital público", category: "salud" },
    { label: "2 colegios", category: "educacion" },
    { label: "Supermercado", category: "compras" },
    { label: "4 plazas", category: "verde" },
    { label: "Colectivos a 3 min", category: "movilidad" },
  ],
  walk: [
    { category: "educacion", name: "Colegio Integral Independencia", desc: "Colegio · primario y secundario", at: [-68.591405, -31.529266], distance: 160 },
    { category: "educacion", name: "Colegio Inglés", desc: "Colegio", at: [-68.587781, -31.532551], distance: 654 },
    { category: "salud", name: "Hospital Marcial Quiroga", desc: "Hospital público", at: [-68.596778, -31.529984], distance: 493 },
    { category: "salud", name: "Clínica San Martín", desc: "Clínica privada", at: [-68.593844, -31.530171], distance: 292 },
    { category: "salud", name: "Farmacia Central", desc: "Farmacia", at: [-68.595631, -31.530843], distance: 459 },
    { category: "compras", name: "Vea", desc: "Supermercado", at: [-68.587593, -31.528973], distance: 446 },
    { category: "compras", name: "Panadería Dulce Ana", desc: "Panadería", at: [-68.595354, -31.530779], distance: 435 },
    { category: "compras", name: "Parrilla Los Nogales", desc: "Restaurante · parrilla", at: [-68.595336, -31.525296], distance: 423 },
    { category: "compras", name: "Grido", desc: "Heladería", at: [-68.595854, -31.530890], distance: 478 },
    { category: "verde", name: "Plaza Jardín San Roberto", desc: "Plaza", at: [-68.589997, -31.528442], distance: 210 },
    { category: "verde", name: "Plaza Gendarmería Nacional", desc: "Plaza", at: [-68.590373, -31.530746], distance: 350 },
    { category: "verde", name: "Plaza María Montessori", desc: "Plaza", at: [-68.590389, -31.524961], distance: 371 },
    { category: "verde", name: "Paseo Sarmiento", desc: "Plaza y paseo", at: [-68.594153, -31.530945], distance: 381 },
    { category: "verde", name: "Baika Club", desc: "Gimnasio", at: [-68.594478, -31.531165], distance: 417 },
    { category: "movilidad", name: "Colectivos en Av. Libertador", desc: "Paradas de colectivo", at: [-68.591845, -31.529958], distance: 222 },
    { category: "movilidad", name: "Colectivos en Rastreador Calivar", desc: "Paradas de colectivo", at: [-68.595013, -31.527280], distance: 283 },
    { category: "movilidad", name: "Estación de servicio Gulf", desc: "Combustible", at: [-68.591037, -31.530223], distance: 270 },
    { category: "movilidad", name: "Comisaría 13", desc: "Policía", at: [-68.595106, -31.530932], distance: 432 },
  ],
  city: [
    { name: "Paseo Oeste Open Mall", desc: "Centro comercial", at: [-68.590362, -31.539078], distance: 1240, driveMin: 4 },
    { name: "Universidad Católica de Cuyo", desc: "Universidad", at: [-68.585262, -31.540151], distance: 1497, driveMin: 5 },
    { name: "Universidad Nacional de San Juan", desc: "Complejo universitario", at: [-68.577550, -31.541650], distance: 2050, driveMin: 6 },
    { name: "Espacio San Juan Shopping", desc: "Shopping", at: [-68.572810, -31.540376], distance: 2290, driveMin: 6 },
    { name: "Parque de Mayo", desc: "Parque", at: [-68.541706, -31.532416], distance: 4811, driveMin: 11 },
    { name: "Centro · Plaza 25 de Mayo", desc: "Centro de la ciudad", at: [-68.525030, -31.537231], distance: 6450, driveMin: 15 },
    { name: "Terminal de Ómnibus", desc: "Terminal", at: [-68.510726, -31.539198], distance: 7824, driveMin: 18 },
    { name: "Aeropuerto de San Juan", desc: "Aeropuerto", at: [-68.420019, -31.569838], distance: 16975, driveMin: 27 },
  ],
};
