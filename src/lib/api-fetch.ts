// GET a /api/v1/* desde el renderer que distingue "espera N segundos" de "no
// hay conexion" (PAR-4, ronda 20). Antes cualquier fallo (un 429 de Cloudflare
// o del servidor incluido) acababa en el mismo "error de red" y la gente
// reintentaba a lo loco. Un 429 llega como ApiRateLimited con los segundos que
// diga el servidor (`retryAfterSeconds` en el cuerpo o la cabecera
// Retry-After); cualquier otro fallo, como ApiFailed.

export class ApiRateLimited extends Error {
  constructor(public readonly retryAfterSeconds: number | null) {
    super("rate limited");
    this.name = "ApiRateLimited";
  }
}

// riftcompass.com rechazó el token guardado (ronda 27): la sesión ya no
// existe y no hay reintento que valga, hay que volver a entrar.
export class ApiSessionExpired extends Error {
  constructor() {
    super("session expired");
    this.name = "ApiSessionExpired";
  }
}

export class ApiFailed extends Error {
  constructor(public readonly status: number | null) {
    super(status === null ? "network" : `HTTP ${status}`);
    this.name = "ApiFailed";
  }
}

export async function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiFailed(null);
  }
  if (res.status === 429) {
    let seconds: number | null = Number(res.headers.get("retry-after")) || null;
    try {
      const body = (await res.json()) as { retryAfterSeconds?: unknown };
      if (typeof body.retryAfterSeconds === "number") seconds = body.retryAfterSeconds;
    } catch {
      // sin cuerpo: nos quedamos con la cabecera, o con nada
    }
    throw new ApiRateLimited(seconds);
  }
  if (!res.ok) throw new ApiFailed(res.status);
  return (await res.json()) as T;
}

// Un getSaved* del puente que no pudo pedir la lista (ronda 22), convertido
// al mismo error que lanza apiGet para que LoadError distinga el 429.
export function savedListError(result: { error: string; retryAfterSeconds: number | null }): Error {
  if (result.error === "sessionExpired") return new ApiSessionExpired();
  if (result.error === "rateLimited") return new ApiRateLimited(result.retryAfterSeconds);
  // account.ts reports an HTTP failure as `httpNNN`: keep the status so a
  // 5xx reads as "riftcompass.com is having trouble", not "check your
  // connection" (round 29).
  const m = /^http(\d+)$/.exec(result.error);
  return new ApiFailed(m ? Number(m[1]) : null);
}

// Texto de un guardado que falló (ronda 27). `group` es el bloque de claves
// de esa herramienta ("TierList.saveTierListErrors"); un código que la
// API pueda devolver mañana y el catálogo no conozca cae en `unknown` en
// vez de pintarse como clave cruda, y la sesión caducada usa el texto
// común. Se apoya en que t() devuelve la propia clave cuando no existe.
export function saveErrorMessage(
  t: (key: string, vars?: Record<string, string | number>) => string,
  group: string,
  error: string,
): string {
  if (error === "sessionExpired") return t("Common.sessionExpired");
  const key = `${group}.${error}`;
  const text = t(key);
  return text === key ? t(`${group}.unknown`) : text;
}
