// La mitad de "publicar una release" que electron-builder no hace bien sola.
// Vive aparte de build-win.mjs, que es solo el rodeo al EPERM al desempaquetar
// Electron, para poder probar esto contra la API real sin lanzar un build.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function builderConfig() {
  // El bloque `publish:` de electron-builder.yml es la unica fuente de la
  // verdad sobre donde se publica y como se llama el instalador; leerlo evita
  // que este script y la configuracion se separen.
  const yml = readFileSync("electron-builder.yml", "utf-8");
  const owner = yml.match(/^\s+owner:\s*(\S+)/m)?.[1];
  const repo = yml.match(/^\s+repo:\s*(\S+)/m)?.[1];
  const artifact = yml.match(/^\s+artifactName:\s*(\S+)/m)?.[1]?.replace("${ext}", "exe");
  if (!owner || !repo || !artifact) {
    throw new Error("electron-builder.yml no declara publish.owner, publish.repo o win.artifactName.");
  }
  return { owner, repo, artifact };
}

async function gh(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "riftcompass-build-win",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub respondio ${res.status} a ${init.method ?? "GET"} ${url}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

// `GET /releases` es eventualmente consistente: una release recien creada no
// sale en el listado hasta ~2 s despues (medido contra la API real; el POST ya
// ha devuelto su id y su tag). Esa ventana es justo lo que hace que los dos
// publicadores de electron-builder no vean nada y creen cada uno la suya, asi
// que aqui no se concluye "no existe" a la primera: se reintenta antes de
// decidir, o este script cae en la misma trampa cuando se relanza seguido.
async function findByTag(api, token, tag, intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    const found = (await gh(`${api}/releases?per_page=100`, token)).filter((r) => r.tag_name === tag);
    if (found.length > 0) return found;
    if (i < intentos - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return [];
}

// electron-builder arranca un publicador por artefacto y cada uno mira por su
// cuenta si la release del tag existe. Ninguno la encuentra, los dos la crean,
// y salen DOS borradores del mismo tag: a uno le llegan el instalador y
// `latest.yml`, al otro solo el `.blockmap`. Es invisible salvo que alguien
// mire la pagina de releases, y ya costo una vez: la v0.2.0 se publico sin
// `.blockmap`, asi que quien la tenga se baja el instalador entero en vez de
// un diferencial. Crear el borrador antes de arrancar electron-builder quita
// la carrera: los dos publicadores lo encuentran hecho y suben a el.
export async function ensureDraftRelease({ log = console.log } = {}) {
  const { owner, repo } = builderConfig();
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Falta GH_TOKEN (o GITHUB_TOKEN); electron-builder tampoco podria publicar.");

  const version = JSON.parse(readFileSync("package.json", "utf-8")).version;
  const tag = `v${version}`;
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const target = { owner, repo, token, tag };

  const existing = await findByTag(api, token, tag);
  if (existing.length > 1) {
    // Justo lo que esto evita. Si ya hay dos, cual conservar es una decision
    // de quien publica, no algo que adivinar aqui.
    throw new Error(`Hay ${existing.length} releases con el tag ${tag}. Deja una sola (mueve sus assets a la que conserves y borra el resto) y vuelve a lanzarlo.`);
  }
  if (existing.length === 1) {
    log(`  • reutilizando la release de ${tag} que ya existia (draft=${existing[0].draft})`);
    return { ...target, id: existing[0].id };
  }

  // El tag se cuelga del commit que se esta empaquetando, no de la rama, para
  // que apunte a lo que hay dentro del instalador aunque main avance mientras
  // se sube. Eso exige que el commit este ya en GitHub: si no lo esta, la API
  // responde 422 y ademas estariamos publicando un instalador hecho con
  // codigo que nadie mas tiene, asi que se dice y se para aqui.
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
  const pushed = await fetch(`${api}/commits/${sha}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "riftcompass-build-win" },
  });
  if (!pushed.ok) {
    throw new Error(`El commit ${sha.slice(0, 7)} no esta en GitHub: haz push antes de publicar, o la release apuntaria a codigo que nadie puede ver.`);
  }
  const created = await gh(`${api}/releases`, token, {
    method: "POST",
    body: JSON.stringify({ tag_name: tag, name: version, target_commitish: sha, draft: true }),
  });
  log(`  • borrador de ${tag} creado antes de publicar (${created.html_url})`);
  return { ...target, id: created.id };
}

// Segunda red, porque una subida puede fallar sin tumbar el build y los tres
// ficheros importan: sin `latest.yml` nadie se entera de que hay version nueva
// y sin `.blockmap` la actualizacion deja de ser diferencial. Lo que falte se
// sube desde `release/` en vez de limitarse a avisar.
export async function verifyReleaseAssets({ owner, repo, token, tag, id }, { log = console.log, dryRun = false } = {}) {
  const { artifact } = builderConfig();
  const wanted = [artifact, `${artifact}.blockmap`, "latest.yml"];
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const release = await gh(`${api}/releases/${id}`, token);
  const present = new Set(release.assets.map((a) => a.name));
  const missing = wanted.filter((name) => !present.has(name));

  for (const name of missing) {
    const local = path.join(path.resolve("release"), name);
    if (!existsSync(local)) {
      throw new Error(`Falta ${name} en la release ${tag} y tampoco esta en release/; revisala a mano antes de publicarla.`);
    }
    log(`  • ${name} no llego a la release; subiendolo`);
    if (dryRun) continue;
    await gh(`https://uploads.github.com/repos/${owner}/${repo}/releases/${id}/assets?name=${encodeURIComponent(name)}`, token, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: readFileSync(local),
    });
  }
  const estado = release.draft ? "Sigue en borrador: publicala cuando la hayas probado." : "La release ya es publica.";
  log(`  • release ${tag} completa (${wanted.join(", ")}). ${estado}`);
  return missing;
}
