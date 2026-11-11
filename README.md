# Family Profiles for Stremio

Your own private profile switcher for one shared Stremio account. It adds a **Switch Profile** row to Stremio's Home. Tap a person and the account's Library and Continue Watching swap to theirs.

Runs free on Cloudflare Workers. Nobody else's server touches your account.

## How it works

- Each person has a saved copy (snapshot) of their library, kept in Cloudflare KV storage.
- Tapping a profile saves what's on the account to the current person, then writes the next person's library back. Everyone else's items are hidden, not deleted.
- Before every switch, the whole library is backed up. You can download the first backup and the latest one from the settings page.
- Your Stremio password is used once to sign in and is never stored. Only the session key is kept.

## Deploy (about 10 minutes)

You need Node.js installed (https://nodejs.org, LTS version) and a free Cloudflare account.

1. Unzip this folder, open a terminal in it and run:
   ```
   npm install
   npx wrangler login
   ```
   A browser window opens. Log in to Cloudflare and allow access.

2. Create the storage:
   ```
   npx wrangler kv namespace create PROFILES
   ```
   It prints an `id`. Open `wrangler.toml`, replace `PASTE_KV_ID_HERE` with that id, and put your Stremio email in `ALLOWED_EMAIL` so only your account can use it.

3. Deploy:
   ```
   npx wrangler deploy
   ```
   It prints a link like `https://family-profiles.<you>.workers.dev`.

4. Open that link, sign in with the family Stremio account, and you land on the settings page. Rename "Me", add everyone (up to 12), pick colours or paste an image link, then **Save profiles**.

5. Hit **Install in Stremio** (or copy the link and paste it into Stremio's Addons search box on the TV).

The first profile owns everything that's currently on the account. Rename it to whoever's stuff that is.

## First test (do this before telling the family)

1. Note a couple of shows in your Continue Watching.
2. On the desktop app, tap a different profile in the Switch Profile row. The page should say "Switched to ...".
3. Go back to Home. Continue Watching should be empty (or show that person's stuff). If it hasn't changed, restart Stremio.
4. Watch a few minutes of something as that person.
5. Switch back to yourself. Your shows should return with your progress, and their show should be gone.
6. Check the TV and phone pick up the same changes after a restart.

If step 3 or 5 doesn't work, download the latest backup from the settings page and let me know what you saw.

## Extras on the settings page

- **Who's watching?** Switch profiles from your phone. The TV follows after a refresh.
- **Watch stats.** Hours per person (all time and this week) and their top shows. The weekly number starts the day after setup.
- **Picked for You.** Paste a free TMDB API key to get movie and show rows based on what the current person watches, then press *Move to top and refresh*.
- **Auto switch-back.** Switch to one profile at a set time every day (Sydney time, checked every 10 minutes).

## Good to know

- **Take turns.** It's one account, so two people watching at once on different devices will mix their progress.
- **Switching on one device switches everywhere.** The TV and phones follow the same account.
- **Changed your Stremio password?** Use Reconnect on the settings page.
- **Keep the install link private.** It's what lets someone switch profiles on your account.
- **Big libraries:** Cloudflare's free plan has a small time limit per request. If switching ever errors on a huge library, the $5/month Workers plan removes that limit.
- This uses the same sync API the Stremio apps use, which isn't officially documented. If Stremio changes it, the addon may need an update.

## Files

- `src/index.js` addon routes, manifest, the switch
- `src/swap.js` the logic deciding what belongs to whom
- `src/stremio.js` the calls to Stremio's API
- `src/pages.js` the setup and settings pages
- `test/` run `npm test` to check the logic against a fake Stremio account
