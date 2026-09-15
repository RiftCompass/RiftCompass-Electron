# Changelog

Una sección por versión, la más reciente arriba. `scripts/github-release.mjs`
copia la sección de la versión que se publica al cuerpo de la release de
GitHub, así que aquí se escribe para quien instala la app, no para quien la
programa (eso va en los mensajes de commit).

## 0.3.6

- Mi Tier List: el badge de "tier real" solo aparece con datos del parche
  actual; antes podía enseñar el del parche anterior sin avisar.
  "Restablecer" pide confirmación si ya hay campeones clasificados. Se puede
  arrastrar con el teclado (espacio para coger, flechas para mover, espacio
  para soltar). "Mis tier lists" enseña qué hay en cada lista guardada sin
  tener que cargarla.
- Comparador de Cooldowns: los nombres de las habilidades salen en tu idioma
  y los segundos con la coma del idioma ("5,5s"). Si no se pueden cargar las
  habilidades, lo dice y ofrece reintentar.
- Mientras se descargan los campeones, Mi Tier List, el Simulador de Draft y
  el Comparador dicen "Cargando…" y, si falla la descarga, lo dicen y ofrecen
  reintentar (antes ponían "Ningún campeón coincide" o una caja vacía).
- Mis drafts, tier lists, mapas y builds guardados: si no se puede pedir la
  lista (sin red, sesión caducada, demasiadas peticiones), lo dice con un
  botón de reintentar en vez de "Aún no tienes…".
- Los filtros de posición del Draft y de la Tier List anuncian su nombre a
  los lectores de pantalla.

## 0.3.5

- Test de personalidad: el badge de winrate real solo aparece con datos del
  parche actual; antes podía enseñar el del parche anterior sin avisar. La
  cabecera explica de dónde salen los números, como en la web, y las clases
  de campeón ("Luchador / Tanque") salen en tu idioma (también en Champion
  Pool).
- Calculadora de oro: mientras cargan los objetos dice "Cargando…" y, si no
  se pueden descargar, lo dice y ofrece reintentar (antes ponía "Ningún
  objeto coincide con los filtros"). "Mis builds" enseña los objetos de cada
  build guardada sin tener que cargarla.
- Matchups de línea: el winrate del resumen se escribe según tu idioma
  (52,3 %), la nota de cada columna ya no depende del orden elegido, y
  cambiar de campeón conserva la posición elegida.
- Selector de campeón: se puede usar con teclado (Enter elige, Escape cierra,
  Tab recorre la lista) en Matchups, Cooldowns, Builds, Champion Pool y
  Editor de mapa.

## 0.3.4

- El icono de RiftCompass vuelve a verse en la bandeja de Windows (junto al
  reloj): la app instalada no llevaba el fichero del icono y la bandeja lo
  mostraba en blanco.

## 0.3.3

- Calculadora de oro: con la ventana estrecha, el panel de la build ya no se
  pone encima de la lista de objetos; las tres columnas se apilan como en la
  web.

## 0.3.2

- Matchups de línea rediseñados: al elegir campeón aparece un resumen de la
  línea (winrate global, partidas y rivales con muestra) con los matchups más
  cómodos y más difíciles, y cada rival lleva su barra de winrate con la marca
  del 50 %, su porcentaje y sus partidas. Se puede ordenar por winrate o por
  partidas.

## 0.3.1

- La app encuentra el cliente de League aunque esté instalado fuera de `C:`
  (lee dónde lo puso el instalador de Riot y, si hace falta, lo pregunta al
  propio proceso del cliente). En Ajustes se puede elegir la carpeta a mano.
- Las actualizaciones se instalan solas cuando no hay partida en curso, en vez
  de esperar a que cierres la app.
- Herramientas de datos: si el servidor pide esperar, se dice cuántos segundos,
  en vez de "error de red".
- La participación en asesinatos del perfil se calcula igual que en la web.
- Nombres de los campamentos de jungla en francés y alemán.
- Las llamadas a riftcompass.com tienen tiempo máximo; los ajustes y la sesión
  se guardan de forma atómica; la sesión se renueva sola antes de caducar.

## 0.3.0

- Matchups de línea, builds con orden de compra y objetos iniciales, tendencia
  del plan de mejora y "mi perfil principal".
