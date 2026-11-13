export const $ = (s, r = document) => r.querySelector(s);
export const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.flat().filter((k) => k != null));
  return e;
};

export async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
  return data;
}

let timer;
export function toast(msg, kind = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `show ${kind}`;
  clearTimeout(timer);
  timer = setTimeout(() => (t.className = ""), 3500);
}
