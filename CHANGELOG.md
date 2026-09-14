# Changelog

Una sección por versión, la más reciente arriba. `scripts/github-release.mjs`
copia la sección de la versión que se publica al cuerpo de la release de
GitHub, así que aquí se escribe para quien instala la app, no para quien la
programa (eso va en los mensajes de commit).

## 0.3.1

- La app encuentra el cliente de League aunque esté instalado fuera de `C:`
  (lee dónde lo puso el instalador de Riot y, si hace falta, lo pregunta al
  propio proceso del cliente). En Ajustes se puede elegir la carpeta a mano.
- Las actualizaciones se instalan solas cuando no hay partida en curso, en vez
  de esperar a que cierres la app.
- Herramientas de datos: si el servidor pide esperar, se dice cuántos segundos,
  en vez de "error de red".
- La participación en asesinatos del perfil se calcula igual que en la web.
- Nombres de los campamentos de jungla en francés y alemán.
- Las llamadas a riftcompass.com tienen tiempo máximo; los ajustes y la sesión
  se guardan de forma atómica; la sesión se renueva sola antes de caducar.

## 0.3.0

- Matchups de línea, builds con orden de compra y objetos iniciales, tendencia
  del plan de mejora y "mi perfil principal".
