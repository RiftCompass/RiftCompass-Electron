# Registro de desarrollador en Overwolf (ow-electron)

**Estado: enviado el 2026-08-30.** La cuenta de desarrollador de Overwolf
se creó con la cuenta personal de Google del propietario (no con
`riftcompass@gmail.com`) y Claude rellenó y envió el formulario de propuesta de app en
<https://dev.overwolf.com/app-idea-form> con su autorización explícita.
Confirmación recibida: "Proposal Sent — We got you!" — Overwolf dice que
contactarán en unos días (revisar spam si no llega nada en 48h). Mientras
no llegue la aprobación, la cuenta queda en estado "Developer status:
Pending" (visible en el menú de perfil de dev.overwolf.com).

**Hallazgo importante durante el envío**: la documentación de Overwolf
dice explícitamente *"Overwolf currently doesn't approve private apps"* —
"privada" en su terminología significa "de uso personal, no pensada para
uso general", no "no listada en su tienda". RiftCompass, al distribuirse
con marca propia fuera de su tienda pero abierta a cualquier jugador desde
riftcompass.com, cuenta como **app pública** en su definición (cualquiera
puede descargarla y usarla, tiene ventana real, no es un proceso oculto)
— así se planteó en el formulario, evitando el motivo de rechazo más
directo que señala su propia documentación.

**Contenido real enviado** (en inglés, obligatorio — "Only proposals
submitted in English will be reviewed"):
- Nombre de la app: RiftCompass
- Sitio web: https://riftcompass.com
- Framework: ow-electron
- Modelo de negocio: None (sin monetización)
- Categorías: Stats, Utilities, Guides & Trainers
- Juego soportado: League of Legends
- Descripción (1341/1400 caracteres): explica qué hace la app (perfiles,
  11 herramientas, overlay con oro/objetivos/CS/build desde datos reales
  de Riot, import de build con un clic), qué fuentes usa (LCU + Live
  Client Data, mismas que Porofessor/Blitz/iTero, sin lectura de memoria
  ni hooks), y por qué se pide ow-electron (el overlay actual en Tauri no
  puede pintarse sobre League en modo Pantalla completa exclusiva).

## Respuesta de Overwolf — 2026-08-30, exige aprobación de Riot también

Overwolf contestó (developers@overwolf.com, "Thank you for your
submission") con una condición que no estaba prevista: como RiftCompass
es sobre un juego de Riot, **exigen también la aprobación de Riot Games**
antes de dar acceso a los paquetes `@overwolf/ow-electron*`, aunque la
app no vaya a usar la API oficial de Riot para nada. Texto literal
relevante:

> "Since your project involves one of Riot's games, you'll need to
> obtain their approval, even if you don't plan to use their API. [...]
> Details about the application process are available on the Riot
> Developer Portal. [...] To move forward with approving and whitelisting
> your idea, we'll need a screenshot of Riot's approval, including the
> app description you submitted to them."

Es decir: hay que solicitar acceso también en el Riot Developer Portal
(pidiendo el tipo de API key adecuado al proyecto), esperar su
aprobación, y mandarle a Overwolf una captura de esa aprobación junto con
la descripción enviada a Riot. **Ese registro en el Riot Developer
Portal solo puede iniciarlo el propietario** (cuenta propia, igual que pasó
con Overwolf) — Claude puede ayudar a redactar/rellenar la descripción de la
app una vez exista la cuenta, igual que se hizo aquí.

## Qué queda pendiente

- **Propietario**: crear cuenta en el Riot Developer Portal y solicitar el tipo
  de API key adecuado para RiftCompass, siguiendo las reglas de
  cumplimiento de Riot enlazadas en su correo.
- Una vez Riot apruebe: mandar a Overwolf (developers@overwolf.com,
  respondiendo al hilo "Thank you for your submission") la captura de esa
  aprobación + la descripción enviada a Riot.
- Solo entonces Overwolf da acceso a `@overwolf/ow-electron`,
  `@overwolf/ow-electron-builder` y `@overwolf/electron-is-overwolf` —
  con eso se completa el Paso 4 de la migración a Electron (ver
  `RiftCompass-Electron/CLAUDE.md`).
- Si Riot u Overwolf piden más información o rechazan: revisar el motivo
  exacto contra la sección "Hallazgo importante" de arriba antes de
  reenviar.

## Progreso real (2026-09-02) — el código ya está escrito, falta el permiso de inyección

**Hallazgo que cambia el plan de arriba**: `@overwolf/ow-electron`,
`@overwolf/ow-electron-builder` y `@overwolf/ow-electron-packages-types`
resultaron estar **publicados públicamente en npm sin ninguna restricción de
instalación** (verificado con `npm view`, y ya instalados como
devDependencies aquí). Lo que Overwolf condiciona a la aprobación de Riot no
es poder instalar los paquetes — es que la inyección real en el proceso de
League llegue a funcionar (whitelisting del lado de su servidor). Esto
significa que el Paso 4 ya se pudo escribir entero, con los tipos reales, sin
esperar a nada:

- **`electron/overlayEngine.ts`** (nuevo): la integración real contra
  `IOverwolfOverlayApi` — `registerGames({ gamesIds: [kGameIds.LeagueofLegends] })`,
  `game-launched` → `event.inject()`, `game-injected` → crea la ventana
  overlay real vía `overlayApi.createWindow()` (mismo renderer/preload de
  siempre, solo que inyectada en el proceso del juego en vez de una ventana
  normal), `game-exit` → la oculta. Verificado línea a línea contra el propio
  repo oficial de ejemplo de Overwolf
  (`github.com/overwolf/ow-electron-packages-sample`), no adivinado.
- **`electron/windows.ts`**: `createOverlayWindow()` (el camino de Electron
  normal) queda intacto; `getOverlayWindow()`/`showOverlay()`/
  `setOverlayInteractive()`/`broadcast()` ahora soportan ambos caminos sin
  que main.ts/gameConnection.ts/ipc.ts hayan tenido que cambiar una sola
  llamada — justo el "único punto de cambio" que ya se preveía.
- **`electron/main.ts`**: `isOverwolfRuntime()` decide en el arranque cuál de
  los dos caminos usar. Bajo el binario `electron` normal (la única
  distribución real hoy) es exactamente el mismo comportamiento que antes de
  este cambio — verificado en real con `npm run dev`, arranca limpio.
- **`package.json`**: añadido el campo `"overwolf": { "packages": ["overlay"] }`
  y un script nuevo `npm run dev:overwolf`, que lanza la app con el binario
  real `ow-electron` en vez de `electron` (ya descargado, `npx ow-electron
  --version` funciona). Sin la aprobación de Riot, `registerGames`/la
  inyección real simplemente no harán nada útil todavía, pero esto permite
  confirmar que `app.overwolf` existe y que la app arranca bajo el runtime
  real sin esperar a nada más — **pendiente de probar en real** (no se
  lanzó hoy por no interrumpir al usuario, que tenía el ordenador en uso
  con otra cosa en ese momento).

## Qué queda pendiente de verdad

- Lo de siempre: el propietario pide acceso en el Riot Developer Portal, Overwolf
  whitelista la app tras verlo.
- Una vez llegue: probar `npm run dev:overwolf` con League realmente
  abierto (registro del juego, inyección, ventana overlay real apareciendo
  sobre pantalla completa exclusiva) — el código ya escrito debería
  funcionar tal cual, pero esto es la primera vez que se podrá verificar de
  verdad contra el juego real.
- Cuando eso funcione: cambiar `electron-builder` por
  `@overwolf/ow-electron-builder` en los scripts `dist`/`release`/`pack:dir`
  para que el instalador final también empaquete el binario `ow-electron`
  en vez del `electron` normal (hoy sigue en `electron-builder` a propósito,
  ya que el binario que se distribuye de verdad todavía es el normal).

## Ronda de preguntas de Overwolf (2026-09-03 → 2026-09-08)

Tras ver la aprobación de Riot, Overwolf preguntó: Appstore o privada,
modelo de negocio, Overwolf Ads, Tebex (03-09); luego pidió web activa y
conectividad app↔web (06-09, la web estaba pausada en Vercel); y el 08-09
pidió la captura completa del Riot Developer Portal, la web activa, aceptar
que cualquier monetización futura sea vía Overwolf Ads + Tebex en web y app,
y explicar la barra lateral derecha de la app (les salía vacía sin sesión).

Respondido el 2026-09-08 con la web ya en Netlify (ver
`RiftCompass-Web`, hosting temporal de un día antes de pasar al servidor propio):
captura completa del portal de Riot con la API key tapada, cláusula de
monetización aceptada tal cual (decisión del propietario; sin monetización
hoy, AdSense descartado), y la barra lateral explicada con una captura de
la app con sesión iniciada (usuario arriba, perfiles guardados en carpetas
en el medio, Ajustes abajo). Overwolf dijo que con eso procedería al
whitelisting; falta su confirmación.

## Whitelisting concedido — 2026-09-10

Correo de `developers@overwolf.com`, "Welcome to the Overwolf Developers
community!": *"your Overwolf account has been whitelisted, and you are now
one step closer to creating an amazing app"*. Con esto termina el trámite
que empezó el 2026-08-30 y se desbloquea la inyección real en League, que
era lo único que faltaba (los paquetes npm ya estaban instalados desde el
2026-09-02).

Lo que el propio correo pide antes de empezar:

- **Dev Mode obligatorio**: por ser una app ow-electron, hay que activar
  Dev Mode en el cliente de Overwolf para que los paquetes de juego
  carguen en desarrollo local. Si `dev:overwolf` no inyecta, esto es lo
  primero que hay que descartar, antes que el código.
- **Game Compliance**, con una sección **adicional específica para apps de
  Riot**: leerla y anotar aquí qué obliga y qué prohíbe antes de
  distribuir el overlay.
- Recursos: Getting Started Guide, Documentation Homepage, Live Game Data
  (GEP) Overview y su Developers Roadmap. Ofrecen soporte respondiendo a
  ese mismo correo, y tienen comunidad de desarrolladores.

Qué queda, por orden (la lista viva está en el `CLAUDE.md` de la carpeta
raíz del proyecto, sección "Overlay y Overwolf"):

1. Activar Dev Mode.
2. `npm run dev:overwolf` con League realmente abierto: `app.overwolf`
   presente, `registerGames` reconociendo el juego, `game-launched` →
   `inject()`, y la ventana overlay pintándose sobre pantalla completa
   exclusiva. Primera verificación real de `electron/overlayEngine.ts`.
3. `scripts/build-win.mjs`: `electron-builder` → `@overwolf/ow-electron-builder`
   en `dist`/`release`/`pack:dir`, comprobando después que el auto-update
   por GitHub Releases sigue funcionando.
4. Repasar interactividad, atajos y ocultado en `game-exit` con el motor
   real, y decidir si el `sandbox: false` de `overlayEngine.ts` es
   requisito suyo.
5. Decisión del propietario: Overwolf Appstore o seguir distribuyendo solo
   desde riftcompass.com y GitHub Releases.

## Primera prueba real del motor — 2026-09-10

Se lanzó `npm run dev:overwolf` por primera vez con el whitelisting ya
concedido. Dos resultados:

**Lo bueno: el motor está.** El arranque ya dice `[overlay] motor de Overwolf
presente`, o sea que `app.overwolf` existe y `overlayEngine.ts` deja de ser
código inerte por primera vez desde que se escribió. No hace falta instalar el
cliente de Overwolf para eso.

**Lo que falta: credenciales de desarrollador.** El gestor de paquetes se para
nada más arrancar:

```
[owepm] package manager stopped by renderer - invalid verification
```

Los paquetes de juego (el overlay) **no cargan en local mientras la app no esté
firmada**, salvo que se le pasen credenciales por variables de entorno. Overwolf
exige que vayan como variables de entorno del proceso, no en `package.json` ni
en un fichero de configuración suyo:

- `OW_CLI_EMAIL`: el correo de la cuenta de desarrollador.
- `OW_CLI_API_KEY`: se saca en <https://console.overwolf.com>, en
  Profile > API Keys.

Cómo queda montado en este repo: se ponen en `.env.overwolf.local` (raíz del
repo, ignorado por git) y `scripts/dev-overwolf.mjs` las carga y arranca
`ow-electron` con ellas. Si el fichero falta, el script lo dice y explica cómo
conseguirlas, en vez de dejar que parezca un fallo del código. `OW_CLI_API_KEY`
y `OW_DEV_KEY` están además en los patrones de `check-sensitive.mjs` de los dos
repos, así que una clave no puede llegar a GitHub ni por accidente (probado con
una clave falsa: la detecta y falla).

**Esto es lo que bloquea el paso 2 de la lista de abajo.** Hasta que la clave
exista, no se puede probar la inyección en una partida real.


## Primera inyeccion real en una partida — 2026-09-10

Con la Developer Key puesta, la cadena completa funciona por primera vez.
Registro de una partida personalizada real:

```
[overwolf] credenciales de desarrollador: OW_DEV_KEY
[overlay] motor de Overwolf presente: se inyectara dentro del juego
[overlay] paquete de Overwolf listo: overlay
[overlay] juego detectado: League of Legends (tipo Game)
[overlay] inyectado en League of Legends
```

Sin un solo error. El paso 2 de la lista de arriba queda cerrado: `app.overwolf`
existe, `registerGames` reconoce el juego y `game-launched` -> `inject()`
funciona contra el proceso real.

**Pero el overlay no se veia.** Estaba ahi: ampliando la captura se adivinaba el
nombre del invocador por debajo del marcador de la partida. O sea que la ventana
se creaba y pintaba contenido de verdad, pero **por detras de la interfaz de
League**.

Causa encontrada en el codigo, no adivinada: `overlayTopmost.ts` se salta a
proposito su re-afirmacion periodica de `setAlwaysOnTop()` bajo este motor,
razonando que la profundidad la gobierna `overlayOptions.zOrder` de Overwolf y no
el concepto de Electron. El razonamiento es correcto, pero **`zOrder` no se
rellenaba en ningun sitio**, y su valor por defecto segun los tipos de Overwolf
es `"default"`. Arreglado poniendo `zOrder: "topMost"` en las opciones de la
ventana (`overlayEngine.ts`).

**Ese arreglo esta SIN VERIFICAR en partida**: la sesion de prueba se cerro antes
de poder repetirla. Es lo primero que hay que comprobar en la siguiente.

Notas practicas para la proxima prueba:

- La Developer Key **caduca el 24/09/2026**. Se renueva en
  <https://dev.overwolf.com/profile> con el boton Extend, disponible desde 2 dias
  antes. Si el overlay deja de inyectarse sin haber tocado nada, mirar esto
  primero.
- `console.overwolf.com` **no sirve** para esta cuenta: devuelve "Something went
  wrong" al entrar. La cuenta aprobada vive en `dev.overwolf.com`.
- Con la app corriendo a pantalla completa en desarrollo, roba el foco y estorba
  para manejar el cliente de League. Conviene minimizarla antes de montar la
  partida.

