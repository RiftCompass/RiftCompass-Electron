// Arranca la app con el motor de Overwolf (ow-electron) en desarrollo.
//
// Existe por una razon concreta: los paquetes de juego (el overlay que se
// dibuja dentro de League) NO cargan en local mientras la app no este firmada,
// salvo que se le pasen credenciales de desarrollador por variables de
// entorno. Sin ellas, ow-electron arranca igual pero el gestor de paquetes se
// para con "invalid verification" y el overlay no llega a inyectarse nunca:
// parece un fallo del codigo y no lo es.
//
// Overwolf exige que vayan como variables de entorno del proceso, no en
// package.json ni en un fichero de configuracion suyo. De ahi este lanzador.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const FICHERO = join(raiz, ".env.overwolf.local");

// Fuera de git a proposito (.gitignore) y con su patron en check-sensitive.mjs:
// una clave de API de Overwolf no puede llegar nunca al repositorio, que ademas
// es publico.
if (!existsSync(FICHERO)) {
  console.error(
    [
      "",
      "Falta .env.overwolf.local, y sin el los paquetes de juego no cargan.",
      "",
      "  1. Entra en https://console.overwolf.com con la cuenta de desarrollador",
      "     y saca una clave en Profile > API Keys.",
      "  2. Crea el fichero .env.overwolf.local en la raiz de este repo con:",
      "",
      "       OW_CLI_EMAIL=<el correo de esa cuenta>",
      "       OW_CLI_API_KEY=<la clave>",
      "",
      "  3. Vuelve a lanzar `npm run dev:overwolf`.",
      "",
      "Detalle en docs/overwolf-registration.md.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const credenciales = Object.fromEntries(
  readFileSync(FICHERO, "utf8")
    .split(/\r?\n/)
    .filter((linea) => linea.trim() && !linea.trim().startsWith("#"))
    .map((linea) => {
      const corte = linea.indexOf("=");
      return [linea.slice(0, corte).trim(), linea.slice(corte + 1).trim()];
    }),
);

// "Sin rellenar" cuenta como ausente: si el fichero se dejo con los huecos de
// plantilla, Overwolf responde con el mismo "invalid verification" cripitico que
// si no hubiera credenciales, y se pierde el tiempo buscando en el sitio
// equivocado. Mejor decirlo aqui.
const sinRellenar = (valor) => !valor || valor.startsWith("<") || valor.includes("PEGA");
const faltan = ["OW_CLI_EMAIL", "OW_CLI_API_KEY"].filter((clave) => sinRellenar(credenciales[clave]));
if (faltan.length > 0) {
  console.error(
    `.env.overwolf.local existe pero ${faltan.join(" y ")} sigue(n) sin rellenar.
` +
      "La clave se saca en https://console.overwolf.com > Profile > API Keys.",
  );
  process.exit(1);
}

const hijo = spawn("ow-electron", ["."], {
  cwd: raiz,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    ...credenciales,
    ELECTRON_RENDERER_URL: "http://localhost:1421",
  },
});
hijo.on("exit", (codigo) => process.exit(codigo ?? 0));
