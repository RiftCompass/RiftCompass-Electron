# Changelog

Una sección por versión, la más reciente arriba. `scripts/github-release.mjs`
copia la sección de la versión que se publica al cuerpo de la release de
GitHub, así que aquí se escribe para quien instala la app, no para quien la
programa (eso va en los mensajes de commit).

## 0.3.28

Esports, antes de que la sección salga al público (ronda 36).

- Una serie sin descargar ya no dice que "su feed en directo se detuvo":
  según su estado dice que aún no se ha jugado, que está en juego o que
  las partidas llegan con la siguiente pasada horaria.
- Una serie que ya ha empezado se marca "En juego, resultado pendiente" en
  vez de "Próximamente".
- Sin datos todavía (la hora siguiente a una publicación), la sección lo
  dice así en vez de "comprueba tu conexión".
- El cuadro de playoffs ya no corta la columna de la final; un cuadro sin
  equipos aún es una línea y no ochenta cajas "Por determinar".
- Fechas del año pasado con su año; "Terminada" en vez de "Final" junto a
  "Finals"; cabeceras "Playoffs / Playoffs" sin repetir; un torneo acabado
  dice que no quedan partidos, no que no hay en siete días.
- Ficha de pro: país en tu idioma, podios sin duplicar, texto honesto
  cuando Leaguepedia tiene la página pero no la trayectoria.
- "Así lo jugaron los pros": cada partida abre su serie en Esports.
- Atribución de LoL Esports y Leaguepedia con enlaces (CC BY-SA 3.0).
- Francés y alemán con un solo término para "partida" en toda la sección.

## 0.3.27

Incluye la 0.3.26 (sección Esports), que se quedó en borrador.

- Builds de campeón: el orden de habilidades ya no propone rutas imposibles
  (Darius Top Retador ponía siete puntos en la E); ahora es la ruta legal
  con más partidas detrás, y el "Orden de maximización" sale de ella.
- "N partidas registradas" contaba diez filas por partida; ahora son
  partidas de verdad (la cifra baja diez veces, no los datos).
- Objetos del núcleo sin componentes a medias (Espada B. F., Capítulo
  perdido, Martillo de Caulfield).
- Temporizador de oleadas: la primera oleada sale a los 0:30 y antes del
  14:00 el cañón se suma a los seis súbditos; notas corregidas.
- Calculadora de oro: Maldición del sangrador de la Grieta, Arco y Yelmo
  de Doran y Guardián de control ya existen para el buscador; las botas de
  nivel 3 (Hazañas de fuerza) van en su propio grupo; sin bloque de
  componentes vacío en los objetos de support.
- Jungle XP: el Escarabajo apagado explica que no da XP hasta el nivel 3.
- Porcentajes con el formato del idioma ("52 %") también en el carril de
  perfiles, el resumen de campeones, las builds y la ventana de draft;
  "Objetos del núcleo", "Orden de maximización" y "Partidas registradas"
  como en la web.

## 0.3.26

- Nueva sección **Esports** en la pantalla de herramientas: calendario,
  resultados y cuadros de la LEC y de Worlds, y en cada partida ya jugada
  lo que cada pro llevaba al terminar: campeón, runas, objetos, KDA, oro,
  CS y objetivos. Pulsa un jugador para ver sus equipos a lo largo de los
  años, sus títulos y sus últimas partidas. Necesita que riftcompass.com
  haya publicado la sección (sale con la web del 2026-09-20).
- Builds de campeón: bloque "Así lo jugaron los pros" con las páginas de
  runas y los objetos finales más repetidos en competitivo, como recuentos
  de partidas, nunca winrates.

## 0.3.25

Incluye la 0.3.23 y la 0.3.24, que se quedaron en borrador.

- Comparador de Cooldowns: cuando una habilidad tiene el mismo enfriamiento
  en todos los rangos (la Q de Ahri, 7 s), lo dice bajo los rangos; antes
  parecía que los rangos no funcionaban.
- Números de parche como los ves en el juego: "26.18" en vez de "16.18" en
  la Meta Tier List, los matchups, las builds y la calculadora de oro.
- Diagnóstico del perfil: cuando vas a la par con tus rivales de línea en
  una métrica, lo dice así, con barra neutra, en vez de contarlo como punto
  débil.
- Porcentajes y decimales con el formato de tu idioma en todas las
  pantallas, y plurales correctos en el calendario de actividad y en el
  consejero de draft.
- Meta Tier List: dos campeones con exactamente el mismo winrate ya no
  caen en tiers distintos, y el orden es siempre el mismo.
- Carril de perfiles guardados: la propuesta "¿X eres tú? Márcalo como tu
  perfil principal" va en dos líneas, con los botones debajo; antes el
  texto se partía palabra por palabra junto a los botones.
- Instalador: páginas de bienvenida y final con la marca de RiftCompass en
  vez de la imagen genérica del instalador.

## 0.3.22

- Selección de campeón: una sola ventana de draft. Antes, en el instalador
  normal, la ventana principal saltaba a una segunda copia del consejero y
  el overlay pintaba además una tarjeta que a 1080p tapaba parte de la
  ventana de draft; el overlay ahora solo aparece en partida.
- La ventana de draft tiene barra propia con la marca, se puede arrastrar y
  lleva una X para ocultarla en ese draft.
- Resumen post-partida: se abre también cuando la app está en tu propio
  perfil, que es donde te deja al detectar el cliente. Antes solo se abría
  si habías vuelto a "Herramientas" a mano.
- Primer arranque: la ventana ya no aparece en blanco antes de pintar, y
  bajo "Herramientas" se explica que basta con abrir League (y qué hacer si
  nunca lo detecta).
- "Calibrar barra de habilidades" solo se puede lanzar durante una partida
  (fuera de ella atrapaba todos los clics de la pantalla) y tiene botón
  Cancelar (o clic derecho).
- Actualizaciones: no se reinicia la app mientras tengas la ventana
  abierta; espera a que esté en la bandeja.
- Desinstalar borra el arranque con Windows y los datos de la app.
- "Acerca de": enlaces para informar de un problema o sugerir algo y a
  riftcompass.com (código abierto, MIT), y el correo de contacto.
- Sin League abierto, la búsqueda del cliente ya no congela la app
  brevemente cada 15 segundos.
- Electron 44.4.2 (parches de seguridad de Chromium).

## 0.3.14 a 0.3.21

- Meta Tier List: una posición por pantalla (pastillas Top/Jungla/Mid/
  Bot/Support), cada tier en una fila que llena el ancho con los nombres
  de los campeones, la letra del tier a la izquierda a toda la altura de la
  fila, y la búsqueda te lleva a las otras posiciones donde está el campeón.
- Rendimiento y accesibilidad: iconos de las rejillas con carga diferida,
  texto oscuro sobre los botones rosa y rose más claro sobre los tintes
  (contraste AA), idioma del documento según el de la app, campos de
  celeridad etiquetados, flechas de 24 px, selector de servidor con nombre.
- Sesión: si riftcompass.com rechaza la sesión guardada se avisa una vez y
  se pide iniciar sesión de nuevo (ver 0.3.12).

## 0.3.13

- Builds de campeón: "Mis builds" dice "Cargando tus guardados…" mientras
  carga y, si la lista no llega (sin red, demasiadas peticiones, sesión
  cerrada), lo dice y ofrece reintentar, en vez de "Aún no has guardado
  ninguna build".
- Test de personalidad: si Data Dragon no responde, los resultados lo
  dicen y ofrecen reintentar en vez de salir vacíos.
- Cuando riftcompass.com contesta con un error del servidor (por ejemplo
  mientras se reinicia de madrugada), el mensaje dice que el problema es
  del servidor, no de tu conexión.
- Plurales: "1 partida", "1 partie", "1 Spiel" en Builds de campeón,
  Matchups, perfil, selección de campeón y tier lists, con miles según el
  idioma.
- Francés: Calculateur d'or, XP de jungle, Comparer y el Simulateur de
  Draft hablan de "vous" como el resto de la app; "Loups" y "Rapaces" en la
  tabla de XP; la nota al pie nombra al cangrejo como la tabla (es/fr/de).
- Matchups y Meta Tier List sugieren probar otro rango cuando no hay datos.

## 0.3.12

- Sesión: si riftcompass.com rechaza la sesión guardada (contraseña
  cambiada, cierre desde otro dispositivo, caducidad a los 90 días), la app
  lo dice al guardar ("Tu sesión se ha cerrado") y en Ajustes explica por
  qué al volver a iniciar sesión, en vez de enseñar una clave interna o
  aparecer sin sesión sin más. "Demasiados guardados seguidos" en las cinco
  herramientas que guardan.
- Bandeja: menú en el idioma de la app y, la primera vez que se cierra la
  ventana con la X, un aviso de que la app sigue en la bandeja. Los botones
  de la ventana tienen nombre en los cuatro idiomas.
- Los enlaces a riftcompass.com (cuenta, contraseña olvidada, registro,
  metodología, legales) abren la web en el idioma de la app, no en el de
  Windows. Ajustes → Acerca de enseña la versión y enlaza al aviso legal,
  privacidad y cookies.
- Instalador: el acuerdo de licencia sale en español, francés, alemán o
  inglés según el idioma de Windows, y cuenta qué escribe la app en el
  cliente y qué llega a riftcompass.com.
- Ventana estrecha (640 px): el Simulador de draft, el Champion Pool, el
  Test de personalidad y Jungle XP apilan sus columnas en vez de recortarse.
- Teclado: Escape o Alt+← vuelven atrás; al abrir una vista el foco va a su
  título; el anillo de foco cubre también las tarjetas de la Meta Tier List
  y los desplegables. Gris secundario igual al de la web y escala de tamaños
  de texto unificada.

## 0.3.11

- Resumen post-partida: si riftcompass.com no responde o hay demasiadas
  peticiones, lo dice (con la espera que toque) y ofrece reintentar, en vez
  de "Riot puede tardar un poco"; ese mensaje queda solo para cuando la
  partida de verdad no ha llegado todavía. Duración "32:14" y nota "7,5"
  como en el historial; el retrato lleva el nombre visible del campeón.

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
