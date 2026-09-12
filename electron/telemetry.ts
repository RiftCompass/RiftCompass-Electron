// Main-process crash/error reporting. Errors thrown here never reach
// Chrome DevTools (see the CLAUDE.md gotcha) and this app has no other
// logger, so without this a real user's crash leaves no trace at all.

import { app } from "electron";
import * as Sentry from "@sentry/electron/main";
import { SENTRY_DSN } from "../src/shared/telemetry";

export function initTelemetry(): void {
  // Only the packaged app reports: development runs go to the terminal of
  // `npm run dev`, and src/telemetry.ts applies the same rule to the renderer.
  if (!SENTRY_DSN || !app.isPackaged) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: "production",
  });
}
