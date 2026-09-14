// Silent background auto-update: installs already on a user's machine pick
// up new releases on their own, no manual redownload from the web. Reads
// where to check from the `publish` block in electron-builder.yml (GitHub
// Releases) via app-update.yml, which electron-builder only generates for
// packaged builds — never runs in dev.

import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { isPhaseIdle } from "./gameConnection";
import { markMainWindowQuitting } from "./windows";

const IDLE_RECHECK_MS = 5 * 60 * 1000;
let installPending = false;

function tryInstallWhenIdle(): void {
  if (installPending) return;
  installPending = true;
  const attempt = () => {
    if (!isPhaseIdle()) {
      setTimeout(attempt, IDLE_RECHECK_MS);
      return;
    }
    console.log("[updater] sin partida en curso: instalo la actualizacion y vuelvo a arrancar");
    markMainWindowQuitting();
    // isSilent=true, isForceRunAfter=true: sin asistente y arranca de nuevo
    // solo (con --background no arranca en segundo plano, asi que la ventana
    // puede aparecer un instante; el coste de no esperar al reinicio del PC).
    autoUpdater.quitAndInstall(true, true);
  };
  attempt();
}

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export function startAutoUpdater(): void {
  // app-update.yml only exists in installer builds (`npm run dist`/
  // `release`); the unpacked `--dir` build the desktop shortcut runs is
  // packaged too (app.isPackaged is true) but has nothing to update from,
  // so checking there would just log an ENOENT every interval.
  if (!app.isPackaged || !existsSync(path.join(process.resourcesPath, "app-update.yml"))) return;

  // Downloads happen automatically once a new version is found, and get
  // applied on the next app quit — no restart prompt to click through.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Solo releases publicadas y hacia adelante: un borrador o una prerelease
  // (que es como se prueba un release antes de publicarlo) no llega nunca a
  // los usuarios, y una release vieja no puede sustituir a una nueva. Son
  // los valores por defecto, pero se fijan aqui para que no dependan de la
  // version de electron-updater ni del sufijo del numero de version.
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("error", (err) => console.error("auto-updater error:", err));
  autoUpdater.on("update-available", (info) => console.log("update available:", info.version));
  // Instalar sola cuando no molesta (APP-2, ronda 20): la app vive en la
  // bandeja y solo se cierra desde "Quit", asi que "al salir" era "cuando
  // reinicies el PC" y cada release tardaba semanas en llegar. Si no hay
  // cliente de League o esta en el menu, se reinicia en silencio (vuelve a
  // la bandeja); si hay partida o draft, se espera al proximo reposo.
  autoUpdater.on("update-downloaded", (info) => {
    console.log("update downloaded:", info.version);
    tryInstallWhenIdle();
  });

  autoUpdater.checkForUpdates().catch((err) => console.error("auto-updater check failed:", err));
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => console.error("auto-updater check failed:", err));
  }, CHECK_INTERVAL_MS);
}
