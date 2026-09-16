// The app lives primarily in the tray. Only "Quit" actually ends the
// process — closing the main window just hides it (windows.ts's close
// handler).

import { app, Menu, nativeImage, Tray } from "electron";
import { isLocale, markTrayHintShown, settingsGet, type SupportedLocale } from "./settings";
import { APP_ICON, markMainWindowQuitting, showMainWindow } from "./windows";

let tray: Tray | null = null;

// The tray menu and the first-close balloon are the two pieces of the app
// outside the renderer's catalogs, so they carry their own four copies
// (round 27); rebuilt whenever the language changes in Settings.
const TRAY_TEXT: Record<SupportedLocale, { open: string; quit: string; hint: string }> = {
  en: {
    open: "Open RiftCompass",
    quit: "Quit RiftCompass",
    hint: "RiftCompass keeps running in the tray and opens by itself when League starts. Quit from the tray icon.",
  },
  es: {
    open: "Abrir RiftCompass",
    quit: "Salir de RiftCompass",
    hint: "RiftCompass sigue en la bandeja y se abre solo cuando arranca League. Para salir del todo, usa el icono de la bandeja.",
  },
  fr: {
    open: "Ouvrir RiftCompass",
    quit: "Quitter RiftCompass",
    hint: "RiftCompass reste dans la zone de notification et s'ouvre tout seul au lancement de League. Pour quitter, utilisez l'icône de la zone de notification.",
  },
  de: {
    open: "RiftCompass öffnen",
    quit: "RiftCompass beenden",
    hint: "RiftCompass läuft in der Taskleiste weiter und öffnet sich von selbst, wenn League startet. Beenden über das Taskleistensymbol.",
  },
};

function trayText(): (typeof TRAY_TEXT)[SupportedLocale] {
  const locale = settingsGet().locale;
  return TRAY_TEXT[isLocale(locale) ? locale : "en"];
}

export function rebuildTrayMenu(): void {
  if (!tray) return;
  const text = trayText();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: text.open, click: () => showMainWindow() },
      { type: "separator" },
      {
        label: text.quit,
        click: () => {
          markMainWindowQuitting();
          app.quit();
        },
      },
    ]),
  );
}

// First time the window is closed with the X (round 27): a one-off balloon
// so nobody thinks the app crashed or quit; the marker lives in
// settings.json like autoLaunchConfigured.
export function showTrayHintOnce(): void {
  if (!tray || !markTrayHintShown()) return;
  tray.displayBalloon({ title: "RiftCompass", content: trayText().hint, iconType: "info" });
}

export function createTray(): void {
  // The .ico carries every size Windows may ask for (16px at 100 % DPI,
  // 24/32px on scaled displays); a single 32px PNG came out blurry and, worse,
  // wasn't shipped in the package at all (electron-builder.yml `files`).
  const icon = nativeImage.createFromPath(APP_ICON);
  tray = new Tray(icon);
  tray.setToolTip("RiftCompass");
  rebuildTrayMenu();
  tray.on("double-click", () => showMainWindow());
}
