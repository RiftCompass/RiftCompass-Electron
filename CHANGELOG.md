# Changelog

Una sección por versión, la más reciente arriba. `scripts/github-release.mjs`
copia la sección de la versión que se publica al cuerpo de la release de
GitHub, así que aquí se escribe para quien instala la app, no para quien la
programa (eso va en los mensajes de commit).

## 0.3.10

- Overlay: en la selección de campeón los compañeros salen como "Aliado 2",
  "Aliado 3"… en vez de su Riot ID, como exigen las normas de Riot para
  clasificatoria. El resaltado de la habilidad a subir funciona con todos
  los campeones (con "Kai'Sa", "Maestro Yi" y los nombres traducidos no
  aparecía nunca). CS/min y la diferencia de oro con el formato del idioma.
- Ventana de selección de campeón: mientras carga la build dice "Cargando…"
  y, si falla (sin red, demasiadas peticiones), lo dice y ofrece
  reintentar; antes ponía "Todavía no hay build". El consejero de draft
  también reintenta y enseña la maestría con cada campeón, que ya contaba
  para el orden sin verse.
- Matchups: la ficha ofrece "Abrir {rival} en Builds de campeón", y Builds
  de campeón ofrece "Abrir en Matchups". La frase de la build general dice
  lo que pasa de verdad ("ninguna build concreta llega a 20 partidas
  contra…"). Porcentajes y partidas con el formato del idioma en todo el
  tablero y en Builds.
- Colores: la build aplicada y las píldoras del consejero en el rosa de la
  app. Francés: trato de usted en la ventana de selección.
- Accesibilidad: las píldoras de posición, rango y orden anuncian cuál
  está pulsada; la rejilla de habilidades ya no lee 72 letras invisibles y
  sus celdas editables tienen nombre.

## 0.3.9

- Perfil: si no se puede cargar (límite de Riot, red), aparece "Reintentar"
  con cuenta atrás además de "Buscar de nuevo". "Comparar" abre la Sinergia
  de grupo con ese jugador ya puesto en el primer hueco, con todo lo que da
  la herramienta (antes era un pequeño panel con solo siete medias). Si
  guardar un perfil falla (por ejemplo, sin el correo verificado), lo dice.
- Perfiles guardados: si no se puede pedir la lista (sin red, sesión
  caducada), lo dice con un botón de reintentar en vez de "Aún no tienes
  perfiles guardados"; y el perfil no enseña "Guardar" hasta saber si ya
  está guardado.
- Errores del perfil, del calendario y de la comparación en el color de
  error (antes iban en el rosa de "Guardado"); "faltan partidas de este mes"
  en ámbar, como aviso.
- Cifras con el formato del idioma: "6,4 CS/min", "KDA 2,3", nota "7,5",
  "1.500 LP".
- El plan de mejora ya no dice "sin seguimiento en el tiempo" (cada fila
  enseña "mejor que hace N días" cuando hay fotos). Ajustes: cambiar el
  nombre sin el correo verificado explica el motivo en vez de "Algo ha
  fallado". La barra lateral no enseña el correo si aún no hay nombre de
  usuario.
- Accesibilidad: etiquetas y autocompletado en el inicio de sesión y en el
  nombre de usuario, idioma con estado pulsado, selector de región con
  estado y cierre con Escape. Francés: trato de usted en el plan de mejora,
  los avisos de espera y el resumen de partida.

## 0.3.8

- Matchups de línea: al pulsar un rival se abre la ficha de ese matchup:
  winrate y partidas del enfrentamiento, la build (runas, hechizos y objetos
  principales) más jugada contra ese rival —o la habitual del campeón,
  diciéndolo, si aún no hay partidas suficientes— y el orden de habilidades.
  Desde la ficha se puede ver el matchup desde el otro lado.

## 0.3.7

- Editor de Mapa: "Cargar" un mapa guardado pide confirmación si hay algo
  dibujado, y mientras un mapa guardado está abierto el borrador del
  dispositivo no se toca. Si la carga falla (sin red, sesión caducada), lo
  dice y ofrece reintentar. "Mis mapas" indica cuántos elementos tiene cada
  mapa. El zoom se escribe según tu idioma ("125 %").
- Champion Pool Builder: las clases salen en tu idioma en las
  recomendaciones, en "Clases cubiertas" y en el aviso de clase dominante;
  nota de calidad de datos (partidas, parche, última actualización) como en
  la web; iconos de posición; cifras con el formato del idioma.
- Editor de Mapa y Champion Pool: mientras se descargan los campeones dicen
  "Cargando…" y, si falla la descarga, lo dicen y ofrecen reintentar.
- Accesibilidad: la etiqueta "Notas" del mapa enlaza con su cuadro; los
  botones de subir, bajar y quitar del pool tienen nombre.
- Español: los wards del mapa se llaman "Guardián" y "Guardián de control",
  como en el cliente. Alemán: "Ward" y "Kontroll-Ward". Francés: trato de
  usted uniforme en el Champion Pool y en el guardado del mapa.

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
