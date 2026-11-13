// Accès aux fichiers de config Glance : soit un dossier local (dev/tests),
// soit un dossier distant via le binaire `ssh` (même chose que « éditer en
// SSH à la main », mais depuis l'interface).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, copyFile, stat, rm } from "node:fs/promises";
import path from "node:path";

const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\-/]*\.ya?ml$/;

export function checkName(name) {
  if (typeof name !== "string" || !NAME_RE.test(name) || name.includes("..") || name.includes("//")) {
    throw httpError(400, "Nom de fichier invalide");
  }
  return name;
}

const ASSET_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*\.(png|jpe?g|gif|webp|svg|ico|avif)$/i;
export const ASSET_TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon", avif: "image/avif",
};

export function checkAsset(name) {
  if (typeof name !== "string" || !ASSET_RE.test(name) || name.includes("..")) {
    throw httpError(400, "Nom d'image invalide (png, jpg, gif, webp, svg, ico, avif ; pas de sous-dossier)");
  }
  return name;
}

export function hash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// ---------- Local ----------

export function localStorage(dir, assetsDir = path.join(dir, "assets")) {
  const abs = (name) => path.join(dir, checkName(name));
  const assetPath = (name) => path.join(assetsDir, checkAsset(name));
  return {
    label: `local:${dir}`,
    assets: {
      async list() {
        const out = [];
        for (const e of await readdir(assetsDir, { withFileTypes: true }).catch(() => [])) {
          if (e.isFile() && ASSET_RE.test(e.name)) out.push({ name: e.name, size: (await stat(path.join(assetsDir, e.name))).size });
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
      },
      read: (name) => readFile(assetPath(name)),
      async write(name, data) {
        await mkdir(assetsDir, { recursive: true });
        await writeFile(assetPath(name), data);
      },
      remove: (name) => rm(assetPath(name), { force: true }),
    },
    async list() {
      const out = [];
      async function walk(rel, depth) {
        for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory() && depth < 3) await walk(r, depth + 1);
          else if (e.isFile() && /\.ya?ml$/.test(e.name)) out.push(r);
        }
      }
      await walk("", 0);
      return out.sort();
    },
    read: (name) => readFile(abs(name), "utf8"),
    async write(name, content) {
      const f = abs(name);
      await copyFile(f, `${f}.bak`).catch(() => {});
      await mkdir(path.dirname(f), { recursive: true });
      await writeFile(f, content);
    },
  };
}

// ---------- SSH ----------

const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function run(cmd, args, input, { binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), 30_000);
    p.stdout.on("data", (d) => chunks.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (code === 0) resolve(binary ? buf : buf.toString("utf8"));
      else reject(httpError(502, `SSH a échoué (code ${code}) : ${err.trim() || "pas de message"}`));
    });
    p.stdin.end(input ?? "");
  });
}

export function sshStorage({ host, port = 22, user, dir, keyPath, knownHosts, assetsDir }) {
  const base = [
    "-p", String(port),
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", "StrictHostKeyChecking=accept-new",
    ...(keyPath ? ["-i", keyPath, "-o", "IdentitiesOnly=yes"] : []),
    ...(knownHosts ? ["-o", `UserKnownHostsFile=${knownHosts}`] : []),
    `${user}@${host}`,
  ];
  const sh = (script, input) => run("ssh", [...base, script], input);
  const abs = (name) => `${dir.replace(/\/$/, "")}/${checkName(name)}`;
  const aDir = (assetsDir || `${dir.replace(/\/$/, "")}/assets`).replace(/(.)\/$/, "$1");
  const aAbs = (name) => `${aDir}/${checkAsset(name)}`;
  return {
    label: `ssh:${user}@${host}:${port}${dir}`,
    assets: {
      async list() {
        const out = await sh(
          `cd ${sq(aDir)} 2>/dev/null || exit 0; for f in *; do [ -f "$f" ] && printf '%s\\t%s\\n' "$(wc -c < "$f")" "$f"; done; true`,
        );
        return out.split("\n").filter(Boolean).map((l) => {
          const [size, ...n] = l.split("\t");
          return { name: n.join("\t"), size: Number(size) };
        }).filter((f) => ASSET_RE.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
      },
      read: (name) => run("ssh", [...base, `cat ${sq(aAbs(name))}`], undefined, { binary: true }),
      write: (name, data) => sh(`mkdir -p ${sq(aDir)} && cat > ${sq(aAbs(name))}`, data).then(() => {}),
      remove: (name) => sh(`rm -f ${sq(aAbs(name))}`).then(() => {}),
    },
    async list() {
      const out = await sh(
        `cd ${sq(dir)} && find . -maxdepth 4 -type f \\( -name '*.yml' -o -name '*.yaml' \\) | sed 's|^\\./||'`,
      );
      return out.split("\n").filter(Boolean).sort();
    },
    read: (name) => sh(`cat ${sq(abs(name))}`),
    // Écriture en place (même inode) : un bind mount d'un fichier unique reste valide,
    // et Glance recharge tout seul à la modification.
    write: (name, content) =>
      sh(`f=${sq(abs(name))}; mkdir -p "$(dirname "$f")"; cp -p "$f" "$f.bak" 2>/dev/null; cat > "$f"`, content).then(() => {}),
  };
}

export function storageFromEnv(env = process.env) {
  if (env.GLANCE_LOCAL_DIR) return localStorage(env.GLANCE_LOCAL_DIR, env.GLANCE_ASSETS_DIR || undefined);
  const missing = ["SSH_HOST", "SSH_USER", "GLANCE_CONFIG_DIR"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Variables manquantes : ${missing.join(", ")} (ou GLANCE_LOCAL_DIR)`);
  return sshStorage({
    host: env.SSH_HOST,
    port: env.SSH_PORT || 22,
    user: env.SSH_USER,
    dir: env.GLANCE_CONFIG_DIR,
    keyPath: env.SSH_KEY_PATH,
    knownHosts: env.SSH_KNOWN_HOSTS || "/data/known_hosts",
    assetsDir: env.GLANCE_ASSETS_DIR || undefined,
  });
}
