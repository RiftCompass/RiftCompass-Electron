// Fails when a file in the working tree contains something that must never
// reach GitHub: credentials, private keys, private network addresses or the
// owner's personal identity. Runs before every build (`prebuild`) and in CI;
// the same script lives in the web repo. Add a pattern here the moment a
// new kind of secret enters the project.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
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
  [/\b(AUTH_SECRET|DESKTOP_API_SECRET|RESEND_API_KEY|RIOT_API_KEY|OW_CLI_API_KEY|OW_DEV_KEY)=[^\s<${]{8,}/, "filled-in secret variable"],
  [/\b100\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, "Tailscale address"],
  [/\b192\.168\.\d{1,3}\.\d{1,3}\b/, "LAN address"],
];

// The owner's identity is matched by salted hash, so this file does not spell
// out what it forbids (the repository is public; the check itself must not be
// the leak). To add an entry:
//   node -e 'const c=require("node:crypto");console.log(c.createHash("sha256").update(process.argv[1]+process.argv[2]).digest("hex"))' <salt> <value>
// Accounts: `value` is the lowercase handle or e-mail local part, dots kept.
// Every handle-like chunk of a file is hashed at each `.`, `_` or `-` boundary
// and at its end, so an e-mail local part matches through its prefix and a
// handle matches inside a URL. Names: lowercase, accents stripped, words
// joined by single spaces; three consecutive words are hashed at a time.
const IDENTITY_SALT = "riftcompass-check-sensitive";
const OWNER_ACCOUNT_HASHES = new Set([
  "9d57ea0b3577d8326e1171c76118b1d6a1ca2e32c8c265fe308c8c175c0d542d",
  "9a0506df1e70c1a6a86f8dbff6d59fea198a9d7f50111671ccf38d8f4f470f5f",
  "63a8c114ee2b5a7c471e5c25a3a73005b87926d379b40e2f79941f3d2de73024",
]);
const OWNER_NAME_HASHES = new Set([
  "469644242386509abcfd69e14a27b78a98a8e373378e88b82137aa747ce758ed",
]);

// The legal pages must name the natural person behind the site (LSSI art. 10,
// GDPR art. 13); that is the only place the full name is allowed.
const ALLOWED_NAME_FILES = /^src\/data\/legal\/(notice|privacy)\/(en|es|fr|de)\.json$/;
const SKIP_FILES = /^(package-lock\.json|\.the tooling\/|public\/images\/)/;
const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "dist-electron",
  "release", "out", "coverage", ".avatars", ".the tooling",
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

function identityHash(value) {
  return createHash("sha256").update(IDENTITY_SALT + value).digest("hex");
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

// Line of the first handle-like chunk whose prefix hashes to a known account.
function findOwnerAccount(text) {
  const chunks = /[a-z0-9][a-z0-9._-]*/gi;
  let match;
  while ((match = chunks.exec(text))) {
    const chunk = match[0].toLowerCase();
    for (let end = 1; end <= chunk.length; end++) {
      if (end < chunk.length && !/[._-]/.test(chunk[end])) continue;
      if (OWNER_ACCOUNT_HASHES.has(identityHash(chunk.slice(0, end)))) {
        return lineAt(text, match.index);
      }
    }
  }
  return 0;
}

// Line of the first three consecutive words that hash to a known full name.
// NFD keeps every newline where it was, so lines can be counted on the
// normalised text.
function findOwnerName(text) {
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = [...plain.matchAll(/[a-z]+/g)];
  for (let i = 0; i + 2 < words.length; i++) {
    const phrase = `${words[i][0]} ${words[i + 1][0]} ${words[i + 2][0]}`;
    if (OWNER_NAME_HASHES.has(identityHash(phrase))) return lineAt(plain, words[i].index);
  }
  return 0;
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
    const match = text.match(pattern);
    if (match) findings.push(`${file}:${lineAt(text, match.index)}: ${label}`);
  }
  const accountLine = findOwnerAccount(text);
  if (accountLine) findings.push(`${file}:${accountLine}: owner's personal account`);
  if (!ALLOWED_NAME_FILES.test(file)) {
    const nameLine = findOwnerName(text);
    if (nameLine) findings.push(`${file}:${nameLine}: owner's full name`);
  }
}

if (findings.length > 0) {
  console.error("Sensitive content found:\n  " + findings.join("\n  "));
  process.exit(1);
}
console.log(`check-sensitive: ${files.length} files clean.`);
