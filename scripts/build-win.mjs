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
//
// Al publicar, `github-release.mjs` crea el borrador antes de arrancar y
// comprueba al terminar que la release se quedo completa; el porque esta ahi.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { ensureDraftRelease, verifyReleaseAssets } from "./github-release.mjs";

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

// Si la app corre desde release/win-unpacked (una instancia de prueba
// olvidada), el borrado de abajo falla con un EPERM que no dice nada. Se
// comprueba antes y se dice que cerrar (APP-12, ronda 20).
const release = path.resolve("release");
if (process.platform === "win32") {
  // `Get-Process` sin coincidencias sale con codigo 1 aunque se silencie el
  // error (paso en el runner de GitHub el 2026-09-14): se envuelve para que
  // "no hay ningun proceso" sea la respuesta normal, no un fallo.
  let listed = "";
  try {
    listed = execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", "try { Get-Process RiftCompass -ErrorAction Stop | ForEach-Object { $_.Path } } catch { }; exit 0"],
      { encoding: "utf-8", windowsHide: true },
    );
  } catch {
    listed = "";
  }
  const running = listed
    .split(/\r?\n/)
    .filter((p) => p && p.toLowerCase().startsWith(release.toLowerCase()));
  if (running.length > 0) {
    console.error(`Hay una RiftCompass.exe corriendo desde ${release} (${running[0]}). Cierrala (bandeja -> Quit) y vuelve a lanzar el build.`);
    process.exit(1);
  }
}

// En el PC de desarrollo el antivirus retiene el electron.exe recien
// extraido y el renombrado de electron-builder falla (ver cabecera); en un
// runner de CI no pasa y el zip no esta cacheado: ahi se deja a
// electron-builder extraerlo el solo.
const cacheRoot = path.join(process.env.LOCALAPPDATA ?? "", "electron", "Cache");
const zip = findZip(cacheRoot);
let dist = null;
if (zip) {
  dist = mkdtempSync(path.join(tmpdir(), "riftcompass-electron-dist-"));
  execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dist}' -Force`], { stdio: "inherit" });
} else if (!process.env.CI) {
  console.error(`${zipName} no esta en ${cacheRoot}; lanza \`npx electron-builder --dir --win\` una vez para que @electron/get lo descargue.`);
  process.exit(1);
}

for (const stale of ["win-unpacked", "win-unpacked.tmp"]) rmSync(path.join(release, stale), { recursive: true, force: true });

const args = process.argv.slice(2);
if (args.length === 0) args.push("--win");

const publishing = args.some((arg) => arg === "--publish" || arg.startsWith("--publish="));
const draft = publishing ? await ensureDraftRelease() : null;

// Firma de codigo con el certificado de Certum (SimplySign). La clave vive en
// la nube de Certum: SimplySign Desktop la expone en este PC como una tarjeta
// virtual mientras hay sesion (la abre el propietario con la app movil), y el
// certificado aparece en el almacen del usuario. Por eso la firma solo se
// activa cuando CERTUM_CERT_SHA1 (la huella SHA-1 del certificado, sin
// espacios) esta en el entorno: en CI no esta y el instalador sale sin firmar,
// como hasta ahora; en el PC, con SimplySign conectado, electron-builder firma
// el exe, el desinstalador y el instalador con signtool y sella la hora en
// Certum. La huella se saca de `Get-ChildItem Cert:\CurrentUser\My` con la
// sesion abierta. No esta en electron-builder.yml para que el fichero no
// dependa de la maquina.
const signing = [];
if (process.env.CERTUM_CERT_SHA1) {
  signing.push(
    `-c.win.signtoolOptions.certificateSha1=${process.env.CERTUM_CERT_SHA1.replace(/\s+/g, "")}`,
    "-c.win.signtoolOptions.rfc3161TimeStampServer=http://time.certum.pl",
  );
  console.log("  • firma con el certificado de Certum (SimplySign) activada");
}

try {
  execFileSync("npx", ["electron-builder", ...args, ...signing, ...(dist ? [`-c.electronDist=${dist}`] : [])], { stdio: "inherit", shell: true });
} finally {
  if (dist) rmSync(dist, { recursive: true, force: true });
}

if (draft) await verifyReleaseAssets(draft);
