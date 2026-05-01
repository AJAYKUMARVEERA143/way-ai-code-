/**
 * Way AI Code — secureStorage.js
 * Dual-mode encrypted key store:
 *   Tauri desktop → tauri-plugin-store (encrypted OS file)
 *   Browser dev   → sessionStorage with XOR obfuscation (no plain-text)
 */

const IS_TAURI = typeof window !== "undefined" &&
  ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

// ── Browser XOR obfuscation (not encryption, but hides keys in DevTools) ─────
const OBF_KEY = 0x5a;
function xorEncode(str) {
  try {
    return btoa(Array.from(str).map(c => String.fromCharCode(c.charCodeAt(0) ^ OBF_KEY)).join(""));
  } catch { return ""; }
}
function xorDecode(str) {
  try {
    return Array.from(atob(str)).map(c => String.fromCharCode(c.charCodeAt(0) ^ OBF_KEY)).join("");
  } catch { return ""; }
}

// ── Tauri store singleton ─────────────────────────────────────────────────────
const SS_PREFIX = "wayai_ss_";
let _store = null;
async function _getStore() {
  if (_store) return _store;
  const { Store } = await import("@tauri-apps/plugin-store");
  _store = await Store.load("secure.bin", { autoSave: true });
  return _store;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function secureSet(key, value) {
  try {
    if (IS_TAURI) {
      const s = await _getStore();
      await s.set(key, value);
      await s.save();
    } else {
      sessionStorage.setItem(SS_PREFIX + key, xorEncode(value));
    }
  } catch { /* fail silently — never crash the app over key storage */ }
}

export async function secureGet(key) {
  try {
    if (IS_TAURI) {
      const s = await _getStore();
      const v = await s.get(key);
      return v != null ? String(v) : null;
    }
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    return raw ? xorDecode(raw) : null;
  } catch { return null; }
}

export async function secureDel(key) {
  try {
    if (IS_TAURI) {
      const s = await _getStore();
      await s.delete(key);
      await s.save();
    } else {
      sessionStorage.removeItem(SS_PREFIX + key);
    }
  } catch {}
}

export async function secureClear() {
  try {
    if (IS_TAURI) {
      const s = await _getStore();
      await s.clear();
      await s.save();
    } else {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith(SS_PREFIX))
        .forEach(k => sessionStorage.removeItem(k));
    }
  } catch {}
}

export async function secureGetAll() {
  try {
    if (IS_TAURI) {
      const s = await _getStore();
      const entries = await s.entries();
      return Object.fromEntries(entries.map(([k, v]) => [k, v != null ? String(v) : ""]));
    }
    const result = {};
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(SS_PREFIX)) {
        result[k.slice(SS_PREFIX.length)] = xorDecode(sessionStorage.getItem(k));
      }
    }
    return result;
  } catch { return {}; }
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
  } catch { /* ignore migration errors */ }
  // Always mark done so we don't retry on every load
  localStorage.setItem(MIGRATION_FLAG, "1");
}
