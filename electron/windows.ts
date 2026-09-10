// Window creation and lifecycle: the frameless main window and the
// transparent in-game overlay.

import { BrowserWindow, screen } from "electron";
import * as path from "node:path";
import type { OverlayBrowserWindow } from "@overwolf/ow-electron-packages-types";

let mainWindow: BrowserWindow | null = null;
// Two mutually-exclusive backing stores for "the overlay window", one per
// runtime: `overlayWindow` when running under plain Electron (today's only
// path — a normal top-level BrowserWindow, invisible during real exclusive
// fullscreen), `owOverlayWindow` when running under the `ow-electron` binary
// with Riot/Overwolf's access granted (see overlayEngine.ts) — a window
// actually injected into League's own process, visible in exclusive
// fullscreen too. Exactly one is ever non-null at a time; every function
// below picks whichever is set so every existing caller (main.ts,
// gameConnection.ts, ipc.ts, overlayTopmost.ts) keeps working unmodified
// regardless of which runtime created the window.
let overlayWindow: BrowserWindow | null = null;
let owOverlayWindow: OverlayBrowserWindow | null = null;

// Ventana de champ select (draft y build). Aparte del overlay a proposito:
// ver createChampSelectWindow.
let champSelectWindow: BrowserWindow | null = null;

// Re-exported so ipc.ts keeps one import for everything window-related;
// the definition lives in its own module for the preload bundle's sake.
import { WINDOW_CHANNELS } from "./window-channels";
export { WINDOW_CHANNELS };

// Sibling of tsconfig.electron.json's outDir — see package.json's "main".
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL;
// __dirname here is dist-electron/electron (tsconfig.electron.json's
// rootDir is the project root, to let this share src/bridge/commands.ts's
// CMD/EVT allowlist with the renderer) — dist/ sits two levels up.
const DIST_INDEX = path.join(__dirname, "..", "..", "dist", "index.html");
// Exported: overlayEngine.ts's ow-electron-injected window needs the exact
// same preload bridge as every other window here.
export const PRELOAD = path.join(__dirname, "preload.js");
// Same icon file electron-builder.yml points at for the packaged
// installer — set here too so the dev-run window/taskbar icon isn't
// Electron's own default.
export const APP_ICON = path.join(__dirname, "..", "..", "build", "icons", "icon.ico");

function isOwnRendererUrl(url: string): boolean {
  if (RENDERER_URL) return url.startsWith(RENDERER_URL);
  return url.startsWith("file:");
}

// Both windows carry the privileged preload bridge, so they must only ever
// display this app's own renderer: any navigation elsewhere (a stray link,
// a dropped file, a future remote-content bug) and any window.open is
// refused. External links go through ipc.ts's shell_open_external, which
// hands an https://riftcompass.com URL to the OS browser instead.
function lockToOwnRenderer(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!isOwnRendererUrl(url)) event.preventDefault();
  });
}

// Exported: overlayEngine.ts's ow-electron-injected window loads the exact
// same renderer bundle, just via a different window-creation API.
export function loadRenderer(win: BrowserWindow, query?: string): void {
  lockToOwnRenderer(win);
  if (RENDERER_URL) {
    win.loadURL(query ? `${RENDERER_URL}/?${query}` : RENDERER_URL);
  } else {
    win.loadFile(DIST_INDEX, query ? { search: query } : undefined);
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// Unified accessor regardless of which runtime owns the window — both
// Overwolf's own sample app and this app's existing callers (main.ts's
// Ctrl+Alt+R escape hatch, overlayTopmost.ts) operate on the plain
// BrowserWindow either way (OverlayBrowserWindow.window is a real
// BrowserWindow, per @overwolf/ow-electron-packages-types).
export function getOverlayWindow(): BrowserWindow | null {
  return owOverlayWindow?.window ?? overlayWindow;
}

// True only when the ow-electron path (overlayEngine.ts) actually created
// the window — overlayTopmost.ts uses this to skip its periodic
// setAlwaysOnTop() re-assert there, since z-order for an injected overlay
// is Overwolf's own overlayOptions.zOrder, not Electron's window-manager
// concept of "always on top".
export function isOwOverlayActive(): boolean {
  return owOverlayWindow !== null;
}

// Called by overlayEngine.ts once its own `createWindow()` call resolves —
// hands the result to the same module-level slot every other function here
// already reads from, so nothing else needs to know which path created it.
export function setOwOverlayWindow(win: OverlayBrowserWindow | null): void {
  owOverlayWindow = win;
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    title: "RiftCompass",
    width: 1440,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    show: false,
    icon: APP_ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      // The renderer process runs sandboxed (Chromium's OS-level sandbox,
      // no Node in the process at all). Only possible because preload.ts
      // is bundled into one self-contained file (scripts/bundle-preload.mjs)
      // — a sandboxed preload can't `require` a sibling module, which is
      // what kept this at `false` before. contextIsolation above remains
      // the boundary between page content and the preload's privileges.
      sandbox: true,
    },
  });
  mainWindow.maximize();
  loadRenderer(mainWindow);

  // The app lives primarily in the tray — closing the window only hides
  // it. Only the tray's "Quit" (main.ts) actually ends the process.
  mainWindow.on("close", (e) => {
    if ((mainWindow as unknown as { __quitting?: boolean }).__quitting) return;
    e.preventDefault();
    mainWindow?.hide();
  });

  // WindowControls.tsx's maximize/restore icon needs to reflect real OS
  // state (e.g. after a double-click on the title bar, or Win+Up), not
  // just its own button clicks.
  const notifyResized = () => mainWindow?.webContents.send(WINDOW_CHANNELS.resized);
  mainWindow.on("resize", notifyResized);
  mainWindow.on("maximize", notifyResized);
  mainWindow.on("unmaximize", notifyResized);

  return mainWindow;
}

// The single path every "show the window" trigger goes through (tray
// "Open", tray icon click, a second launch via the single-instance lock,
// and gameConnection.ts opening it when League connects).
export function showMainWindow(): void {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

// Marks the window as genuinely quitting so its own "close" handler
// (above) lets the close through instead of hiding it — set right before
// app.quit()/BrowserWindow.destroy() in main.ts.
export function markMainWindowQuitting(): void {
  if (mainWindow) (mainWindow as unknown as { __quitting?: boolean }).__quitting = true;
}

// The overlay HUD: a transparent, always-on-top, click-through window
// covering the full primary display, hidden until the gameflow phase
// gives it something to show. Several independent panels (lane gold
// table, objective timers, the recommended-skill highlight, the enemy
// spell tracker) are each absolutely positioned within this one window.
// Click-through by default via setIgnoreMouseEvents — the renderer
// explicitly asks to become interactive only while the cursor is over a
// real control (see ipc.ts's overlay_set_interactive).
//
// Only the fallback path: under the real `ow-electron` binary with
// Riot/Overwolf's access granted, overlayEngine.ts creates the actual
// in-game window instead (via the overlay package's own createWindow(),
// injected into League's process so it survives real exclusive
// fullscreen — a normal top-level window like this one never does,
// see the root CLAUDE.md's "Por qué Electron" for why). main.ts only
// calls this one when overlayEngine.isOverwolfRuntime() is false.
// Ventana propia para champ select: el acompañante de draft y build.
//
// Es una ventana normal, NO el overlay. Dos razones, y las dos son de peso:
//
//   1. Champ select ocurre en el CLIENTE de League, no dentro de la partida.
//      El overlay inyectado de Overwolf no existe todavía en ese momento, así
//      que bajo ese motor la app se quedaba sin ninguna ventana donde pintar
//      el draft: `createOverlayWindow()` no llega a llamarse y el inyectado
//      solo nace al entrar en juego.
//   2. Aquí hace falta poder pulsar de verdad (elegir campeón, elegir qué
//      build importar), y el overlay es click-through por diseño.
//
// Se coloca pegada al borde derecho porque el cliente de League deja ahí el
// hueco más limpio en champ select, y el jugador necesita ver su propia
// selección mientras decide.
export function createChampSelectWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const ancho = 460;
  const alto = Math.min(760, height - 80);
  champSelectWindow = new BrowserWindow({
    title: "RiftCompass · Draft",
    width: ancho,
    height: alto,
    x: Math.max(0, width - ancho - 24),
    y: Math.max(0, Math.round((height - alto) / 2)),
    resizable: true,
    minWidth: 380,
    frame: false,
    transparent: false,
    backgroundColor: "#0d0a12",
    alwaysOnTop: true,
    skipTaskbar: true,
    // Nunca roba el foco: aparece a mitad de un draft con el reloj corriendo,
    // y robarle el teclado al jugador mientras elige campeón seria un fallo
    // peor que no aparecer.
    focusable: false,
    show: false,
    icon: APP_ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // see createMainWindow's identical option
    },
  });
  loadRenderer(champSelectWindow, "view=champselect");
  champSelectWindow.on("closed", () => {
    champSelectWindow = null;
  });
  return champSelectWindow;
}

export function getChampSelectWindow(): BrowserWindow | null {
  return champSelectWindow;
}

// La ventana se crea perezosamente, la primera vez que hace falta: la mayoría
// de los arranques de la app no ven un champ select, y cargar el renderer
// entero por si acaso son 30 MB de nada.
// `alCargar` se llama cuando la ventana termina de cargar su renderer, y solo
// la primera vez (cuando de verdad hubo que crearla). Hace falta porque esta
// ventana nace a mitad de partida: los eventos de fase y de sesión de champ
// select ya se emitieron antes de que existiera, así que nadie los recibió y la
// vista se quedaba diciendo "solo disponible durante la selección de campeón"
// estando dentro de ella. Quien llama vuelve a emitir el estado actual.
export function showChampSelect(show: boolean, alCargar?: () => void): void {
  if (!show) {
    champSelectWindow?.hide();
    return;
  }
  if (champSelectWindow) {
    champSelectWindow.showInactive();
    champSelectWindow.setAlwaysOnTop(true);
    alCargar?.();
    return;
  }
  const win = createChampSelectWindow();
  win.webContents.once("did-finish-load", () => {
    // showInactive y no show: ver `focusable: false` arriba.
    win.showInactive();
    win.setAlwaysOnTop(true);
    alCargar?.();
  });
}

export function createOverlayWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().size;
  overlayWindow = new BrowserWindow({
    title: "RiftCompass Overlay",
    width,
    height,
    x: 0,
    y: 0,
    resizable: false,
    movable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    icon: APP_ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // see createMainWindow's identical option
    },
  });
  loadRenderer(overlayWindow, "view=overlay");
  // `forward: true` keeps CSS :hover / onMouseEnter working while
  // click-through — same behavior the OverlayView.tsx comments already
  // document as relied upon (a panel's onMouseEnter turns off click-through
  // just before a real click needs to land).
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  return overlayWindow;
}

// "Click-through" isn't the same concept in both runtimes: plain Electron
// has no OS-level notion of it (setIgnoreMouseEvents is this app's own
// approximation), while the overlay package treats it as a first-class
// window option (`overlayOptions.passthrough`, mutated live — see
// Overwolf's own sample doing the exact same `.overlayOptions.passthrough =`
// assignment in its hotkey handlers). "passThroughAndNotify" (not plain
// "passThrough") to keep the same forward-hover behavior
// setIgnoreMouseEvents's `{ forward: true }` already relied on.
export function setOverlayInteractive(interactive: boolean): void {
  if (owOverlayWindow) {
    owOverlayWindow.overlayOptions.passthrough = interactive ? "noPassThrough" : "passThroughAndNotify";
    return;
  }
  if (!overlayWindow) return;
  if (interactive) {
    overlayWindow.setIgnoreMouseEvents(false);
  } else {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }
}

// showInactive(), not show(): the overlay must never steal focus/keyboard
// input from the game, and Electron has no creation-time flag for that, so
// every show has to opt out explicitly. Same call either way — see
// getOverlayWindow()'s comment on why OverlayBrowserWindow.window already
// behaves like a normal BrowserWindow for this.
export function showOverlay(show: boolean): void {
  const win = getOverlayWindow();
  if (!win) return;
  if (show) win.showInactive();
  else win.hide();
}

// Las tres ventanas cargan el mismo bundle del renderer y se suscriben a los
// mismos eventos del puente (App.tsx elige que vista pintar segun el `?view=`
// de la URL), asi que los eventos de gameConnection.ts van a TODAS, no a un
// webContents.send concreto.
//
// Olvidar una aqui no da error, solo silencio: la ventana de champ select se
// anadio sin meterla en esta lista y se quedaba diciendo "solo disponible
// durante la seleccion de campeon" estando dentro de ella, sin recibir jamas
// la sesion. Al anadir una ventana nueva, anadirla tambien aqui.
export function broadcast(channel: string, payload?: unknown): void {
  for (const win of [mainWindow, getOverlayWindow(), champSelectWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}
