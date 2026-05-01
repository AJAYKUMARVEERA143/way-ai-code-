/**
 * Way AI Code — secureStorage.js
 * Dual-mode encrypted key store:
 *   Tauri desktop → tauri-plugin-store (encrypted OS file)
 *   Browser dev   → sessionStorage with AES-GCM encryption
 */

const IS_TAURI = typeof window !== "undefined" &&
  ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

// ── Browser fallback — AES-GCM encryption (Web Crypto API) ─────────────────
const BROWSER_NS = "_wayai_sec_";
const SEED_KEY = "_wayai_ks_";

async function getOrCreateBrowserKey() {
  let raw = sessionStorage.getItem(SEED_KEY);
  if (!raw) {
    const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
    raw = btoa(String.fromCharCode(...keyMaterial));
    sessionStorage.setItem(SEED_KEY, raw);
  }
  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function browserEncrypt(plaintext) {
  const key = await getOrCreateBrowserKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${toHex(iv)}:${toHex(ciphertext)}`;
}

async function browserDecrypt(stored) {
  try {
    const [ivHex, ctHex] = String(stored || "").split(":");
    if (!ivHex || !ctHex) return null;
    const fromHex = (hex) => {
      const pairs = hex.match(/.{2}/g);
      if (!pairs) return new Uint8Array();
      return new Uint8Array(pairs.map(b => parseInt(b, 16)));
    };
    const key = await getOrCreateBrowserKey();
    const dec = new TextDecoder();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromHex(ivHex) },
      key,
      fromHex(ctHex),
    );
    return dec.decode(plain);
  } catch {
    return null;
  }
}

async function browserSet(key, value) {
  const encrypted = await browserEncrypt(String(value));
  sessionStorage.setItem(BROWSER_NS + key, encrypted);
}

async function browserGet(key) {
  const stored = sessionStorage.getItem(BROWSER_NS + key);
  if (!stored) return null;
  return browserDecrypt(stored);
}

function browserDel(key) {
  sessionStorage.removeItem(BROWSER_NS + key);
}

function browserClear() {
  Object.keys(sessionStorage)
    .filter(k => k.startsWith(BROWSER_NS))
    .forEach(k => sessionStorage.removeItem(k));
}

async function browserGetAll() {
  const result = {};
  for (const k of Object.keys(sessionStorage).filter(k => k.startsWith(BROWSER_NS))) {
    const key = k.slice(BROWSER_NS.length);
    result[key] = await browserGet(key);
  }
  return result;
}

// ── Tauri store singleton ─────────────────────────────────────────────────────
let _store = null;
async function _getStore() {
  if (_store) return _store;
  const { Store } = await import("@tauri-apps/plugin-store");
  _store = await Store.load("secure.bin", { autoSave: true });
  return _store;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function secureSet(key, value) {
  if (IS_TAURI) {
    const s = await _getStore();
    await s.set(key, String(value));
    await s.save();
    return;
  }
  return browserSet(key, value);
}

export async function secureGet(key) {
  if (IS_TAURI) {
    const s = await _getStore();
    const v = await s.get(key);
    return v != null ? String(v) : null;
  }
  return browserGet(key);
}

export async function secureDel(key) {
  if (IS_TAURI) {
    const s = await _getStore();
    await s.delete(key);
    await s.save();
    return;
  }
  browserDel(key);
}

export async function secureClear() {
  if (IS_TAURI) {
    const s = await _getStore();
    await s.clear();
    await s.save();
    return;
  }
  browserClear();
}

export async function secureGetAll() {
  if (IS_TAURI) {
    const s = await _getStore();
    const entries = await s.entries();
    return Object.fromEntries(entries.map(([k, v]) => [k, v != null ? String(v) : ""]));
  }
  return browserGetAll();
}

// ── One-time migration from legacy wayai_accounts_v3 localStorage ────────────
const MIGRATION_FLAG = "wayai_migrated_v4";

export async function migrateFromLocalStorage() {
  if (localStorage.getItem(MIGRATION_FLAG)) return;
  try {
    const old = JSON.parse(localStorage.getItem("wayai_accounts_v3") || "[]");
    for (const acc of old) {
      if (acc.apiKey && acc.id) {
        await secureSet(`key_${acc.id}`, acc.apiKey);
      }
    }
    if (old.length) {
      const meta = old.map(({ apiKey: _k, ...rest }) => rest);
      localStorage.setItem("wayai_accounts_meta_v4", JSON.stringify(meta));
    }
    localStorage.removeItem("wayai_accounts_v3");
    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch { /* ignore migration errors */ }
}
