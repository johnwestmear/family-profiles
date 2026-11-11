// Minimal client for Stremio's account API (api.strem.io).
// These endpoints are what the official apps use for login and library sync.
// They are not officially documented, so keep all calls in this one file.

export class StremioError extends Error {}

export function stremioClient(baseUrl = "https://api.strem.io", fetchImpl = (...a) => fetch(...a)) {
  async function call(method, body) {
    const res = await fetchImpl(`${baseUrl}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new StremioError(`Stremio API ${method} returned HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) {
      const msg = data.error.message || JSON.stringify(data.error);
      throw new StremioError(`Stremio API ${method}: ${msg}`);
    }
    return data.result;
  }

  return {
    async login(email, password) {
      const result = await call("login", { type: "Login", email, password, facebook: false });
      if (!result || !result.authKey) throw new StremioError("Login failed: no authKey returned");
      return { authKey: result.authKey, email: result.user?.email || email };
    },

    async getLibrary(authKey) {
      const result = await call("datastoreGet", {
        authKey,
        collection: "libraryItem",
        ids: [],
        all: true,
      });
      return Array.isArray(result) ? result : [];
    },

    // Home rows follow the order of the account's installed addons.
    async moveAddonToTop(authKey, manifestUrl) {
      const result = await call("addonCollectionGet", { authKey, update: true });
      const addons = result?.addons || [];
      const tail = manifestUrl.replace(/^[a-z]+:\/\//i, "");
      const idx = addons.findIndex((a) => (a.transportUrl || "").replace(/^[a-z]+:\/\//i, "") === tail);
      if (idx < 0) return false;
      if (idx > 0) {
        const [mine] = addons.splice(idx, 1);
        addons.unshift(mine);
        await call("addonCollectionSet", { authKey, addons });
      }
      return true;
    },

    async putLibrary(authKey, changes, chunkSize = 200) {
      for (let i = 0; i < changes.length; i += chunkSize) {
        await call("datastorePut", {
          authKey,
          collection: "libraryItem",
          changes: changes.slice(i, i + chunkSize),
        });
      }
    },
  };
}
