const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const style = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; background: #141414; color: #eee; }
  main { max-width: 640px; margin: 0 auto; padding: 40px 20px 80px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 32px 0 12px; }
  p.lead { color: #aaa; margin: 0 0 28px; }
  label { display: block; font-size: 14px; color: #bbb; margin: 14px 0 6px; }
  input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #1f1f1f; color: #eee; font-size: 16px; }
  button, .btn { display: inline-block; padding: 12px 18px; border-radius: 8px; border: 0; background: #e50914; color: #fff; font-weight: 600; font-size: 15px; cursor: pointer; text-decoration: none; }
  button.ghost, .btn.ghost { background: #2a2a2a; color: #ddd; }
  button:disabled { opacity: .6; cursor: default; }
  .msg { margin-top: 14px; min-height: 22px; color: #f5a623; }
  .msg.ok { color: #2fb36b; }
  .grid { display: grid; gap: 12px; }
  .profile { display: grid; grid-template-columns: 56px 1fr auto; gap: 12px; align-items: center; background: #1f1f1f; padding: 12px; border-radius: 10px; }
  .avatar { width: 56px; height: 56px; border-radius: 8px; display: grid; place-items: center; font-weight: 700; font-size: 22px; color: #fff; background-size: cover; background-position: center; }
  .profile input { padding: 8px 10px; font-size: 15px; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
  .swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
  .swatch.on { border-color: #fff; }
  .tag { font-size: 12px; background: #2fb36b; color: #000; padding: 2px 8px; border-radius: 99px; font-weight: 700; }
  .x { background: none; color: #888; font-size: 22px; padding: 4px 10px; }
  code { background: #1f1f1f; padding: 10px 12px; border-radius: 8px; display: block; word-break: break-all; font-size: 13px; color: #ccc; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
  .note { color: #888; font-size: 14px; }
  .who { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 12px; }
  .who button { background: #1f1f1f; padding: 10px; border-radius: 10px; display: grid; justify-items: center; gap: 6px; border: 2px solid transparent; color: #eee; font-weight: 600; }
  .who button.on { border-color: #2fb36b; }
  .who .avatar { width: 64px; height: 64px; }
  .who small { color: #2fb36b; font-size: 11px; font-weight: 700; min-height: 14px; }
  .stat { background: #1f1f1f; border-radius: 10px; padding: 14px; }
  .stat h3 { margin: 0 0 6px; font-size: 16px; display: flex; gap: 10px; align-items: center; }
  .stat .big { font-size: 22px; font-weight: 700; }
  .stat ol { margin: 8px 0 0; padding-left: 20px; color: #ccc; font-size: 14px; }
  select, input[type=time] { width: auto; padding: 10px; border-radius: 8px; border: 1px solid #333; background: #1f1f1f; color: #eee; font-size: 15px; }
  .check { display: flex; gap: 10px; align-items: center; color: #ddd; margin: 10px 0; }
  .check input { width: 20px; height: 20px; }
  .pick { background: #2a2a2a; color: #ddd; font-weight: 500; padding: 6px 10px; font-size: 13px; }
  .emojis { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); gap: 4px; background: #181818; border-radius: 8px; padding: 8px; }
  .emojis button { background: none; font-size: 24px; padding: 4px 0; border-radius: 6px; border: 2px solid transparent; }
  .emojis button:hover { background: #2a2a2a; }
  .emojis button.on { border-color: #fff; }
  .emojis .none { font-size: 12px; color: #aaa; }
`;

export function setupPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Family Profiles setup</title><style>${style}</style></head><body><main>
<h1>Family Profiles</h1>
<p class="lead">Sign in with the Stremio account the family shares. Your password is only used once to get a session key and is never stored.</p>
<form id="f">
  <label for="email">Stremio email</label><input id="email" type="email" autocomplete="username" required>
  <label for="pw">Stremio password</label><input id="pw" type="password" autocomplete="current-password" required>
  <div class="actions"><button id="go">Sign in</button></div>
  <div class="msg" id="msg"></div>
</form>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const go = document.getElementById('go'), msg = document.getElementById('msg');
  go.disabled = true; msg.className = 'msg'; msg.textContent = 'Signing in...';
  try {
    const r = await fetch('/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('pw').value }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Sign in failed');
    location.href = '/' + d.token + '/configure';
  } catch (err) { msg.textContent = err.message; go.disabled = false; }
});
</script></main></body></html>`;
}

export function configurePage({ origin, token, acct, max, colours, emoji }) {
  const httpsUrl = `${origin}/${token}/manifest.json`;
  const stremioUrl = httpsUrl.replace(/^https?:\/\//, "stremio://");
  const data = JSON.stringify({ profiles: acct.profiles, active: acct.active, max, colours, emoji, hasTmdb: !!acct.tmdbKey, auto: acct.auto || null }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Family Profiles</title><style>${style}</style></head><body><main>
<h1>Family Profiles</h1>
<p class="lead">Signed in as ${esc(acct.email)}. Add a profile for each person, then install the addon.</p>

<h2>Who's watching?</h2>
<div class="who" id="who"></div>
<div class="msg" id="msgw"></div>
<p class="note">Switches the whole account, so the TV follows. Refresh or reopen Stremio to see it.</p>

<h2>Profiles</h2>
<div class="grid" id="list"></div>
<div class="actions">
  <button class="ghost" id="add">+ Add profile</button>
  <button id="save">Save profiles</button>
</div>
<div class="msg" id="msg"></div>
<p class="note">Pick an emoji and a colour for each person. You can also paste an https link to your own square picture, which takes priority.</p>

<h2>Install</h2>
<div class="actions">
  <a class="btn" href="${esc(stremioUrl)}">Install in Stremio</a>
  <button class="ghost" id="copy">Copy link</button>
</div>
<p class="note">On a TV, use Copy link, then in Stremio go to Addons and paste it into the search box.</p>
<code>${esc(httpsUrl)}</code>
<p class="note">Keep this link private. Anyone who has it can switch profiles on your account.</p>

<h2>Put Switch Profile at the top of Home</h2>
<p class="note">Stremio orders Home rows by addon order. This moves Family Profiles to first place, under Continue Watching, and loads any new rows. Restart Stremio afterwards to see it.</p>
<div class="actions"><button class="ghost" id="top">Move to top and refresh</button></div>
<div class="msg" id="msg3"></div>

<h2>Watch stats</h2>
<div class="grid" id="stats"><p class="note">Loading...</p></div>

<h2>Picked for You</h2>
<p class="note">Adds movie and show rows to Home, based on what the current person has been watching. Needs a free TMDB key: sign up at themoviedb.org, then go to <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener" style="color:#ccc">Settings &gt; API</a> and copy the API Key.</p>
<label for="tmdb">TMDB key</label><input id="tmdb" placeholder="${acct.tmdbKey ? "Key saved. Paste a new one to replace it" : "Paste your TMDB API key"}">
<div class="actions"><button class="ghost" id="tmdbsave">Save key</button>${acct.tmdbKey ? '<button class="ghost" id="tmdbclear">Turn off</button>' : ""}</div>
<div class="msg" id="msg4"></div>

<h2>Auto switch-back</h2>
<p class="note">Every day at this time, switch back to one profile. Handy so tomorrow doesn't start on the kids' shows.</p>
<label class="check"><input type="checkbox" id="autoon"> Turn on</label>
<div class="row"><select id="autoprof"></select> at <input type="time" id="autotime"></div>
<div class="actions"><button class="ghost" id="autosave">Save</button></div>
<div class="msg" id="msg5"></div>

<h2>Safety net</h2>
<p class="note">A copy of the whole library is saved before every switch.</p>
<div class="actions">
  <a class="btn ghost" href="/${token}/backup/initial.json">Download first backup</a>
  <a class="btn ghost" href="/${token}/backup/latest.json">Download latest backup</a>
</div>

<h2>Profiles stopped switching?</h2>
<p class="note">If you changed your Stremio password or logged out everywhere, sign in again here.</p>
<label for="pw">Stremio password</label><input id="pw" type="password" autocomplete="current-password">
<div class="actions"><button class="ghost" id="relogin">Reconnect</button></div>
<div class="msg" id="msg2"></div>

<script>
const S = ${data};
const list = document.getElementById('list');
function initial(n) { return (n || '?').trim().charAt(0).toUpperCase() || '?'; }
function code(e) { return [...e].map(c => c.codePointAt(0).toString(16)).filter(h => h !== 'fe0f').join('-'); }
let openIdx = -1;
function paint(av, p) {
  av.style.background = ''; av.style.backgroundImage = ''; av.textContent = '';
  if (p.image) { av.style.backgroundImage = 'url(' + JSON.stringify(p.image) + ')'; }
  else if (p.emoji) { av.style.backgroundImage = "url('/posters/" + code(p.emoji) + "-" + p.colour + ".png')"; }
  else { av.style.background = '#' + p.colour; av.textContent = initial(p.name); }
}
function render() {
  list.innerHTML = '';
  S.profiles.forEach((p, i) => {
    const el = document.createElement('div'); el.className = 'profile';
    const av = document.createElement('div'); av.className = 'avatar';
    paint(av, p);
    const mid = document.createElement('div');
    const name = document.createElement('input'); name.value = p.name; name.placeholder = 'Name'; name.maxLength = 24;
    name.oninput = () => { p.name = name.value; paint(av, p); };
    const img = document.createElement('input'); img.value = p.image || ''; img.placeholder = 'Image link (optional)'; img.style.marginTop = '6px';
    img.onchange = () => { p.image = img.value.trim(); render(); };
    const row = document.createElement('div'); row.className = 'row';
    S.colours.forEach(c => {
      const sw = document.createElement('div'); sw.className = 'swatch' + (c === p.colour ? ' on' : ''); sw.style.background = '#' + c;
      sw.onclick = () => { p.colour = c; render(); }; row.appendChild(sw);
    });
    const pick = document.createElement('button'); pick.className = 'pick'; pick.textContent = p.emoji ? p.emoji + ' Change' : 'Pick emoji';
    pick.onclick = () => { openIdx = openIdx === i ? -1 : i; render(); };
    row.appendChild(pick);
    if (p.id === S.active) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'ACTIVE'; row.appendChild(t); }
    mid.append(name, img, row);
    const del = document.createElement('button'); del.className = 'x'; del.textContent = '×'; del.title = 'Remove';
    del.onclick = () => {
      if (p.id === S.active) { alert("That's the active profile. Switch to someone else in Stremio first."); return; }
      if (p.id && !confirm('Remove ' + (p.name || 'this profile') + '? Their saved library goes too.')) return;
      S.profiles.splice(i, 1); render();
    };
    el.append(av, mid, del);
    if (openIdx === i) {
      const g = document.createElement('div'); g.className = 'emojis';
      const none = document.createElement('button'); none.className = 'none' + (p.emoji ? '' : ' on'); none.textContent = 'Letter';
      none.onclick = () => { p.emoji = ''; openIdx = -1; render(); }; g.appendChild(none);
      S.emoji.forEach(e => {
        const b = document.createElement('button'); b.textContent = e; if (e === p.emoji) b.className = 'on';
        b.onclick = () => { p.emoji = e; openIdx = -1; render(); }; g.appendChild(b);
      });
      el.appendChild(g);
    }
    list.appendChild(el);
  });
  document.getElementById('add').disabled = S.profiles.length >= S.max;
}
document.getElementById('add').onclick = () => {
  S.profiles.push({ id: '', name: '', colour: S.colours[S.profiles.length % S.colours.length], emoji: '', image: '' }); render();
  const inputs = list.querySelectorAll('.profile input'); inputs[inputs.length - 2].focus();
};
async function post(path, body) {
  const r = await fetch('/${token}/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d;
}
document.getElementById('save').onclick = async () => {
  const msg = document.getElementById('msg'); msg.className = 'msg'; msg.textContent = 'Saving...';
  try { const d = await post('profiles', { profiles: S.profiles }); S.profiles = d.profiles; render(); renderWho(); renderAuto(); msg.className = 'msg ok'; msg.textContent = 'Saved. Stremio picks up changes next time you open Home.'; }
  catch (e) { msg.textContent = e.message; }
};
document.getElementById('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(${JSON.stringify(httpsUrl)}); document.getElementById('copy').textContent = 'Copied'; } catch {}
};
document.getElementById('top').onclick = async () => {
  const msg = document.getElementById('msg3'); msg.className = 'msg'; msg.textContent = 'Moving...';
  try { await post('move-to-top', {}); msg.className = 'msg ok'; msg.textContent = 'Done. Restart Stremio to see Switch Profile first.'; }
  catch (e) { msg.textContent = e.message; }
};
document.getElementById('relogin').onclick = async () => {
  const msg = document.getElementById('msg2'); msg.className = 'msg'; msg.textContent = 'Reconnecting...';
  try { await post('relogin', { password: document.getElementById('pw').value }); msg.className = 'msg ok'; msg.textContent = 'Reconnected.'; }
  catch (e) { msg.textContent = e.message; }
};
function renderWho() {
  const w = document.getElementById('who'); w.innerHTML = '';
  S.profiles.filter(p => p.id).forEach(p => {
    const b = document.createElement('button'); if (p.id === S.active) b.className = 'on';
    const av = document.createElement('div'); av.className = 'avatar'; paint(av, p);
    const n = document.createElement('div'); n.textContent = p.name;
    const st = document.createElement('small'); st.textContent = p.id === S.active ? 'WATCHING' : '';
    b.append(av, n, st);
    b.onclick = async () => {
      const msg = document.getElementById('msgw'); msg.className = 'msg'; msg.textContent = 'Switching to ' + p.name + '...';
      w.querySelectorAll('button').forEach(x => x.disabled = true);
      try { const d = await post('switch', { id: p.id }); S.active = d.active; msg.className = 'msg ok'; msg.textContent = d.message; render(); renderWho(); loadStats(); }
      catch (e) { msg.textContent = e.message; renderWho(); }
    };
    w.appendChild(b);
  });
}
function fmtDay(d) { return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); }
async function loadStats() {
  const box = document.getElementById('stats');
  try {
    const r = await fetch('/${token}/api/stats'); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load stats');
    box.innerHTML = '';
    d.profiles.forEach(p => {
      const prof = S.profiles.find(x => x.id === p.id) || p;
      const el = document.createElement('div'); el.className = 'stat';
      const h = document.createElement('h3'); const av = document.createElement('div'); av.className = 'avatar'; av.style.width = av.style.height = '32px'; av.style.fontSize = '14px'; paint(av, prof);
      const nm = document.createElement('span'); nm.textContent = p.name; h.append(av, nm);
      const big = document.createElement('div'); big.className = 'big';
      big.textContent = p.totalHours + ' hrs all time';
      const sub = document.createElement('div'); sub.className = 'note';
      const bits = [];
      if (p.week) bits.push(p.week.hours + ' hrs ' + (p.week.fullWeek ? 'this week' : 'since ' + fmtDay(p.week.sinceDay)));
      else bits.push('Weekly total starts tomorrow');
      if (p.lastWatched) bits.push('last watched ' + p.lastWatched.name);
      sub.textContent = bits.join(' · ');
      el.append(h, big, sub);
      if (p.top.length) {
        const ol = document.createElement('ol');
        p.top.forEach(t => { const li = document.createElement('li'); li.textContent = t.name + ' (' + t.hours + ' hrs)'; ol.appendChild(li); });
        el.appendChild(ol);
      }
      box.appendChild(el);
    });
  } catch (e) { box.innerHTML = ''; const n = document.createElement('p'); n.className = 'note'; n.textContent = e.message; box.appendChild(n); }
}
function renderAuto() {
  const sel = document.getElementById('autoprof'); sel.innerHTML = '';
  S.profiles.filter(p => p.id).forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); });
  const a = S.auto || {};
  document.getElementById('autoon').checked = !!a.enabled;
  sel.value = a.profileId || (S.profiles[0] && S.profiles[0].id) || '';
  document.getElementById('autotime').value = a.time || '21:00';
}
document.getElementById('autosave').onclick = async () => {
  const msg = document.getElementById('msg5'); msg.className = 'msg'; msg.textContent = 'Saving...';
  try {
    const d = await post('settings', { auto: { enabled: document.getElementById('autoon').checked, profileId: document.getElementById('autoprof').value, time: document.getElementById('autotime').value } });
    S.auto = d.auto; msg.className = 'msg ok';
    const who = (S.profiles.find(p => p.id === d.auto.profileId) || {}).name;
    const [hh, mm] = d.auto.time.split(':').map(Number);
    const nice = ((hh % 12) || 12) + ':' + String(mm).padStart(2, '0') + (hh < 12 ? ' am' : ' pm');
    msg.textContent = d.auto.enabled ? 'Saved. Switches to ' + who + ' every day at ' + nice + '.' : 'Saved. Auto switch-back is off.';
  } catch (e) { msg.textContent = e.message; }
};
document.getElementById('tmdbsave').onclick = async () => {
  const msg = document.getElementById('msg4'); const key = document.getElementById('tmdb').value.trim();
  if (!key) { msg.className = 'msg'; msg.textContent = 'Paste a key first.'; return; }
  msg.className = 'msg'; msg.textContent = 'Checking key with TMDB...';
  try { await post('settings', { tmdbKey: key }); msg.className = 'msg ok'; msg.textContent = 'Key works. Now press Move to top and refresh, then restart Stremio to see the new rows.'; document.getElementById('tmdb').value = ''; }
  catch (e) { msg.textContent = e.message; }
};
const clr = document.getElementById('tmdbclear');
if (clr) clr.onclick = async () => {
  const msg = document.getElementById('msg4');
  try { await post('settings', { tmdbKey: '' }); msg.className = 'msg ok'; msg.textContent = 'Turned off. Press Move to top and refresh to remove the rows.'; }
  catch (e) { msg.textContent = e.message; }
};
render(); renderWho(); renderAuto(); loadStats();
</script></main></body></html>`;
}
