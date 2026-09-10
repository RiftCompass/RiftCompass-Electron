// Fails when a file in the working tree contains something that must never
// reach GitHub: credentials, private keys, private network addresses or the
// owner's personal identity. Runs before every build (`prebuild`) and in CI;
// the same script lives in the web repo. Add a pattern here the moment a
// new kind of secret enters the project.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const PATTERNS = [
  [/RGAPI-[0-9a-f-]{20,}/, "Riot API key"],
  [/\bre_[A-Za-z0-9]{20,}\b/, "Resend API key"],
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/, "GitHub fine-grained token"],
  [/\bsk_(live|test)_[A-Za-z0-9]{10,}\b/, "Stripe key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  // A throwaway local database (CI, the SSH tunnel example) is not a secret.
  [/postgres(ql)?:\/\/[^\s"'`]+:[^\s"'`@<]+@(?!localhost|127\.0\.0\.1)/, "database URL with password"],
  [/\b(AUTH_SECRET|DESKTOP_API_SECRET|RESEND_API_KEY|RIOT_API_KEY)=[^\s<${]{8,}/, "filled-in secret variable"],
  [/\b100\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, "Tailscale address"],
  [/\b192\.168\.\d{1,3}\.\d{1,3}\b/, "LAN address"],
  [/julio\.lopez|juliolopez2003|juliolpzsu/i, "owner's personal account"],
  [/Julio L[oó]pez Su[aá]rez/, "owner's full name"],
];

// The legal pages must name the natural person behind the site (LSSI art. 10,
// GDPR art. 13); that is the only place the full name is allowed.
const ALLOWED_NAME_FILES = /^src\/data\/legal\/(notice|privacy)\/(en|es|fr|de)\.json$/;
const SKIP_FILES = /^(package-lock\.json|\.claude\/|public\/images\/|scripts\/check-sensitive\.mjs$)/;
const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "dist-electron",
  "release", "out", "coverage", ".avatars", ".claude",
]);

// Exact names alone weren't enough. A copy of the build output left inside
// the checkout (`.next.bak`, `.next-old`) got walked, and the compiled legal
// pages in there carry the owner's real name, so the build failed on its own
// output instead of on anything anyone had written. Backup copies of any
// directory get the same treatment.
function skipDir(name) {
  return (
    SKIP_DIRS.has(name) ||
    name.startsWith(".next") ||
    name.startsWith("node_modules") ||
    /\.(bak|old|orig)$/.test(name) ||
    name.endsWith("~")
  );
}
const NUL = String.fromCharCode(0);

// Production builds run as a service user that does not own the checkout, so
// `git ls-files` refuses there ("dubious ownership"): walk the tree instead.
function walk(dir, found) {
  for (const entry of readdirSync(dir === "" ? "." : dir, { withFileTypes: true })) {
    const rel = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!skipDir(entry.name)) walk(rel, found);
    } else if (!/^\.env/.test(entry.name) || entry.name === ".env.example") {
      found.push(rel);
    }
  }
  return found;
}

function filesToCheck() {
  try {
    const out = execSync("git ls-files -z", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split(NUL).filter(Boolean);
  } catch {
    return walk("", []);
  }
}

const files = filesToCheck();
const findings = [];
for (const file of files) {
  if (SKIP_FILES.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes(NUL)) continue; // binary
  for (const [pattern, label] of PATTERNS) {
    if (label === "owner's full name" && ALLOWED_NAME_FILES.test(file)) continue;
    const match = text.match(pattern);
    if (match) {
      const line = text.slice(0, match.index).split("\n").length;
      findings.push(`${file}:${line}: ${label}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Sensitive content found:\n  " + findings.join("\n  "));
  process.exit(1);
}
console.log(`check-sensitive: ${files.length} files clean.`);
