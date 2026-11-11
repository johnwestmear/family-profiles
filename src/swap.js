// Pure logic for swapping one shared Stremio library between profiles.
//
// How ownership works:
// - Every profile has a snapshot: the library items that belong to it.
// - At each swap we stamp every item we write with _mtime = swapAt.
// - Anything the active profile touches afterwards (watching, adding to
//   library) gets a newer _mtime from the Stremio app, so on the next swap
//   "owned by the outgoing profile" = its old snapshot + anything newer
//   than the last swap.
// - Items that belong to other profiles are hidden: removed, not temp,
//   and their watch state blanked, so they drop out of Library and
//   Continue Watching. Their real state lives on in that profile's snapshot.

const BLANK_STATE = {
  lastWatched: null,
  timeWatched: 0,
  timeOffset: 0,
  overallTimeWatched: 0,
  timesWatched: 0,
  flaggedWatched: 0,
  duration: 0,
  video_id: null,
  watched: null,
};

function isHidden(item) {
  const s = item.state || {};
  return (
    item.removed === true &&
    item.temp !== true &&
    !s.timeOffset &&
    !s.lastWatched &&
    !s.timesWatched &&
    !s.flaggedWatched &&
    !s.video_id &&
    !s.watched
  );
}

export function hideItem(item, mtime) {
  return {
    ...item,
    removed: true,
    temp: false,
    _mtime: mtime,
    state: { ...(item.state || {}), ...BLANK_STATE },
  };
}

export function planSwap({ accountItems, fromSnapshot = [], toSnapshot = [], lastSwapAt = null, now = Date.now() }) {
  // Our writes must be newer than anything already there, or Stremio's
  // "newest wins" sync would ignore them (e.g. a TV with its clock ahead).
  let newest = now;
  for (const i of accountItems) {
    const m = Date.parse(i._mtime);
    if (!Number.isNaN(m) && m >= newest) newest = m + 1;
  }
  const swapAt = new Date(newest).toISOString();
  const account = new Map(accountItems.map((i) => [i._id, i]));
  const prevFrom = new Map(fromSnapshot.map((i) => [i._id, i]));
  const cutoff = lastSwapAt ? Date.parse(lastSwapAt) : -Infinity;

  // 1. Work out what the outgoing profile owns right now.
  const owned = new Set(prevFrom.keys());
  for (const item of accountItems) {
    const m = Date.parse(item._mtime);
    if (Number.isNaN(m) || m > cutoff) owned.add(item._id);
  }
  const newFromSnapshot = [];
  for (const id of owned) {
    const item = account.get(id) || prevFrom.get(id);
    if (item) newFromSnapshot.push(item);
  }

  // 2. Build the writes that make the account look like the incoming profile.
  const to = new Map(toSnapshot.map((i) => [i._id, i]));
  const changes = [];
  for (const item of accountItems) {
    if (to.has(item._id)) {
      changes.push({ ...to.get(item._id), _mtime: swapAt });
    } else if (!isHidden(item)) {
      changes.push(hideItem(item, swapAt));
    }
  }
  for (const [id, item] of to) {
    if (!account.has(id)) changes.push({ ...item, _mtime: swapAt });
  }

  return { swapAt, fromSnapshot: newFromSnapshot, changes };
}
