import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../server/main.js";
import { localStorage } from "../server/storage.js";

async function start(opts) {
  const dir = await mkdtemp(path.join(tmpdir(), "glance-"));
  await cp(new URL("../sample", import.meta.url), dir, { recursive: true });
  const server = createServer(createApp(localStorage(dir), opts));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { "content-type": "application/json", ...headers }, body: body && JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { dir, call, close: () => {
    server.closeAllConnections();
    server.close();
  } };
}

test("liste les fichiers et les monitors", async () => {
  const s = await start();
  assert.deepEqual((await s.call("GET", "/api/files")).json, ["glance.yml", "widgets/clock.yml"]);
  const mons = (await s.call("GET", "/api/monitors")).json;
  assert.equal(mons.length, 1);
  assert.equal(mons[0].widgets[0].sites[0].title, "Jellyfin");
  assert.deepEqual(mons[0].widgets[0].sites[1]["alt-status-codes"], [401, 403]);
  s.close();
});

test("modifier un monitor garde les commentaires et crée un .bak", async () => {
  const s = await start();
  const [{ file, hash, widgets }] = (await s.call("GET", "/api/monitors")).json;
  const w = widgets[0];
  const sites = [
    { ...w.sites[1], title: "Dockhand 2" },
    { ...w.sites[0] },
    { title: "Nouveau", url: "http://x", "alt-status-codes": "200, 204" },
  ];
  const r = await s.call("PUT", "/api/monitors", { file, path: w.path, sites, hash });
  assert.equal(r.status, 200);
  const text = await readFile(path.join(s.dir, file), "utf8");
  assert.match(text, /# Services principaux/);
  assert.match(text, /# logo/);
  assert.match(text, /Dockhand 2/);
  assert.match(text, /alt-status-codes:\n\s+- 200\n\s+- 204/);
  assert.ok(text.indexOf("Dockhand 2") < text.indexOf("Jellyfin"));
  await readFile(path.join(s.dir, file + ".bak"));
  s.close();
});

test("refuse YAML cassé, conflit et chemins dangereux", async () => {
  const s = await start();
  const bad = await s.call("PUT", "/api/file", { name: "glance.yml", content: "a: [1" });
  assert.equal(bad.status, 400);
  const stale = await s.call("PUT", "/api/file", { name: "glance.yml", content: "a: 1", hash: "0000" });
  assert.equal(stale.status, 409);
  assert.equal((await s.call("GET", "/api/file?name=../etc/passwd.yml")).status, 400);
  assert.equal((await s.call("PUT", "/api/monitors", { file: "glance.yml", path: [9], sites: [] })).status, 404);
  assert.equal((await s.call("PUT", "/api/file", { name: "glance.yml", content: "a: 1" })).status, 200);
  s.close();
});

test("mot de passe optionnel", async () => {
  const s = await start({ password: "secret" });
  assert.equal((await s.call("GET", "/api/files")).status, 401);
  const ok = "Basic " + Buffer.from("x:secret").toString("base64");
  assert.equal((await s.call("GET", "/api/files", undefined, { authorization: ok })).status, 200);
  s.close();
});
