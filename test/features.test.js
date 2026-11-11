import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { weekDelta, sydneyNow } from "../src/stats.js";

function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); if (v == null) return null; return type === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; },
  };
}

function fakeWorld() {
  const lib = new Map();
  const addons = [{ transportUrl: "https://v3-cinemeta.strem.io/manifest.json", manifest: { id: "cinemeta" } }];
  const tmdbCalls = [];
  const ok = (result) => new Response(JSON.stringify({ result }));
  const fetchImpl = async (url, init) => {
    if (url.startsWith("https://api.themoviedb.org/3")) {
      const u = new URL(url);
      tmdbCalls.push(u.pathname);
      const key = u.searchParams.get("api_key");
      if (key !== "a".repeat(32)) return new Response("{}", { status: 401 });
      const p = u.pathname.replace("/3", "");
      const j = (o) => new Response(JSON.stringify(o));
      if (p === "/configuration") return j({});
      if (p === "/find/tt7678620") return j({ tv_results: [{ id: 100 }], movie_results: [] });
      if (p === "/find/tt0000001") return j({ movie_results: [{ id: 200 }], tv_results: [] });
      if (p.startsWith("/find/")) return j({ movie_results: [], tv_results: [] });
      if (p === "/tv/100/recommendations") return j({ results: [{ id: 101, name: "Peppa Pig", poster_path: "/p.jpg", first_air_date: "2004-05-31", vote_average: 6 }, { id: 102, name: "No Poster" }] });
      if (p === "/movie/200/recommendations") return j({ results: [{ id: 201, title: "Toy Story", poster_path: "/t.jpg", release_date: "1995-11-22", vote_average: 8 }, { id: 202, title: "Already Watched", poster_path: "/a.jpg" }] });
      if (p === "/tv/101/external_ids") return j({ imdb_id: "tt0426769" });
      if (p === "/movie/201/external_ids") return j({ imdb_id: "tt0114709" });
      if (p === "/movie/202/external_ids") return j({ imdb_id: "tt0000001" });
      return new Response("{}", { status: 404 });
    }
    const method = url.split("/api/")[1];
    const body = JSON.parse(init.body);
    if (method === "login") return ok({ authKey: "AK", user: { email: body.email } });
    if (method === "datastoreGet") return ok([...lib.values()].map((x) => structuredClone(x)));
    if (method === "datastorePut") { for (const c of body.changes) lib.set(c._id, structuredClone(c)); return ok({ success: true }); }
    if (method === "addonCollectionGet") return ok({ addons: structuredClone(addons) });
    if (method === "addonCollectionSet") { addons.splice(0, addons.length, ...body.addons); return ok({ success: true }); }
    return new Response("nope", { status: 404 });
  };
  return { lib, addons, tmdbCalls, fetchImpl };
}

const H = 3.6e6;
function item(id, name, type, mtime, hours) {
  return {
    _id: id, name, type, poster: "", removed: false, temp: false, _ctime: mtime, _mtime: mtime,
    state: { lastWatched: mtime, timeWatched: 0, timeOffset: 100, overallTimeWatched: hours * H, timesWatched: 1, flaggedWatched: 0, duration: 0, video_id: null, watched: null },
  };
}
async function call(env, path, init) {
  const res = await worker.fetch(new Request(`https://fp.example.workers.dev${path}`, init), env);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}
const post = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function setup() {
  const w = fakeWorld();
  const env = { PROFILES: fakeKV(), STREMIO_API: "https://api.fake", __fetch: w.fetchImpl };
  w.lib.set("tt0000001", item("tt0000001", "Cars", "movie", "2026-11-01T10:00:00.000Z", 2));
  w.lib.set("tt-sopranos", item("tt-sopranos", "The Sopranos", "series", "2026-11-02T10:00:00.000Z", 30));
  const t = (await call(env, "/api/setup", post({ email: "s@x.com", password: "pw" }))).body.token;
  const me = JSON.parse(env.PROFILES.m.get(`acct:${t}`)).profiles[0];
  const ps = (await call(env, `/${t}/api/profiles`, post({ profiles: [{ ...me, name: "Sam" }, { name: "Kids", emoji: "🦖" }] }))).body.profiles;
  return { w, env, t, sam: ps[0], kids: ps[1] };
}

test("switch from the settings page", async () => {
  const { env, t, kids, w } = await setup();
  const r = await call(env, `/${t}/api/switch`, post({ id: kids.id }));
  assert.equal(r.status, 200);
  assert.equal(r.body.active, kids.id);
  assert.match(r.body.message, /Kids/);
  assert.ok([...w.lib.values()].every((i) => i.removed));
  assert.equal((await call(env, `/${t}/api/switch`, post({ id: "nope0000" }))).status, 404);
});

test("Picked for You", async () => {
  const { env, t, kids, w } = await setup();
  // No key: no rows in manifest, empty catalog
  let man = (await call(env, `/${t}/manifest.json`)).body;
  assert.equal(man.catalogs.length, 1);
  assert.equal((await call(env, `/${t}/api/settings`, post({ tmdbKey: "bad" }))).status, 400);
  assert.equal((await call(env, `/${t}/api/settings`, post({ tmdbKey: "a".repeat(32) }))).status, 200);
  man = (await call(env, `/${t}/manifest.json`)).body;
  assert.deepEqual(man.catalogs.map((c) => `${c.type}/${c.id}`), ["other/profiles", "movie/picked", "series/picked"]);

  // Sam watched Cars -> Toy Story; "Already Watched" maps to tt0000001 (in library) so it's excluded
  const movies = (await call(env, `/${t}/catalog/movie/picked.json`)).body.metas;
  assert.deepEqual(movies.map((m) => m.id), ["tt0114709"]);
  assert.equal(movies[0].poster, "https://image.tmdb.org/t/p/w342/t.jpg");
  // Cached: second call makes no TMDB requests
  const before = w.tmdbCalls.length;
  await call(env, `/${t}/catalog/series/picked.json`);
  assert.equal(w.tmdbCalls.length, before);

  // Kids watch Bluey -> Peppa Pig shows in their series row
  await call(env, `/${t}/api/switch`, post({ id: kids.id }));
  w.lib.set("tt7678620", item("tt7678620", "Bluey", "series", "2026-12-01T10:00:00.000Z", 5));
  const shows = (await call(env, `/${t}/catalog/series/picked.json`)).body.metas;
  assert.deepEqual(shows.map((m) => m.name), ["Peppa Pig"]);

  // Move to top refreshes the stored manifest so the new rows appear
  w.addons.push({ transportUrl: `https://fp.example.workers.dev/${t}/manifest.json`, manifest: { catalogs: [] } });
  assert.equal((await call(env, `/${t}/api/move-to-top`, post({}))).status, 200);
  assert.equal(w.addons[0].manifest.catalogs.length, 3);
});

test("watch stats and daily snapshot", async () => {
  const { env, t, sam, kids, w } = await setup();
  let s = (await call(env, `/${t}/api/stats`)).body;
  const samStats = s.profiles.find((p) => p.id === sam.id);
  assert.equal(samStats.totalHours, 32);
  assert.equal(samStats.top[0].name, "The Sopranos");
  assert.equal(samStats.week, null);

  // Cron records today's totals once
  const now = Date.now();
  await worker._runScheduled(env, now);
  const hist = JSON.parse(env.PROFILES.m.get(`stats:${t}`));
  assert.equal(hist[sydneyNow(now).day][sam.id], 32 * H);

  // Switch to kids: Sam's stats come from his snapshot, kids start at 0
  await call(env, `/${t}/api/switch`, post({ id: kids.id }));
  s = (await call(env, `/${t}/api/stats`)).body;
  assert.equal(s.profiles.find((p) => p.id === sam.id).totalHours, 32);
  assert.equal(s.profiles.find((p) => p.id === kids.id).totalHours, 0);
});

test("weekDelta", () => {
  const hist = { "2026-11-01": { a: 10 * H }, "2026-11-04": { a: 12 * H }, "2026-11-10": { a: 20 * H } };
  const d = weekDelta(hist, "2026-11-11", "a", 25 * H);
  assert.equal(d.sinceDay, "2026-11-04");
  assert.equal(d.ms, 13 * H);
  assert.equal(d.fullWeek, true);
  const young = weekDelta({ "2026-11-10": { a: 1 * H } }, "2026-11-11", "a", 3 * H);
  assert.equal(young.fullWeek, false);
  assert.equal(weekDelta({}, "2026-11-11", "a", 1), null);
});

test("auto switch-back fires once a day after the set time", async () => {
  const { env, t, sam, kids } = await setup();
  await call(env, `/${t}/api/switch`, post({ id: kids.id }));
  // Pick a time 1 minute ahead of now (Sydney)
  const now = Date.now();
  const { minutes } = sydneyNow(now);
  const ahead = (minutes + 1) % 1440;
  if (ahead === 0) return; // skip the midnight edge
  const time = `${String(Math.floor(ahead / 60)).padStart(2, "0")}:${String(ahead % 60).padStart(2, "0")}`;
  const r = await call(env, `/${t}/api/settings`, post({ auto: { enabled: true, profileId: sam.id, time } }));
  assert.equal(r.body.auto.enabled, true);

  await worker._runScheduled(env, now); // before the time: nothing
  assert.equal(JSON.parse(env.PROFILES.m.get(`acct:${t}`)).active, kids.id);

  await worker._runScheduled(env, now + 2 * 60_000); // after: switches back
  let acct = JSON.parse(env.PROFILES.m.get(`acct:${t}`));
  assert.equal(acct.active, sam.id);

  // Kids switch again the same evening; no second auto switch today
  await call(env, `/${t}/api/switch`, post({ id: kids.id }));
  await worker._runScheduled(env, now + 20 * 60_000);
  acct = JSON.parse(env.PROFILES.m.get(`acct:${t}`));
  assert.equal(acct.active, kids.id);
});

test("auto switch saved after today's time waits until tomorrow", async () => {
  const { env, t, sam, kids } = await setup();
  await call(env, `/${t}/api/switch`, post({ id: kids.id }));
  const { minutes } = sydneyNow();
  if (minutes < 2) return;
  const past = minutes - 1;
  const time = `${String(Math.floor(past / 60)).padStart(2, "0")}:${String(past % 60).padStart(2, "0")}`;
  await call(env, `/${t}/api/settings`, post({ auto: { enabled: true, profileId: sam.id, time } }));
  await worker._runScheduled(env, Date.now());
  assert.equal(JSON.parse(env.PROFILES.m.get(`acct:${t}`)).active, kids.id);
});
