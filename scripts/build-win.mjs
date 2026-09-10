// Ejecuta electron-builder en esta maquina, donde la ruta normal falla siempre.
//
// electron-builder extrae Electron en una carpeta `.tmp` y despues la renombra;
// aqui ese renombrado da EPERM cada vez (lo mas probable, el antivirus
// reteniendo el electron.exe recien extraido). Pasarle un Electron ya
// desempaquetado con `electronDist` se salta el extraer-y-renombrar entero:
// copia la carpeta en vez de moverla. El zip es el que @electron/get ya tiene
// cacheado.
//
// Vale para los dos usos, porque el fallo esta en el paso comun a ambos:
//   node scripts/build-win.mjs --dir --win        build sin empaquetar
//   node scripts/build-win.mjs --win              instalador NSIS
//   node scripts/build-win.mjs --win --publish always   instalador + release
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;
const zipName = `electron-v${electronVersion}-win32-x64.zip`;

function findZip(root) {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) {
      const found = findZip(full);
      if (found) return found;
    } else if (entry === zipName) {
      return full;
    }
  }
  return null;
}

const cacheRoot = path.join(process.env.LOCALAPPDATA ?? "", "electron", "Cache");
const zip = findZip(cacheRoot);
if (!zip) {
  console.error(`${zipName} no esta en ${cacheRoot}; lanza \`npx electron-builder --dir --win\` una vez para que @electron/get lo descargue.`);
  process.exit(1);
}

const dist = mkdtempSync(path.join(tmpdir(), "riftcompass-electron-dist-"));
execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dist}' -Force`], { stdio: "inherit" });

const release = path.resolve("release");
for (const stale of ["win-unpacked", "win-unpacked.tmp"]) rmSync(path.join(release, stale), { recursive: true, force: true });

const args = process.argv.slice(2);
if (args.length === 0) args.push("--win");

try {
  execFileSync("npx", ["electron-builder", ...args, `-c.electronDist=${dist}`], { stdio: "inherit", shell: true });
} finally {
  rmSync(dist, { recursive: true, force: true });
}
