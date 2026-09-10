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
//
// Valen dos formas, y basta una:
//   - OW_DEV_KEY: la "Developer Key" de dev.overwolf.com/profile. Es la de
//     este proyecto, porque la cuenta ya esta aprobada ahi.
//   - OW_CLI_EMAIL + OW_CLI_API_KEY: la alternativa, desde
//     console.overwolf.com. Requiere estar dado de alta en esa consola, que es
//     una distinta: con la cuenta de aqui devuelve "Something went wrong".
// Si estan las dos, Overwolf da prioridad a la pareja OW_CLI_*.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const FICHERO = join(raiz, ".env.overwolf.local");

const COMO_CONSEGUIRLA = [
  "  Opcion 1 (la de este proyecto): entra en https://dev.overwolf.com/profile",
  "  con la cuenta de desarrollador aprobada, busca la seccion Developer Key y",
  "  pulsa Generate key. Luego pon en .env.overwolf.local:",
  "",
  "      OW_DEV_KEY=<la clave>",
  "",
  "  Opcion 2: https://console.overwolf.com > Profile > API Keys, y entonces:",
  "",
  "      OW_CLI_EMAIL=<el correo de esa cuenta>",
  "      OW_CLI_API_KEY=<la clave>",
  "",
  "  Detalle en docs/overwolf-registration.md.",
].join("\n");

// Fuera de git a proposito (.gitignore) y con su patron en check-sensitive.mjs:
// una clave de Overwolf no puede llegar nunca al repositorio, que es publico.
if (!existsSync(FICHERO)) {
  console.error(`\nFalta .env.overwolf.local, y sin el los paquetes de juego no cargan.\n\n${COMO_CONSEGUIRLA}\n`);
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
// plantilla, Overwolf responde con el mismo "invalid verification" cripitico
// que si no hubiera nada, y se pierde el tiempo buscando en el sitio
// equivocado. Mejor decirlo aqui.
const puesta = (clave) => {
  const valor = credenciales[clave];
  return Boolean(valor) && !valor.startsWith("<") && !valor.includes("PEGA");
};

const hayDevKey = puesta("OW_DEV_KEY");
const hayPareja = puesta("OW_CLI_EMAIL") && puesta("OW_CLI_API_KEY");
if (!hayDevKey && !hayPareja) {
  console.error(
    `\n.env.overwolf.local existe pero no tiene ninguna credencial rellenada.\n\n${COMO_CONSEGUIRLA}\n`,
  );
  process.exit(1);
}

console.log(`[overwolf] credenciales de desarrollador: ${hayDevKey ? "OW_DEV_KEY" : "OW_CLI_EMAIL + OW_CLI_API_KEY"}`);

// Solo se pasan las que estan de verdad: mandar un OW_CLI_EMAIL vacio junto a
// una OW_DEV_KEY buena haria que Overwolf usara la pareja (tiene prioridad) y
// fallara la verificacion teniendo una credencial valida delante.
// El puerto es configurable porque en este proyecto es normal tener varias
// sesiones a la vez, y matarle el servidor de desarrollo a otra para quedarse
// con el 1421 es peor que usar otro.
const PUERTO = process.env.VITE_PORT ?? "1421";
const entorno = { ...process.env, ELECTRON_RENDERER_URL: `http://localhost:${PUERTO}` };
for (const clave of ["OW_DEV_KEY", "OW_CLI_EMAIL", "OW_CLI_API_KEY"]) {
  if (puesta(clave)) entorno[clave] = credenciales[clave];
}

// Esperar al servidor de Vite aqui y no con `wait-on tcp:` en el script de npm:
// el puerto es configurable y la expansion de shell no funciona en cmd, asi que
// la espera tiene que resolverse en JavaScript como el resto.
async function esperarAVite() {
  const limite = Date.now() + 60_000;
  while (Date.now() < limite) {
    try {
      await fetch(`http://localhost:${PUERTO}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.error(`El servidor de Vite no respondio en el puerto ${PUERTO} tras 60 s.`);
  process.exit(1);
}
await esperarAVite();

const hijo = spawn("ow-electron", ["."], { cwd: raiz, stdio: "inherit", shell: true, env: entorno });
hijo.on("exit", (codigo) => process.exit(codigo ?? 0));
