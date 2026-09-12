// Renderer-side crash/error reporting — covers React errors and anything
// that throws in the UI, which electron/telemetry.ts's main-process init
// doesn't see on its own.

import * as Sentry from "@sentry/electron/renderer";
import { SENTRY_DSN } from "./shared/telemetry";

export function initTelemetry(): void {
  // Nothing from `npm run dev` should reach Sentry: Vite's hot reload alone
  // produced 168 "useI18n must be used within I18nProvider" events in a week
  // (a recreated context module, not a real bug), all from this machine.
  if (!SENTRY_DSN || import.meta.env.DEV) return;
  Sentry.init({ dsn: SENTRY_DSN });
}
