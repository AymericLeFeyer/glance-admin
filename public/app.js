import { $, el, api, toast } from "./util.js";
import { loadMonitors } from "./monitors.js";
import { loadImages } from "./assets.js";

// ---------- Thème : clair / sombre / système (défaut) ----------
function setTheme(choice) {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    if (choice === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", choice);
  } catch {}
  document.querySelectorAll("[data-theme-choice]").forEach((b) => b.classList.toggle("active", b.dataset.themeChoice === choice));
}
for (const b of document.querySelectorAll("[data-theme-choice]")) b.onclick = () => setTheme(b.dataset.themeChoice);
setTheme(document.documentElement.dataset.theme ?? "system");

// ---------- Onglets ----------
for (const b of document.querySelectorAll("nav button")) {
  b.onclick = () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x === b));
    for (const id of ["monitors", "images", "yaml"]) $(`#${id}`).hidden = id !== b.dataset.tab;
    if (b.dataset.tab === "yaml") initYaml();
    else if (b.dataset.tab === "images") loadImages();
    else loadMonitors();
  };
}

// ---------- Éditeur YAML ----------
let editor = null;
let current = null; // { name, hash, original }
const status = $("#status");
const saveBtn = $("#save");
const yamlDirty = () => !!current && editor && editor.value() !== current.original;

function setStatus(msg, cls = "") {
  status.textContent = msg;
  status.className = cls;
}

async function initYaml() {
  if (!editor) {
    const { createEditor } = await import("/editor.bundle.js");
    editor = createEditor($("#cm"), {
      onChange: () => {
        if (!current) return;
        const d = yamlDirty();
        saveBtn.disabled = !d;
        setStatus(d ? "Modifié" : "");
        markDirtyInList(d);
      },
      onSave: () => saveBtn.click(),
    });
    await loadFiles();
  }
}

function markDirtyInList(d) {
  const b = [...document.querySelectorAll("#files button")].find((x) => x.dataset.name === current?.name);
  b?.querySelector(".dot")?.remove();
  if (d && b) b.append(el("span", { className: "dot", textContent: "●" }));
}

async function loadFiles() {
  const files = await api("GET", "/api/files");
  const items = [];
  let dir = null;
  for (const f of files) {
    const d = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
    if (d !== dir) { dir = d; if (d) items.push(el("div", { className: "dir" }, d + "/")); }
    items.push(el("button", {
      textContent: f.split("/").pop(), className: f === current?.name ? "active" : "", title: f,
      onclick: () => openFile(f),
    }));
    items.at(-1).dataset.name = f;
  }
  $("#files").replaceChildren(...items);
  if (!current && files.length) openFile(files.includes("glance.yml") ? "glance.yml" : files[0]);
}

async function openFile(name) {
  if (name === current?.name) return;
  if (yamlDirty() && !confirm("Abandonner les modifications non enregistrées de " + current.name + " ?")) return;
  try {
    const f = await api("GET", `/api/file?name=${encodeURIComponent(name)}`);
    current = { name, hash: f.hash, original: f.content };
    editor.open(f.content);
    $("#filename").textContent = name;
    setStatus("");
    saveBtn.disabled = true;
    document.querySelectorAll("#files button").forEach((b) => { b.classList.toggle("active", b.dataset.name === name); b.querySelector(".dot")?.remove(); });
    editor.focus();
  } catch (e) {
    toast(e.message, "err");
  }
}

$("#new-file").onclick = async () => {
  let name = prompt("Nom du nouveau fichier (ex. widgets/jeux.yml) :", current?.name.includes("/") ? current.name.replace(/[^/]*$/, "") : "");
  if (!name) return;
  name = name.trim().replace(/^\/+/, "");
  if (!/\.ya?ml$/.test(name)) name += ".yml";
  try {
    await api("POST", "/api/file", { name, content: "" });
    await loadFiles();
    await openFile(name); // demande confirmation si le fichier courant a des modifications
    toast(`${name} créé — Glance ne le lit que s'il est référencé (« $include: … »)`);
  } catch (e) {
    toast(e.message, "err");
  }
};

saveBtn.onclick = async () => {
  if (!current || saveBtn.disabled) return;
  saveBtn.disabled = true;
  const content = editor.value();
  try {
    const r = await api("PUT", "/api/file", { name: current.name, content, hash: current.hash });
    current = { ...current, hash: r.hash, original: content };
    setStatus("Enregistré — Glance recharge tout seul", "ok");
    markDirtyInList(false);
    toast(`${current.name} enregistré`);
  } catch (e) {
    saveBtn.disabled = false;
    setStatus(e.message, "err");
  }
};

window.addEventListener("beforeunload", (e) => { if (yamlDirty()) e.preventDefault(); });

api("GET", "/api/info").then((i) => ($("#storage").textContent = i.storage)).catch(() => {});
loadMonitors();
