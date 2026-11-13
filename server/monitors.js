// Lecture / modification des widgets `type: monitor` d'un fichier YAML Glance,
// en conservant commentaires et mise en forme (API Document de `yaml`).
import YAML, { isMap, isSeq, isScalar } from "yaml";
import { httpError } from "./storage.js";

// Clés gérées par le formulaire ; toute autre clé du site est laissée intacte.
export const SITE_KEYS = [
  "title", "url", "icon", "check-url", "error-url", "timeout",
  "allow-insecure", "same-tab", "alt-status-codes", "hide-url", "expected-status",
];
const BOOL_KEYS = new Set(["allow-insecure", "same-tab", "hide-url"]);

export function parseDoc(text) {
  const doc = YAML.parseDocument(text, { keepSourceTokens: false });
  if (doc.errors.length) throw httpError(400, `YAML invalide : ${doc.errors[0].message}`);
  return doc;
}

const plain = (n) => (isScalar(n) ? n.value : n?.toJSON?.() ?? n);

// Trouve tous les widgets monitor (n'importe où dans l'arbre).
export function findMonitors(doc) {
  const found = [];
  YAML.visit(doc, {
    Map(_, node, p) {
      if (plain(node.get("type", true)) === "monitor" && isSeq(node.get("sites", true))) {
        found.push({ node, path: pathOf(doc, [...p.filter((x) => !YAML.isDocument(x)), node]) });
      }
    },
  });
  return found;
}

// Reconstruit un chemin [clé|index, …] à partir de la pile d'ancêtres de visit().
function pathOf(_doc, chain) {
  const path = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const cur = chain[i];
    const next = chain[i + 1];
    if (isSeq(cur)) path.push(cur.items.indexOf(next));
    else if (isMap(cur) && YAML.isPair(next)) path.push(plain(next.key));
  }
  return path;
}

export function listMonitors(text) {
  const doc = parseDoc(text);
  return findMonitors(doc).map(({ node, path }) => ({
    path,
    title: plain(node.get("title", true)) ?? "",
    cache: plain(node.get("cache", true)) ?? "",
    sites: node.get("sites", true).items.map((s, i) => {
      const o = { _i: i };
      for (const k of SITE_KEYS) {
        if (isMap(s) && s.has(k)) o[k] = plain(s.get(k, true));
      }
      return o;
    }),
  }));
}

function normalise(site) {
  const out = {};
  for (const k of SITE_KEYS) {
    let v = site[k];
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (k === "alt-status-codes") {
      v = (Array.isArray(v) ? v : String(v).split(/[,\s]+/)).filter(Boolean).map(Number);
      if (!v.length || v.some((n) => !Number.isInteger(n))) throw httpError(400, "alt-status-codes : codes HTTP séparés par des virgules");
    } else if (k === "expected-status") {
      v = Number(v);
    } else if (BOOL_KEYS.has(k)) {
      v = v === true || v === "true";
    } else v = String(v).trim();
    out[k] = v;
  }
  if (!out.title || !out.url) throw httpError(400, "Chaque monitor a besoin d'un titre et d'une URL");
  return out;
}

// Remplace la liste `sites` du widget situé à `path`, en réutilisant les nœuds
// existants (commentaires, clés inconnues) quand `_i` est fourni.
export function updateMonitor(text, path, sites, meta = {}) {
  const doc = parseDoc(text);
  const target = findMonitors(doc).find((m) => JSON.stringify(m.path) === JSON.stringify(path));
  if (!target) throw httpError(404, "Widget monitor introuvable (le fichier a changé ?)");
  const seq = target.node.get("sites", true);
  const old = seq.items;
  const used = new Set();

  seq.items = sites.map((raw) => {
    const clean = normalise(raw);
    const existing = Number.isInteger(raw._i) && !used.has(raw._i) ? old[raw._i] : null;
    if (existing && isMap(existing)) {
      used.add(raw._i);
      for (const k of SITE_KEYS) {
        if (k in clean) {
          // valeur inchangée : on ne touche pas au nœud (garde le style flow `[401, 403]`, les commentaires)
          if (JSON.stringify(plain(existing.get(k, true))) !== JSON.stringify(clean[k])) existing.set(k, clean[k]);
        }
        else existing.delete(k);
      }
      return existing;
    }
    return doc.createNode(clean);
  });

  if (typeof meta.title === "string") {
    if (meta.title) target.node.set("title", meta.title);
    else target.node.delete("title");
  }
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}
