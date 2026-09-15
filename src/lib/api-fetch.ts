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
  return result.error === "rateLimited" ? new ApiRateLimited(result.retryAfterSeconds) : new ApiFailed(null);
}
