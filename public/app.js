const $ = (s, r = document) => r.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.flat().filter((k) => k != null));
  return e;
};

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
  return data;
}

let toastTimer;
function toast(msg, kind = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 3500);
}

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
    for (const id of ["monitors", "yaml"]) $(`#${id}`).hidden = id !== b.dataset.tab;
    if (b.dataset.tab === "yaml" && !current) loadFiles();
  };
}

// ---------- Monitors ----------
const FIELDS = [
  ["title", "Titre"],
  ["url", "URL"],
  ["icon", "Icône (si:jellyfin, sh:nom, URL…)"],
];

async function loadMonitors() {
  const root = $("#monitors");
  root.replaceChildren(el("div", { className: "empty" }, "Chargement…"));
  let groups;
  try {
    groups = await api("GET", "/api/monitors");
  } catch (e) {
    root.replaceChildren(el("div", { className: "empty" }, e.message));
    return;
  }
  if (!groups.length) {
    root.replaceChildren(el("div", { className: "empty" }, "Aucun widget « monitor » trouvé dans la config."));
    return;
  }
  root.replaceChildren(...groups.flatMap((g) => g.widgets.map((w) => widgetCard(g, w))));
}

function widgetCard(group, widget) {
  let sites = widget.sites.map((s) => ({ ...s }));
  let hash = group.hash;
  let dirty = false;
  const card = el("div", { className: "widget" });
  const titleInput = el("input", { value: widget.title, placeholder: "Titre du widget", oninput: () => mark() });
  const dirtyLabel = el("span", { className: "dirty" });
  const save = el("button", { className: "primary", textContent: "Enregistrer", disabled: true });
  const list = el("div");

  const mark = () => {
    dirty = true;
    save.disabled = false;
    dirtyLabel.textContent = "Modifications non enregistrées";
  };

  function row(s, i) {
    const bind = (key, ph, extra = {}) =>
      el("input", { value: s[key] ?? "", placeholder: ph, oninput: (e) => { s[key] = e.target.value; mark(); }, ...extra });
    const row = el("div", { className: "site" });
    const adv = el("div", { className: "adv" },
      lab("check-url (URL testée, si différente)", bind("check-url", "https://…")),
      lab("timeout", bind("timeout", "3s")),
      lab("alt-status-codes (ex. 401, 403)", bind("alt-status-codes", "401, 403", {
        value: Array.isArray(s["alt-status-codes"]) ? s["alt-status-codes"].join(", ") : (s["alt-status-codes"] ?? ""),
      })),
      check("allow-insecure", "Certificat non valide accepté"),
      check("same-tab", "Ouvrir dans le même onglet"),
      check("hide-url", "Masquer l'URL"),
    );
    function check(key, label) {
      return el("label", { className: "check" },
        el("input", { type: "checkbox", checked: !!s[key], onchange: (e) => { s[key] = e.target.checked; mark(); } }), label);
    }
    row.append(
      bind("title", "Titre"), bind("url", "https://…"), bind("icon", "si:jellyfin"),
      el("div", { className: "actions" },
        btn("⚙", "Options avancées", () => row.classList.toggle("open")),
        btn("↑", "Monter", () => move(i, -1), i === 0),
        btn("↓", "Descendre", () => move(i, 1), i === sites.length - 1),
        btn("✕", "Supprimer", () => { sites.splice(i, 1); mark(); render(); }, false, "danger"),
      ),
      adv,
    );
    if (hasAdvanced(s)) row.classList.add("open");
    return row;
  }
  const lab = (t, input) => el("label", {}, t, input);
  const hasAdvanced = (s) => ["check-url", "timeout", "alt-status-codes", "allow-insecure", "same-tab", "hide-url"].some((k) => s[k]);
  const btn = (txt, title, fn, disabled = false, cls = "") =>
    el("button", { className: `ghost ${cls}`, textContent: txt, title, onclick: fn, disabled });
  const move = (i, d) => { [sites[i], sites[i + d]] = [sites[i + d], sites[i]]; mark(); render(); };
  const render = () => list.replaceChildren(...sites.map(row));

  save.onclick = async () => {
    save.disabled = true;
    try {
      const res = await api("PUT", "/api/monitors", {
        file: group.file, path: widget.path, hash, title: titleInput.value,
        sites: sites.map((s) => ({ ...s })),
      });
      hash = res.hash;
      const fresh = res.widgets.find((x) => JSON.stringify(x.path) === JSON.stringify(widget.path));
      if (fresh) sites = fresh.sites.map((s) => ({ ...s }));
      dirty = false;
      dirtyLabel.textContent = "";
      render();
      toast(`${group.file} enregistré — Glance recharge tout seul`);
    } catch (e) {
      save.disabled = false;
      toast(e.message, "err");
    }
  };

  card.append(
    el("div", { className: "head" }, titleInput, el("span", { className: "meta" }, `${group.file}`), el("span", { className: "spacer" })),
    list,
    el("div", { className: "foot" },
      el("button", { textContent: "+ Ajouter un site", onclick: () => { sites.push({ title: "", url: "" }); mark(); render(); } }),
      save, dirtyLabel),
  );
  render();
  return card;
}

// ---------- YAML ----------
let current = null; // { name, hash, original }
const text = $("#text");
const status = $("#status");
const saveBtn = $("#save");

async function loadFiles() {
  const files = await api("GET", "/api/files");
  $("#files").replaceChildren(
    ...files.map((f) => el("button", { textContent: f, className: f === current?.name ? "active" : "", onclick: () => openFile(f) })),
  );
  if (!current && files.length) openFile(files.includes("glance.yml") ? "glance.yml" : files[0]);
}

async function openFile(name) {
  if (current && text.value !== current.original && !confirm("Abandonner les modifications non enregistrées ?")) return;
  try {
    const f = await api("GET", `/api/file?name=${encodeURIComponent(name)}`);
    current = { name, hash: f.hash, original: f.content };
    text.value = f.content;
    text.disabled = false;
    $("#filename").textContent = name;
    status.textContent = "";
    saveBtn.disabled = true;
    document.querySelectorAll("#files button").forEach((b) => b.classList.toggle("active", b.textContent === name));
  } catch (e) {
    toast(e.message, "err");
  }
}

text.oninput = () => {
  saveBtn.disabled = text.value === current.original;
  status.textContent = saveBtn.disabled ? "" : "Modifié";
  status.className = "";
};
text.onkeydown = (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    document.execCommand("insertText", false, "  ");
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "s") {
    e.preventDefault();
    saveBtn.click();
  }
};
saveBtn.onclick = async () => {
  saveBtn.disabled = true;
  try {
    const r = await api("PUT", "/api/file", { name: current.name, content: text.value, hash: current.hash });
    current = { ...current, hash: r.hash, original: text.value };
    status.textContent = "Enregistré — Glance recharge tout seul";
    status.className = "";
    toast(`${current.name} enregistré`);
    loadMonitors();
  } catch (e) {
    saveBtn.disabled = false;
    status.textContent = e.message;
    status.className = "err";
  }
};

api("GET", "/api/info").then((i) => ($("#storage").textContent = i.storage)).catch(() => {});
loadMonitors();
