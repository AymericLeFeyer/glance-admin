import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { checkName, hash, httpError, storageFromEnv } from "./storage.js";
import { addMonitor, deleteMonitor, listMonitors, parseDoc, updateMonitor, validate } from "./monitors.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

export function createApp(storage, { password } = {}) {
  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const body = async (req) => {
    let s = "";
    for await (const c of req) {
      s += c;
      if (s.length > 2_000_000) throw httpError(413, "Corps trop gros");
    }
    try {
      return JSON.parse(s || "{}");
    } catch {
      throw httpError(400, "JSON invalide");
    }
  };

  const authorized = (req) => {
    if (!password) return true;
    const given = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /, ""), "base64").toString();
    const pw = given.slice(given.indexOf(":") + 1);
    const a = Buffer.from(pw);
    const b = Buffer.from(password);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  async function api(req, res, url) {
    const m = req.method;
    if (m === "GET" && url.pathname === "/api/info") return json(res, 200, { storage: storage.label });
    if (m === "GET" && url.pathname === "/api/files") return json(res, 200, await storage.list());

    if (url.pathname === "/api/file") {
      if (m === "GET") {
        const name = checkName(url.searchParams.get("name"));
        const content = await storage.read(name);
        return json(res, 200, { name, content, hash: hash(content) });
      }
      if (m === "POST") {
        const { name, content = "" } = await body(req);
        checkName(name);
        if (typeof content !== "string") throw httpError(400, "content invalide");
        parseDoc(content);
        if ((await storage.list()).includes(name)) throw httpError(409, `${name} existe déjà`);
        await storage.write(name, content);
        return json(res, 200, { name, hash: hash(content) });
      }
      if (m === "PUT") {
        const { name, content, hash: prev } = await body(req);
        checkName(name);
        if (typeof content !== "string") throw httpError(400, "content manquant");
        parseDoc(content); // refuse d'écrire un YAML cassé
        if (prev && hash(await storage.read(name)) !== prev) {
          throw httpError(409, "Le fichier a été modifié ailleurs depuis son chargement. Recharge-le.");
        }
        await storage.write(name, content);
        return json(res, 200, { hash: hash(content) });
      }
    }

    // Monitors de tous les fichiers (hors fichiers sans widget monitor)
    if (m === "GET" && url.pathname === "/api/monitors") {
      const out = [];
      for (const file of await storage.list()) {
        let text;
        try {
          text = await storage.read(file);
          const widgets = listMonitors(text);
          if (widgets.length) out.push({ file, hash: hash(text), widgets });
        } catch (e) {
          if (e.status === 502) throw e; // SSH KO : inutile de continuer
          // fichier non parsable : visible dans l'éditeur YAML, ignoré ici
        }
      }
      return json(res, 200, out);
    }
    if (m === "PUT" && url.pathname === "/api/monitors") {
      const { file, path: p, sites, title, hash: prev } = await body(req);
      checkName(file);
      if (!Array.isArray(p) || !Array.isArray(sites)) throw httpError(400, "path et sites requis");
      const text = await storage.read(file);
      if (prev && hash(text) !== prev) throw httpError(409, "Le fichier a été modifié ailleurs. Recharge la page.");
      const next = updateMonitor(text, p, sites, { title });
      parseDoc(next);
      await storage.write(file, next);
      return json(res, 200, { hash: hash(next), widgets: listMonitors(next) });
    }
    if (m === "POST" && url.pathname === "/api/monitors") {
      const { file, title, hash: prev } = await body(req);
      checkName(file);
      const text = await storage.read(file);
      if (prev && hash(text) !== prev) throw httpError(409, "Le fichier a été modifié ailleurs. Recharge la page.");
      await storage.write(file, addMonitor(text, String(title ?? "").trim()));
      return json(res, 200, { ok: true });
    }
    if (m === "DELETE" && url.pathname === "/api/monitors") {
      const { file, path: p, hash: prev } = await body(req);
      checkName(file);
      if (!Array.isArray(p)) throw httpError(400, "path requis");
      const text = await storage.read(file);
      if (prev && hash(text) !== prev) throw httpError(409, "Le fichier a été modifié ailleurs. Recharge la page.");
      await storage.write(file, deleteMonitor(text, p));
      return json(res, 200, { ok: true });
    }
    if (m === "POST" && url.pathname === "/api/validate") {
      const { content } = await body(req);
      if (typeof content !== "string") throw httpError(400, "content manquant");
      return json(res, 200, validate(content));
    }
    throw httpError(404, "Route inconnue");
  }

  return async (req, res) => {
    try {
      if (!authorized(req)) {
        res.writeHead(401, { "www-authenticate": 'Basic realm="glance-admin"' });
        return res.end();
      }
      const url = new URL(req.url, "http://x");
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (file.includes("..") || !TYPES[path.extname(file)]) throw httpError(404, "Not found");
      const data = await readFile(path.join(PUBLIC, file)).catch(() => {
        throw httpError(404, "Not found");
      });
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] });
      res.end(data);
    } catch (e) {
      json(res, e.status ?? 500, { error: e.message });
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const storage = storageFromEnv();
  const port = Number(process.env.PORT || 8084);
  createServer(createApp(storage, { password: process.env.ADMIN_PASSWORD })).listen(port, () =>
    console.log(`glance-admin sur :${port} → ${storage.label}`),
  );
}
