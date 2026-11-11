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

export function configurePage({ origin, token, acct, max, colours }) {
  const httpsUrl = `${origin}/${token}/manifest.json`;
  const stremioUrl = httpsUrl.replace(/^https?:\/\//, "stremio://");
  const data = JSON.stringify({ profiles: acct.profiles, active: acct.active, max, colours }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Family Profiles</title><style>${style}</style></head><body><main>
<h1>Family Profiles</h1>
<p class="lead">Signed in as ${esc(acct.email)}. Add a profile for each person, then install the addon.</p>

<h2>Profiles</h2>
<div class="grid" id="list"></div>
<div class="actions">
  <button class="ghost" id="add">+ Add profile</button>
  <button id="save">Save profiles</button>
</div>
<div class="msg" id="msg"></div>
<p class="note">Image is optional: paste any https link to a square picture. Leave blank for a coloured letter tile.</p>

<h2>Install</h2>
<div class="actions">
  <a class="btn" href="${esc(stremioUrl)}">Install in Stremio</a>
  <button class="ghost" id="copy">Copy link</button>
</div>
<p class="note">On a TV, use Copy link, then in Stremio go to Addons and paste it into the search box.</p>
<code>${esc(httpsUrl)}</code>
<p class="note">Keep this link private. Anyone who has it can switch profiles on your account.</p>

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
function render() {
  list.innerHTML = '';
  S.profiles.forEach((p, i) => {
    const el = document.createElement('div'); el.className = 'profile';
    const av = document.createElement('div'); av.className = 'avatar';
    if (p.image) { av.style.backgroundImage = 'url(' + JSON.stringify(p.image) + ')'; av.textContent = ''; }
    else { av.style.background = '#' + p.colour; av.textContent = initial(p.name); }
    const mid = document.createElement('div');
    const name = document.createElement('input'); name.value = p.name; name.placeholder = 'Name'; name.maxLength = 24;
    name.oninput = () => { p.name = name.value; if (!p.image) av.textContent = initial(p.name); };
    const img = document.createElement('input'); img.value = p.image || ''; img.placeholder = 'Image link (optional)'; img.style.marginTop = '6px';
    img.onchange = () => { p.image = img.value.trim(); render(); };
    const row = document.createElement('div'); row.className = 'row';
    S.colours.forEach(c => {
      const sw = document.createElement('div'); sw.className = 'swatch' + (c === p.colour ? ' on' : ''); sw.style.background = '#' + c;
      sw.onclick = () => { p.colour = c; render(); }; row.appendChild(sw);
    });
    if (p.id === S.active) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'ACTIVE'; row.appendChild(t); }
    mid.append(name, img, row);
    const del = document.createElement('button'); del.className = 'x'; del.textContent = '×'; del.title = 'Remove';
    del.onclick = () => {
      if (p.id === S.active) { alert("That's the active profile. Switch to someone else in Stremio first."); return; }
      if (p.id && !confirm('Remove ' + (p.name || 'this profile') + '? Their saved library goes too.')) return;
      S.profiles.splice(i, 1); render();
    };
    el.append(av, mid, del); list.appendChild(el);
  });
  document.getElementById('add').disabled = S.profiles.length >= S.max;
}
document.getElementById('add').onclick = () => {
  S.profiles.push({ id: '', name: '', colour: S.colours[S.profiles.length % S.colours.length], image: '' }); render();
  const inputs = list.querySelectorAll('.profile input'); inputs[inputs.length - 2].focus();
};
async function post(path, body) {
  const r = await fetch('/${token}/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d;
}
document.getElementById('save').onclick = async () => {
  const msg = document.getElementById('msg'); msg.className = 'msg'; msg.textContent = 'Saving...';
  try { const d = await post('profiles', { profiles: S.profiles }); S.profiles = d.profiles; render(); msg.className = 'msg ok'; msg.textContent = 'Saved. Stremio picks up changes next time you open Home.'; }
  catch (e) { msg.textContent = e.message; }
};
document.getElementById('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(${JSON.stringify(httpsUrl)}); document.getElementById('copy').textContent = 'Copied'; } catch {}
};
document.getElementById('relogin').onclick = async () => {
  const msg = document.getElementById('msg2'); msg.className = 'msg'; msg.textContent = 'Reconnecting...';
  try { await post('relogin', { password: document.getElementById('pw').value }); msg.className = 'msg ok'; msg.textContent = 'Reconnected.'; }
  catch (e) { msg.textContent = e.message; }
};
render();
</script></main></body></html>`;
}
