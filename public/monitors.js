import { $, el, api, toast } from "./util.js";

const ADV_KEYS = ["check-url", "timeout", "alt-status-codes", "allow-insecure", "same-tab", "hide-url"];

// Aperçu d'icône comme Glance : si:/mdi: (monochromes), sh:/di: (couleur), ou URL.
function iconSrc(icon) {
  const m = /^(si|mdi|sh|di):(.+)$/.exec(icon ?? "");
  if (m) {
    const [, kind, name] = m;
    return {
      si: [`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${name}.svg`, true],
      mdi: [`https://cdn.jsdelivr.net/npm/@mdi/svg@latest/svg/${name}.svg`, true],
      sh: [`https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${name}.svg`, false],
      di: [`https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${name}.svg`, false],
    }[kind];
  }
  if (/^(https?:)?\/\//.test(icon ?? "") || (icon ?? "").startsWith("/")) return [icon, false];
  return null;
}

function iconPreview(s) {
  const box = el("span", { className: "ico" });
  const letter = () => box.replaceChildren((s.title || s.url || "?").trim()[0]?.toUpperCase() ?? "?");
  const src = iconSrc(s.icon);
  if (!src) letter();
  else {
    box.classList.toggle("mono", src[1]);
    box.append(el("img", { src: src[0], alt: "", onerror: letter }));
  }
  return box;
}

export async function loadMonitors() {
  const root = $("#monitors");
  let groups;
  try {
    groups = await api("GET", "/api/monitors");
  } catch (e) {
    root.replaceChildren(el("div", { className: "empty" }, e.message));
    return;
  }
  const toolbar = el("div", { className: "toolbar" },
    el("h2", {}, "Monitors"),
    el("span", { className: "chip" }, `${groups.reduce((n, g) => n + g.widgets.length, 0)} sections`),
    el("span", { className: "spacer" }),
    el("button", { className: "primary", textContent: "+ Nouvelle section", disabled: !groups.length, onclick: () => openNewSection(groups) }),
  );
  if (!groups.length) {
    root.replaceChildren(toolbar, el("div", { className: "empty" }, "Aucun widget « monitor » trouvé dans la config."));
    return;
  }
  root.replaceChildren(toolbar, ...groups.flatMap((g) => g.widgets.map((w) => section(g, w))));
}

function openNewSection(groups) {
  const dlg = $("#new-section");
  const sel = $("#ns-file");
  sel.replaceChildren(...groups.map((g) => el("option", { value: g.file, textContent: g.file })));
  $("#ns-title").value = "";
  dlg.onclose = async () => {
    if (dlg.returnValue !== "ok") return;
    const g = groups.find((x) => x.file === sel.value);
    try {
      await api("POST", "/api/monitors", { file: g.file, hash: g.hash, title: $("#ns-title").value.trim() });
      toast("Section créée");
      loadMonitors();
    } catch (e) {
      toast(e.message, "err");
    }
  };
  dlg.returnValue = "";
  dlg.showModal();
  $("#ns-title").focus();
}

function section(group, widget) {
  const clone = (arr) => arr.map((s) => ({ ...s }));
  let sites = clone(widget.sites);
  let hash = group.hash;
  let dirty = false;

  const card = el("div", { className: "section" });
  const title = el("input", { className: "title", value: widget.title, placeholder: "Titre de la section", oninput: () => mark() });
  const count = el("span", { className: "chip" });
  const rows = el("div", { className: "rows" });
  const save = el("button", { className: "primary", textContent: "Enregistrer", disabled: true });
  const cancel = el("button", { textContent: "Annuler", hidden: true });
  const dirtyLabel = el("span", { className: "dirty" });

  const mark = () => {
    dirty = true;
    save.disabled = false;
    cancel.hidden = false;
    dirtyLabel.textContent = "Modifications non enregistrées";
  };
  const reset = () => {
    dirty = false;
    save.disabled = true;
    cancel.hidden = true;
    dirtyLabel.textContent = "";
  };

  const addSite = (focus = true) => {
    sites.push({ title: "", url: "" });
    mark();
    render();
    if (focus) rows.lastElementChild?.querySelector(".title-in")?.focus();
  };

  let dragFrom = null;
  const move = (from, to) => {
    if (from === to || from + 1 === to) return;
    const [x] = sites.splice(from, 1);
    sites.splice(to > from ? to - 1 : to, 0, x);
    mark();
    render();
  };

  function row(s, i) {
    const r = el("div", { className: "row" });
    const text = (key, cls, ph, onType) =>
      el("input", {
        className: cls, value: s[key] ?? "", placeholder: ph, spellcheck: false,
        oninput: (e) => { s[key] = e.target.value; mark(); onType?.(); },
        onkeydown: (e) => { if (e.key === "Enter" && i === sites.length - 1 && key !== "title") { e.preventDefault(); addSite(); } },
      });
    const handle = el("span", { className: "handle", textContent: "⋮⋮", title: "Glisser pour réordonner" });
    handle.onmousedown = () => (r.draggable = true);
    r.ondragstart = (e) => { dragFrom = i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); r.classList.add("dragging"); };
    r.ondragend = () => { r.draggable = false; r.classList.remove("dragging"); rows.querySelectorAll(".row").forEach((x) => x.classList.remove("drop-before", "drop-after")); };
    r.ondragover = (e) => {
      if (dragFrom === null) return;
      e.preventDefault();
      const after = e.clientY > r.getBoundingClientRect().top + r.offsetHeight / 2;
      r.classList.toggle("drop-after", after);
      r.classList.toggle("drop-before", !after);
    };
    r.ondragleave = () => r.classList.remove("drop-before", "drop-after");
    r.ondrop = (e) => {
      e.preventDefault();
      const after = r.classList.contains("drop-after");
      const from = dragFrom;
      dragFrom = null;
      if (from !== null) move(from, i + (after ? 1 : 0));
    };

    const icoSlot = el("span", {}, iconPreview(s));
    const iconIn = text("icon", "icon-in", "si:nom, sh:nom, mdi:nom, URL…", () => icoSlot.replaceChildren(iconPreview(s)));
    const titleIn = text("title", "title-in", "Titre", () => icoSlot.replaceChildren(iconPreview(s)));

    const badges = el("span", { className: "badges" });
    const refreshBadges = () => {
      const b = [];
      if (s["allow-insecure"]) b.push("insecure");
      if (s["same-tab"]) b.push("même onglet");
      const alt = [].concat(s["alt-status-codes"] ?? []).join("/");
      if (alt) b.push(alt);
      if (s["check-url"]) b.push("check-url");
      badges.replaceChildren(...b.map((x) => el("span", { className: "badge" }, x)));
    };
    refreshBadges();

    const adv = el("div", { className: "adv" },
      field("check-url", "URL testée (si différente de l'URL)", "https://…"),
      field("timeout", "Timeout", "3s"),
      field("alt-status-codes", "Codes HTTP acceptés en plus", "401, 403", (s["alt-status-codes"] ?? []).toString().replaceAll(",", ", ")),
      check("allow-insecure", "Certificat non valide accepté"),
      check("same-tab", "Ouvrir dans le même onglet"),
      check("hide-url", "Masquer l'URL"),
    );
    function field(key, label, ph, value = s[key] ?? "") {
      return el("label", {}, label, el("input", { value, placeholder: ph, oninput: (e) => { s[key] = e.target.value; mark(); refreshBadges(); } }));
    }
    function check(key, label) {
      return el("label", { className: "check" },
        el("input", { type: "checkbox", checked: !!s[key], onchange: (e) => { s[key] = e.target.checked; mark(); refreshBadges(); } }), label);
    }
    r.append(
      handle, icoSlot, titleIn, text("url", "url-in", "https://…"), iconIn,
      el("div", { className: "actions" },
        badges,
        el("button", { className: "ghost", textContent: "Options ▾", title: "Options avancées", onclick: () => r.classList.toggle("open") }),
        el("button", { className: "ghost danger", textContent: "✕", title: "Supprimer ce site", onclick: () => { sites.splice(i, 1); mark(); render(); } }),
      ),
      adv,
    );
    return r;
  }

  function render() {
    count.textContent = `${sites.length} site${sites.length > 1 ? "s" : ""}`;
    rows.replaceChildren(...sites.map(row));
  }

  save.onclick = async () => {
    save.disabled = true;
    try {
      const res = await api("PUT", "/api/monitors", { file: group.file, path: widget.path, hash, title: title.value, sites: sites.map((s) => ({ ...s })) });
      hash = res.hash;
      const fresh = res.widgets.find((x) => JSON.stringify(x.path) === JSON.stringify(widget.path));
      if (fresh) { widget = fresh; sites = clone(fresh.sites); }
      reset();
      render();
      toast(`${group.file} enregistré — Glance recharge tout seul`);
    } catch (e) {
      save.disabled = false;
      toast(e.message, "err");
    }
  };
  cancel.onclick = () => { sites = clone(widget.sites); title.value = widget.title; reset(); render(); };

  const del = el("button", {
    className: "ghost danger", textContent: "Supprimer la section", onclick: async () => {
      if (!confirm(`Supprimer la section « ${title.value || "sans titre"} » et ses ${sites.length} site(s) ?\nUne copie .bak du fichier est conservée.`)) return;
      try {
        await api("DELETE", "/api/monitors", { file: group.file, path: widget.path, hash });
        toast("Section supprimée");
        loadMonitors();
      } catch (e) { toast(e.message, "err"); }
    },
  });

  card.append(
    el("div", { className: "head" }, title, count, el("span", { className: "chip" }, group.file), el("span", { className: "spacer" }), del),
    el("div", { className: "cols" }, el("span"), el("span"), el("span", {}, "Titre"), el("span", {}, "URL"), el("span", {}, "Icône"), el("span")),
    rows,
    el("div", { className: "foot" },
      el("button", { className: "ghost add-site", textContent: "+ Ajouter un site", onclick: () => addSite() }),
      dirtyLabel, el("span", { className: "spacer" }), cancel, save),
  );
  render();
  return card;
}
