import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The packaged app loads dist/index.html via a plain file:// URL (see
  // electron/windows.ts's loadFile) — Vite's default "/" base produces
  // absolute asset paths that don't resolve under file://, so this must
  // stay relative.
  base: "./",
  clearScreen: false,
  // Puerto 1421 por defecto, pero configurable con VITE_PORT: en este proyecto
  // es normal tener varias sesiones a la vez y matarle el servidor de desarrollo
  // a otra para quedarse con el puerto es peor que usar uno libre. La expansion
  // de shell no vale aqui (los scripts de npm pasan por cmd en Windows), asi que
  // el puerto se resuelve en JavaScript, tanto aqui como en dev-overwolf.mjs.
  server: {
    port: Number(process.env.VITE_PORT ?? 1421),
    strictPort: true,
  },
});
