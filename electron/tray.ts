// The app lives primarily in the tray. Only "Quit" actually ends the
// process — closing the main window just hides it (windows.ts's close
// handler).

import { app, Menu, nativeImage, Tray } from "electron";
import { APP_ICON, markMainWindowQuitting, showMainWindow } from "./windows";

let tray: Tray | null = null;

export function createTray(): void {
  // The .ico carries every size Windows may ask for (16px at 100 % DPI,
  // 24/32px on scaled displays); a single 32px PNG came out blurry and, worse,
  // wasn't shipped in the package at all (electron-builder.yml `files`).
  const icon = nativeImage.createFromPath(APP_ICON);
  tray = new Tray(icon);
  tray.setToolTip("RiftCompass");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open RiftCompass", click: () => showMainWindow() },
      { type: "separator" },
      {
        label: "Quit RiftCompass",
        click: () => {
          markMainWindowQuitting();
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => showMainWindow());
}
