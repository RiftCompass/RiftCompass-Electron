// A Sentry DSN identifies where to send events, not a secret: it is meant
// to ship inside client apps (same as any web app's client-side Sentry
// init). Project "electron" in the riftcompass org (EU region). Both
// electron/telemetry.ts and src/telemetry.ts no-op when it is empty.
export const SENTRY_DSN =
  "https://4e171c8a6079cdfdfe81837eadf054ea@o4512012979208192.ingest.de.sentry.io/4512012986810448";
