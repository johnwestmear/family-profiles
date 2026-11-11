// "Picked for You": TMDB recommendations seeded from the active profile's
// recently watched titles. Results are returned with IMDb ids so Stremio's
// normal detail pages and stream addons work when you tap them.

const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w342";
const SEEDS = 4;
const PER_TYPE = 12; // keeps us well under Cloudflare's 50 subrequests per call

function tmdbFetcher(key, fetchImpl) {
  // Accepts either a v3 API key (32 hex chars) or a v4 read access token.
  const isV3 = /^[a-f0-9]{32}$/i.test(key);
  return async (path, params = {}) => {
    const qs = new URLSearchParams(params);
    if (isV3) qs.set("api_key", key);
    const res = await fetchImpl(`${TMDB}${path}?${qs}`, {
      headers: isV3 ? { accept: "application/json" } : { accept: "application/json", authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`TMDB ${path} returned HTTP ${res.status}`);
    return res.json();
  };
}

export async function checkTmdbKey(key, fetchImpl) {
  const get = tmdbFetcher(key, fetchImpl);
  await get("/configuration");
}

export function pickSeeds(items) {
  return items
    .filter((i) => /^tt\d+$/.test(i._id) && (i.type === "movie" || i.type === "series"))
    .filter((i) => (i.state?.overallTimeWatched || 0) > 0 || !i.removed)
    .sort((a, b) => {
      const ta = Date.parse(a.state?.lastWatched || a._mtime) || 0;
      const tb = Date.parse(b.state?.lastWatched || b._mtime) || 0;
      return tb - ta;
    })
    .slice(0, SEEDS);
}

export async function buildRecs({ key, seeds, exclude, fetchImpl }) {
  const get = tmdbFetcher(key, fetchImpl);
  const seen = new Set(exclude);
  const pools = { movie: new Map(), series: new Map() };

  for (const seed of seeds) {
    try {
      const found = await get(`/find/${seed._id}`, { external_source: "imdb_id" });
      const isMovie = seed.type === "movie";
      const hit = isMovie ? found.movie_results?.[0] : found.tv_results?.[0];
      if (!hit) continue;
      const recs = await get(`/${isMovie ? "movie" : "tv"}/${hit.id}/recommendations`);
      const pool = pools[isMovie ? "movie" : "series"];
      for (const [rank, r] of (recs.results || []).entries()) {
        if (!r.poster_path) continue;
        const prev = pool.get(r.id);
        // Titles recommended by several seeds float to the top.
        const score = (prev?.score || 0) + (20 - rank) + (r.vote_average || 0);
        pool.set(r.id, { ...r, score });
      }
    } catch {
      // One bad seed shouldn't sink the whole row.
    }
  }

  const out = { movie: [], series: [] };
  for (const type of ["movie", "series"]) {
    const ranked = [...pools[type].values()].sort((a, b) => b.score - a.score);
    for (const r of ranked) {
      if (out[type].length >= PER_TYPE) break;
      try {
        const ext = await get(`/${type === "movie" ? "movie" : "tv"}/${r.id}/external_ids`);
        const imdb = ext.imdb_id;
        if (!imdb || seen.has(imdb)) continue;
        seen.add(imdb);
        const date = r.release_date || r.first_air_date || "";
        out[type].push({
          id: imdb,
          type,
          name: r.title || r.name,
          poster: IMG + r.poster_path,
          releaseInfo: date.slice(0, 4),
          description: r.overview || "",
        });
      } catch {
        // skip this one
      }
    }
  }
  return out;
}
