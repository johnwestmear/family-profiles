import { stremioClient, StremioError } from "./stremio.js";
import { planSwap } from "./swap.js";
import { setupPage, configurePage } from "./pages.js";
import { EMOJI, COLOURS, emojiCode } from "./emoji.js";

const VERSION = "1.0.0";
const MAX_PROFILES = 12;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}
const noStore = { "cache-control": "no-store, max-age=0" };
function html(body) {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", ...noStore } });
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newProfileId() {
  return newToken().slice(0, 8);
}

// ---------- storage helpers (Cloudflare KV) ----------
const acctKey = (t) => `acct:${t}`;
const snapKey = (t, p) => `snap:${t}:${p}`;
const backupKey = (t, which) => `backup:${t}:${which}`;

async function getAccount(env, token) {
  if (!/^[a-f0-9]{36}$/.test(token)) return null;
  return env.PROFILES.get(acctKey(token), "json");
}
const putAccount = (env, token, acct) => env.PROFILES.put(acctKey(token), JSON.stringify(acct));
async function getSnap(env, token, pid) {
  return (await env.PROFILES.get(snapKey(token, pid), "json")) || [];
}

// ---------- addon pieces ----------
function posterFor(profile, origin) {
  if (profile.image) return profile.image;
  if (profile.emoji && EMOJI.includes(profile.emoji)) return `${origin}/posters/${emojiCode(profile.emoji)}-${profile.colour}.png`;
  const name = encodeURIComponent(profile.name);
  return `https://ui-avatars.com/api/?name=${name}&background=${profile.colour}&color=ffffff&size=512&bold=true&format=png`;
}

function manifest(origin, token) {
  return {
    id: "community.family.profileswitcher",
    version: VERSION,
    name: "Family Profiles",
    description: "Separate Library and Continue Watching for each person on one Stremio account.",
    logo: `https://ui-avatars.com/api/?name=FP&background=e50914&color=ffffff&size=256&bold=true&format=png`,
    resources: ["catalog", { name: "meta", types: ["other"], idPrefixes: ["profile:"] }],
    types: ["other"],
    idPrefixes: ["profile:"],
    catalogs: [{ type: "other", id: "profiles", name: "Switch Profile" }],
    behaviorHints: { configurable: true, configurationRequired: false },
  };
}

function profileMeta(p, acct, origin) {
  const active = p.id === acct.active;
  return {
    id: `profile:${p.id}`,
    type: "other",
    name: active ? `✓ ${p.name}` : p.name,
    poster: posterFor(p, origin),
    posterShape: "square",
    description: active ? `${p.name} is the current profile.` : `Tap to switch to ${p.name}.`,
  };
}

async function doSwap(env, token, acct, toId) {
  const client = stremioClient(env.STREMIO_API, env.__fetch);
  const now = Date.now();

  // Ignore double taps while a swap is running.
  if (acct.swappingSince && now - acct.swappingSince < 30_000) return { busy: true };
  acct.swappingSince = now;
  await putAccount(env, token, acct);

  try {
    const accountItems = await client.getLibrary(acct.authKey);
    await env.PROFILES.put(backupKey(token, "latest"), JSON.stringify({ at: new Date(now).toISOString(), items: accountItems }));
    if (!(await env.PROFILES.get(backupKey(token, "initial")))) {
      await env.PROFILES.put(backupKey(token, "initial"), JSON.stringify({ at: new Date(now).toISOString(), items: accountItems }));
    }

    const fromId = acct.active;
    const plan = planSwap({
      accountItems,
      fromSnapshot: await getSnap(env, token, fromId),
      toSnapshot: await getSnap(env, token, toId),
      lastSwapAt: acct.lastSwapAt,
      now,
    });

    // Save the outgoing profile first, so nothing is lost if the write fails.
    await env.PROFILES.put(snapKey(token, fromId), JSON.stringify(plan.fromSnapshot));
    await client.putLibrary(acct.authKey, plan.changes);

    acct.active = toId;
    acct.lastSwapAt = plan.swapAt;
    return { busy: false, changed: plan.changes.length };
  } finally {
    delete acct.swappingSince;
    await putAccount(env, token, acct);
  }
}

// ---------- router ----------
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const origin = url.origin;
    const parts = url.pathname.split("/").filter(Boolean);

    try {
      // Setup
      if (parts.length === 0) return html(setupPage());
      if (parts[0] === "api" && parts[1] === "setup" && request.method === "POST") {
        const { email, password } = await request.json();
        if (env.ALLOWED_EMAIL && email.trim().toLowerCase() !== env.ALLOWED_EMAIL.trim().toLowerCase()) {
          return json({ error: "This addon is private." }, 403);
        }
        const client = stremioClient(env.STREMIO_API, env.__fetch);
        const { authKey, email: realEmail } = await client.login(email.trim(), password);
        const token = newToken();
        const first = { id: newProfileId(), name: "Me", colour: COLOURS[0], emoji: "", image: "" };
        await putAccount(env, token, {
          email: realEmail,
          authKey,
          profiles: [first],
          active: first.id,
          lastSwapAt: null,
          createdAt: new Date().toISOString(),
        });
        return json({ token });
      }

      const token = parts[0];
      const acct = await getAccount(env, token);
      if (!acct) return json({ error: "Unknown install link" }, 404);
      const rest = parts.slice(1);

      if (rest[0] === "manifest.json") return json(manifest(origin, token), 200, noStore);

      if (rest[0] === "configure") return html(configurePage({ origin, token, acct, max: MAX_PROFILES, colours: COLOURS, emoji: EMOJI }));

      if (rest[0] === "catalog" && rest[1] === "other" && rest[2]?.startsWith("profiles")) {
        return json({ metas: acct.profiles.map((p) => profileMeta(p, acct, origin)), cacheMaxAge: 0, staleRevalidate: 0, staleError: 0 }, 200, noStore);
      }

      if (rest[0] === "meta" && rest[1] === "other" && rest[2]) {
        const id = decodeURIComponent(rest[2].replace(/\.json$/, ""));
        const pid = id.replace(/^profile:/, "");
        const target = acct.profiles.find((p) => p.id === pid);
        if (!target) return json({ meta: null }, 404);

        let message;
        if (target.id === acct.active) {
          message = `You're already watching as ${target.name}.`;
        } else {
          const result = await doSwap(env, token, acct, target.id);
          message = result.busy
            ? "A switch is already running. Give it a few seconds and go back."
            : `Switched to ${target.name}. Go back to Home to see their Continue Watching. If it hasn't changed yet, restart Stremio.`;
        }
        const meta = { ...profileMeta(target, acct, origin), description: message, background: posterFor(target, origin) };
        return json({ meta, cacheMaxAge: 0, staleRevalidate: 0, staleError: 0 }, 200, noStore);
      }

      if (rest[0] === "api" && rest[1] === "profiles" && request.method === "POST") {
        const body = await request.json();
        const incoming = Array.isArray(body.profiles) ? body.profiles.slice(0, MAX_PROFILES) : [];
        const clean = incoming
          .map((p, i) => ({
            id: /^[a-f0-9]{8}$/.test(p.id || "") ? p.id : newProfileId(),
            name: String(p.name || "").trim().slice(0, 24),
            colour: COLOURS.includes(String(p.colour || "").toLowerCase()) ? p.colour.toLowerCase() : COLOURS[i % COLOURS.length],
            emoji: EMOJI.includes(p.emoji) ? p.emoji : "",
            image: /^https:\/\//.test(p.image || "") ? p.image : "",
          }))
          .filter((p) => p.name);
        if (!clean.length) return json({ error: "You need at least one profile." }, 400);
        if (!clean.some((p) => p.id === acct.active)) {
          return json({ error: "You can't delete the profile that's currently active. Switch to another one first." }, 400);
        }
        const removed = acct.profiles.filter((p) => !clean.some((c) => c.id === p.id));
        for (const p of removed) await env.PROFILES.delete(snapKey(token, p.id));
        acct.profiles = clean;
        await putAccount(env, token, acct);
        return json({ ok: true, profiles: clean });
      }

      if (rest[0] === "api" && rest[1] === "move-to-top" && request.method === "POST") {
        const client = stremioClient(env.STREMIO_API, env.__fetch);
        const mine = `${origin}/${token}/manifest.json`;
        const moved = await client.moveAddonToTop(acct.authKey, mine);
        if (!moved) return json({ error: "Couldn't find Family Profiles in your installed addons. Install it first." }, 404);
        return json({ ok: true });
      }

      if (rest[0] === "api" && rest[1] === "relogin" && request.method === "POST") {
        const { password } = await request.json();
        const client = stremioClient(env.STREMIO_API, env.__fetch);
        const { authKey } = await client.login(acct.email, password);
        acct.authKey = authKey;
        await putAccount(env, token, acct);
        return json({ ok: true });
      }

      if (rest[0] === "backup" && (rest[1] === "latest.json" || rest[1] === "initial.json")) {
        const data = await env.PROFILES.get(backupKey(token, rest[1].replace(".json", "")));
        if (!data) return json({ error: "No backup yet. One is taken on the first switch." }, 404);
        return new Response(data, {
          headers: { "content-type": "application/json", "content-disposition": `attachment; filename="stremio-library-${rest[1]}"` },
        });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      const status = err instanceof StremioError ? 502 : 500;
      return json({ error: err.message || String(err) }, status);
    }
  },
};
