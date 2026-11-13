// Banque d'images : liste, envoi, suppression, sélecteur. Les images vivent dans le
// dossier d'assets de Glance (server.assets-path) et s'utilisent comme icône via
// leur URL, par ex. « /assets/logo.png ».
import { $, el, api, toast } from "./util.js";

const state = { url: "/assets", files: [] };
export const assetsUrl = () => state.url;

// « /assets/logo.png » → URL d'aperçu servie par l'admin ; null si ce n'est pas une image de la banque.
export function assetSrc(icon) {
  const prefix = state.url + "/";
  if (typeof icon !== "string" || !icon.startsWith(prefix)) return null;
  const name = icon.slice(prefix.length);
  return /^[^/]+$/.test(name) ? `/api/asset?name=${encodeURIComponent(name)}&v=${state.files.find((f) => f.name === name)?.size ?? ""}` : null;
}

export async function refreshAssets() {
  const r = await api("GET", "/api/assets");
  state.url = r.url;
  state.files = r.files;
  return r.files;
}

const clean = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[-.]+/, "");
const kb = (n) => (n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toFixed(1)} Ko` : `${(n / 1048576).toFixed(1)} Mo`);

export async function uploadFiles(fileList) {
  let ok = 0;
  for (const f of fileList) {
    const name = clean(f.name);
    try {
      const exists = state.files.some((x) => x.name === name);
      if (exists && !confirm(`${name} existe déjà. Le remplacer ?`)) continue;
      const r = await fetch(`/api/assets?name=${encodeURIComponent(name)}${exists ? "&overwrite=1" : ""}`, { method: "POST", body: f });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
      ok++;
    } catch (e) {
      toast(`${f.name} : ${e.message}`, "err");
    }
  }
  if (ok) toast(`${ok} image${ok > 1 ? "s" : ""} envoyée${ok > 1 ? "s" : ""}`);
  return refreshAssets();
}

// Grille d'images. onPick : clic = choisir ; sinon clic = copier l'URL.
function grid(files, { onPick, onChange }) {
  if (!files.length) return el("div", { className: "empty" }, "Aucune image pour le moment. Dépose-en ou envoie-en avec le bouton ci-dessus.");
  return el("div", { className: "gallery" }, files.map((f) => {
    const url = `${state.url}/${f.name}`;
    const card = el("div", { className: "tile", title: url },
      el("button", { className: "thumb", onclick: () => (onPick ? onPick(url) : navigator.clipboard?.writeText(url).then(() => toast(`Copié : ${url}`))) },
        el("img", { src: assetSrc(url), alt: f.name })),
      el("div", { className: "meta" }, el("span", { className: "fname" }, f.name), el("small", {}, kb(f.size))),
      onPick ? null : el("button", {
        className: "ghost danger del", textContent: "✕", title: "Supprimer cette image",
        onclick: async () => {
          if (!confirm(`Supprimer ${f.name} ?\nLes icônes qui l'utilisent n'afficheront plus rien.`)) return;
          try {
            await api("DELETE", `/api/assets?name=${encodeURIComponent(f.name)}`);
            toast(`${f.name} supprimée`);
            onChange();
          } catch (e) { toast(e.message, "err"); }
        },
      }));
    return card;
  }));
}

function dropZone(node, onFiles) {
  node.ondragover = (e) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); node.classList.add("drop"); } };
  node.ondragleave = () => node.classList.remove("drop");
  node.ondrop = (e) => {
    node.classList.remove("drop");
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    onFiles(e.dataTransfer.files);
  };
}

function uploadButton(onFiles, label = "+ Envoyer des images") {
  const input = el("input", { type: "file", multiple: true, accept: "image/*", hidden: true, onchange: () => { onFiles(input.files); input.value = ""; } });
  return [el("button", { className: "primary", textContent: label, onclick: () => input.click() }), input];
}

// ---------- Onglet « Images » ----------
export async function loadImages() {
  const root = $("#images");
  let files;
  try {
    files = await refreshAssets();
  } catch (e) {
    root.replaceChildren(el("div", { className: "empty" }, e.message));
    return;
  }
  const reload = () => loadImages();
  const up = async (list) => { await uploadFiles(list); reload(); };
  root.replaceChildren(
    el("div", { className: "toolbar" },
      el("h2", {}, "Images"), el("span", { className: "chip" }, `${files.length} image${files.length > 1 ? "s" : ""}`),
      el("span", { className: "spacer" }), ...uploadButton(up)),
    el("p", { className: "hint" }, "Clique sur une image pour copier son URL (à mettre dans « Icône » ou dans le YAML). ",
      "Glance ne les sert que si ", el("code", {}, "server.assets-path"), " pointe vers ce dossier, accessible sur ", el("code", {}, `${state.url}/…`), "."),
    grid(files, { onChange: reload }),
  );
  dropZone(root, up);
}

// ---------- Sélecteur (depuis l'icône d'un site) ----------
export async function pickImage() {
  const dlg = $("#picker");
  const body = $("#picker-body");
  const up = (list) => uploadFiles(list).then(render);
  const render = async () => {
    try { await refreshAssets(); } catch (e) { body.replaceChildren(el("div", { className: "empty" }, e.message)); return; }
    body.replaceChildren(grid(state.files, { onPick: (url) => { dlg.returnValue = url; dlg.close(url); } }));
  };
  const [btn, input] = uploadButton(up, "+ Envoyer");
  $("#picker-upload").replaceChildren(btn, input);
  dropZone(dlg, up);
  dlg.returnValue = "";
  await render();
  dlg.showModal();
  return new Promise((resolve) => { dlg.onclose = () => resolve(dlg.returnValue || null); });
}
