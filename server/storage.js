// Accès aux fichiers de config Glance : soit un dossier local (dev/tests),
// soit un dossier distant via le binaire `ssh` (même chose que « éditer en
// SSH à la main », mais depuis l'interface).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\-/]*\.ya?ml$/;

export function checkName(name) {
  if (typeof name !== "string" || !NAME_RE.test(name) || name.includes("..") || name.includes("//")) {
    throw httpError(400, "Nom de fichier invalide");
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

export function localStorage(dir) {
  const abs = (name) => path.join(dir, checkName(name));
  return {
    label: `local:${dir}`,
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

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), 20_000);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(httpError(502, `SSH a échoué (code ${code}) : ${err.trim() || "pas de message"}`));
    });
    p.stdin.end(input ?? "");
  });
}

export function sshStorage({ host, port = 22, user, dir, keyPath, knownHosts }) {
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
  return {
    label: `ssh:${user}@${host}:${port}${dir}`,
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
      sh(`f=${sq(abs(name))}; cp -p "$f" "$f.bak" 2>/dev/null; cat > "$f"`, content).then(() => {}),
  };
}

export function storageFromEnv(env = process.env) {
  if (env.GLANCE_LOCAL_DIR) return localStorage(env.GLANCE_LOCAL_DIR);
  const missing = ["SSH_HOST", "SSH_USER", "GLANCE_CONFIG_DIR"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Variables manquantes : ${missing.join(", ")} (ou GLANCE_LOCAL_DIR)`);
  return sshStorage({
    host: env.SSH_HOST,
    port: env.SSH_PORT || 22,
    user: env.SSH_USER,
    dir: env.GLANCE_CONFIG_DIR,
    keyPath: env.SSH_KEY_PATH || "/run/secrets/ssh_key",
    knownHosts: env.SSH_KNOWN_HOSTS || "/data/known_hosts",
  });
}
