# Pilar de Diseño · demo

Página de muestra para el estudio: portada, mapa de San Juan con las obras, portfolio con filtros, ficha de cada proyecto y contacto.

## Verla

Servirla localmente (abrir `index.html` como archivo puede hacer que el mapa no cargue):

```bash
python3 serve.py
# http://localhost:8080  ·  showroom: http://localhost:8080/showroom/
```

`serve.py` es como `python3 -m http.server`, pero evita que el navegador muestre una versión vieja después de cambiar archivos.

## Cambiar el contenido

- **Proyectos:** `projects.js`. Cada proyecto tiene nombre, tipo, ubicación, año, superficie, coordenadas (`lat`, `lng`) y descripción.
  - Coordenadas: en Google Maps, clic derecho sobre el lugar y copiar los números.
  - Fotos: guardarlas en `img/` y poner la ruta en `image` (ej. `"img/casa-zonda.jpg"`).
- **WhatsApp:** `WHATSAPP_NUMBER` en `projects.js`.
- **Colores y tipografías:** variables al principio de `styles.css`.
- **Recorridos 360° del showroom:** `TOURS_360` en `showroom/data.js`. Se abren con el botón "Recorrido 360°" de la barra superior, de cada piso y de cada unidad.
- **Ubicación del edificio del showroom:** `center`, `widthMeters`, `depthMeters` y `groundElevation` (altura del terreno, se ve en Google Earth) en `showroom/data.js`. Después de cambiarlos, regenerar los edificios vecinos, que se bajan de OpenStreetMap sin los que caen sobre el lote (tarda alrededor de un minuto):

  ```bash
  cd showroom
  python3 tools/edificios_osm.py <lat> <lng> <ancho_m> <fondo_m>
  ```

## Publicarla

Arrastrar la carpeta a https://app.netlify.com/drop o subirla a Vercel. No necesita servidor.
