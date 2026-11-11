import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { planSwap } from "../src/swap.js";

// ---- fakes ----
function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); if (v == null) return null; return type === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
}

// In-memory Stremio account API. Mirrors the sync rule: newer _mtime wins.
function fakeStremio() {
  const lib = new Map();
  const calls = [];
  const addons = [{ transportUrl: "https://v3-cinemeta.strem.io/manifest.json" }, { transportUrl: "https://torrentio.example/manifest.json" }];
  const fetchImpl = async (url, init) => {
    const method = url.split("/api/")[1];
    const body = JSON.parse(init.body);
    calls.push(method);
    const ok = (result) => new Response(JSON.stringify({ result }), { status: 200 });
    if (method === "login") {
      if (body.password !== "pw") return new Response(JSON.stringify({ error: { message: "Wrong password" } }));
      return ok({ authKey: "AK", user: { email: body.email } });
    }
    if (body.authKey !== "AK") return new Response(JSON.stringify({ error: { message: "Session expired" } }));
    if (method === "addonCollectionGet") return ok({ addons: addons.map((a) => ({ ...a })) });
    if (method === "addonCollectionSet") { addons.splice(0, addons.length, ...body.addons); return ok({ success: true }); }
    if (method === "datastoreGet") return ok([...lib.values()].map((x) => structuredClone(x)));
    if (method === "datastorePut") {
      for (const c of body.changes) {
        const cur = lib.get(c._id);
        if (!cur || Date.parse(c._mtime) >= Date.parse(cur._mtime)) lib.set(c._id, structuredClone(c));
      }
      return ok({ success: true });
    }
    return new Response("nope", { status: 404 });
  };
  return { lib, calls, fetchImpl, addons };
}

function item(id, name, mtime, state = {}) {
  return {
    _id: id, name, type: "series", poster: "", removed: false, temp: false,
    _ctime: mtime, _mtime: mtime,
    state: { lastWatched: mtime, timeWatched: 100, timeOffset: 500, overallTimeWatched: 100, timesWatched: 0, flaggedWatched: 0, duration: 2000, video_id: `${id}:1:1`, watched: null, ...state },
  };
}
// What Stremio would show in Continue Watching
const continueWatching = (lib) =>
  [...lib.values()].filter((i) => (!i.removed || i.temp) && i.state.timeOffset > 0).map((i) => i._id).sort();
const inLibrary = (lib) => [...lib.values()].filter((i) => !i.removed && !i.temp).map((i) => i._id).sort();

async function call(env, path, init) {
  const res = await worker.fetch(new Request(`https://fp.example.workers.dev${path}`, init), env);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const post = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("full family flow", async () => {
  const api = fakeStremio();
  const env = { PROFILES: fakeKV(), STREMIO_API: "https://api.fake", __fetch: api.fetchImpl, ALLOWED_EMAIL: "sam@example.com" };

  // Sam's existing library before the addon exists
  api.lib.set("tt-sopranos", item("tt-sopranos", "The Sopranos", "2026-11-01T10:00:00.000Z"));
  api.lib.set("tt-severance", item("tt-severance", "Severance", "2026-11-02T10:00:00.000Z"));

  // Private: other emails rejected, wrong password rejected
  assert.equal((await call(env, "/api/setup", post({ email: "x@y.com", password: "pw" }))).status, 403);
  assert.equal((await call(env, "/api/setup", post({ email: "sam@example.com", password: "bad" }))).status, 502);

  const setup = await call(env, "/api/setup", post({ email: "Sam@example.com", password: "pw" }));
  assert.equal(setup.status, 200);
  const t = setup.body.token;

  // Pages + manifest
  assert.match((await call(env, `/${t}/configure`)).body, /Family Profiles/);
  assert.match((await call(env, "/")).body, /Sign in/);
  const man = (await call(env, `/${t}/manifest.json`)).body;
  assert.equal(man.catalogs[0].name, "Switch Profile");
  assert.equal((await call(env, `/deadbeef/manifest.json`)).status, 404);

  // Add profiles
  const acct0 = JSON.parse(env.PROFILES.m.get(`acct:${t}`));
  const me = acct0.profiles[0];
  const saved = await call(env, `/${t}/api/profiles`, post({ profiles: [{ ...me, name: "Sam" }, { name: "Kids", colour: "2fb36b", emoji: "🦖" }, { name: "Bad", emoji: "💩", colour: "zzz" }, { name: "Wife" }] }));
  assert.equal(saved.status, 200);
  const [sam, kids, junk, wife] = saved.body.profiles;
  assert.equal(junk.emoji, "", "emoji outside the list is dropped");
  assert.equal(junk.colour.length, 6);
  await call(env, `/${t}/api/profiles`, post({ profiles: [sam, kids, wife] }));
  assert.equal(sam.id, me.id);

  const cat = (await call(env, `/${t}/catalog/other/profiles.json`)).body;
  assert.deepEqual(cat.metas.map((m) => m.name), ["✓ Sam", "Kids", "Wife"]);
  assert.equal(cat.metas[1].poster, "https://fp.example.workers.dev/posters/1f996-2fb36b.png");
  assert.match(cat.metas[0].poster, /ui-avatars/);

  // Move to top: fails before install, works after
  assert.equal((await call(env, `/${t}/api/move-to-top`, post({}))).status, 404);
  api.addons.push({ transportUrl: `https://fp.example.workers.dev/${t}/manifest.json` });
  assert.equal((await call(env, `/${t}/api/move-to-top`, post({}))).status, 200);
  assert.equal(api.addons[0].transportUrl, `https://fp.example.workers.dev/${t}/manifest.json`);
  assert.equal(api.addons.length, 3);

  // Switch to Kids: Sam's stuff disappears
  const sw1 = await call(env, `/${t}/meta/other/profile:${kids.id}.json`);
  assert.equal(sw1.status, 200);
  assert.match(sw1.body.meta.description, /Switched to Kids/);
  assert.deepEqual(continueWatching(api.lib), []);
  assert.deepEqual(inLibrary(api.lib), []);
  assert.ok(env.PROFILES.m.has(`backup:${t}:initial`));

  // Tapping Kids again does nothing
  const callsBefore = api.calls.length;
  assert.match((await call(env, `/${t}/meta/other/profile:${kids.id}.json`)).body.meta.description, /already/);
  assert.equal(api.calls.length, callsBefore);

  // Kids watch Bluey (the app writes a fresh item with a newer mtime)
  api.lib.set("tt-bluey", item("tt-bluey", "Bluey", "2026-12-01T08:00:00.000Z"));
  // ...and also open The Sopranos briefly (the app updates the hidden item)
  const sop = structuredClone(api.lib.get("tt-sopranos"));
  sop.removed = false; sop.temp = true; sop._mtime = "2026-12-01T09:00:00.000Z"; sop.state.timeOffset = 60;
  api.lib.set("tt-sopranos", sop);

  // Switch to Wife: empty slate
  await call(env, `/${t}/meta/other/profile:${wife.id}.json`);
  assert.deepEqual(continueWatching(api.lib), []);

  // Back to Sam: Sam's original progress is back, kids' Bluey is gone
  await call(env, `/${t}/meta/other/profile:${sam.id}.json`);
  assert.deepEqual(continueWatching(api.lib), ["tt-severance", "tt-sopranos"]);
  assert.deepEqual(inLibrary(api.lib), ["tt-severance", "tt-sopranos"]);
  assert.equal(api.lib.get("tt-sopranos").state.timeOffset, 500, "Sam's own Sopranos progress, not the kids'");

  // Back to Kids: Bluey and their Sopranos peek are back
  await call(env, `/${t}/meta/other/profile:${kids.id}.json`);
  assert.deepEqual(continueWatching(api.lib), ["tt-bluey", "tt-sopranos"]);
  assert.equal(api.lib.get("tt-sopranos").state.timeOffset, 60);

  // Can't delete the active profile
  const bad = await call(env, `/${t}/api/profiles`, post({ profiles: [sam, wife] }));
  assert.equal(bad.status, 400);

  // Deleting a non-active profile drops its snapshot
  const ok = await call(env, `/${t}/api/profiles`, post({ profiles: [sam, kids] }));
  assert.equal(ok.status, 200);
  assert.ok(!env.PROFILES.m.has(`snap:${t}:${wife.id}`));

  // Backups download
  const b = await call(env, `/${t}/backup/initial.json`);
  assert.equal(b.body.items.length, 2);
});

test("unchanged hidden items are not rewritten", () => {
  const hidden = { ...item("a", "A", "2026-01-01T00:00:00.000Z"), removed: true };
  hidden.state = { timeOffset: 0, lastWatched: null, timesWatched: 0, flaggedWatched: 0, video_id: null, watched: null };
  const plan = planSwap({ accountItems: [hidden], lastSwapAt: "2026-02-01T00:00:00.000Z", now: Date.parse("2026-03-01T00:00:00.000Z") });
  assert.equal(plan.changes.length, 0);
  assert.equal(plan.fromSnapshot.length, 0);
});
