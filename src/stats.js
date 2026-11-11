// Watch stats per profile. Stremio stores overallTimeWatched (milliseconds)
// on each library item, so a profile's total is the sum over its items.
// A daily snapshot of totals lets us show "this week".

export function profileItems({ profile, acct, accountItems, snapshot, isHidden }) {
  if (profile.id === acct.active) return accountItems.filter((i) => !isHidden(i));
  return snapshot;
}

export function summarise(items) {
  const watched = items.filter((i) => (i.state?.overallTimeWatched || 0) > 0 && i.type !== "other");
  const totalMs = watched.reduce((s, i) => s + i.state.overallTimeWatched, 0);
  const top = [...watched]
    .sort((a, b) => b.state.overallTimeWatched - a.state.overallTimeWatched)
    .slice(0, 5)
    .map((i) => ({ name: i.name, type: i.type, poster: i.poster || "", hours: +(i.state.overallTimeWatched / 3.6e6).toFixed(1) }));
  const last = [...watched].sort((a, b) => (Date.parse(b.state.lastWatched) || 0) - (Date.parse(a.state.lastWatched) || 0))[0];
  return { totalMs, top, lastWatched: last ? { name: last.name, at: last.state.lastWatched } : null };
}

// history: { "YYYY-MM-DD": { profileId: totalMs } }
export function weekDelta(history, today, profileId, totalNow) {
  const days = Object.keys(history || {}).filter((d) => d < today).sort();
  if (!days.length) return null;
  const target = shiftDate(today, -7);
  const base = days.filter((d) => d <= target).pop() || days[0];
  const before = history[base]?.[profileId];
  if (before == null) return null;
  return { sinceDay: base, ms: Math.max(0, totalNow - before), fullWeek: base <= target };
}

export function shiftDate(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function sydneyNow(now = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(now)).map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: +parts.hour * 60 + +parts.minute };
}
