/**
 * Way AI Code — ExtensionStore.js
 * Data layer for extension marketplace
 * API: Open VSX Registry (open-vsx.org)
 */

const OPEN_VSX = "https://open-vsx.org/api";
const STORAGE_KEY = "wayai_ext_installed_v1";

// ── Curated list shown before search ──────────────────────────────────────────
export const CURATED = [
  { id:"ms-python.python",            category:"Language", featured:true  },
  { id:"ms-python.pylance",           category:"Language", featured:true  },
  { id:"rust-lang.rust-analyzer",     category:"Language", featured:true  },
  { id:"golang.go",                   category:"Language", featured:false },
  { id:"esbenp.prettier-vscode",      category:"Tools",    featured:true  },
  { id:"dbaeumer.vscode-eslint",      category:"Tools",    featured:true  },
  { id:"eamodio.gitlens",             category:"Tools",    featured:true  },
  { id:"continue.continue",           category:"AI",       featured:true  },
  { id:"dracula-theme.theme-dracula", category:"Themes",   featured:false },
  { id:"pkief.material-icon-theme",   category:"Themes",   featured:false },
];

export const CATEGORIES = ["All","AI","Language","Tools","Themes","DevOps"];

// ── localStorage helpers ───────────────────────────────────────────────────────
export const loadInstalled = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    // Backward compat: migrate old string-ID arrays to object arrays
    return raw.map(x => (typeof x === "string" ? { id: x, name: x } : x));
  } catch { return []; }
};
export const saveInstalled   = (arr) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {} };
export const addInstalled    = (ext, arr) => { const u=[...arr.filter(x=>x.id!==ext.id), ext]; saveInstalled(u); return u; };
export const removeInstalled = (id, arr)  => { const u=arr.filter(x=>x.id!==id); saveInstalled(u); return u; };

// ── API calls ─────────────────────────────────────────────────────────────────
function normalize(raw) {
  const ns   = raw.namespace   || raw.publisher || "";
  const name = raw.name        || "";
  return {
    id:           `${ns}.${name}`,
    name:         raw.displayName || name,
    publisher:    ns,
    description:  raw.description  || "",
    version:      raw.version       || "1.0.0",
    icon:         raw.files?.icon   || null,
    downloads:    raw.downloadCount || 0,
    rating:       raw.averageRating || 0,
    ratingCount:  raw.reviewCount   || 0,
    categories:   raw.categories    || [],
    tags:         raw.tags          || [],
    repository:   raw.repository    || null,
    license:      raw.license       || "",
    readme:       raw.files?.readme || null,
    changelog:    raw.files?.changelog || null,
    namespace:    ns,
    extName:      name,
  };
}

export async function searchExt(query, size=20) {
  const res = await fetch(
    `${OPEN_VSX}/-/search?${new URLSearchParams({query,size,sortBy:"relevance"})}`,
    { signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const d = await res.json();
  return (d.extensions||[]).map(normalize);
}

export async function getExtDetail(id) {
  const [pub, name] = id.split(".");
  if (!pub||!name) return null;
  const res = await fetch(`${OPEN_VSX}/${pub}/${name}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  return normalize(await res.json());
}

export async function loadFeatured() {
  const ids = CURATED.filter(e=>e.featured).map(e=>e.id);
  const results = await Promise.allSettled(ids.map(id=>getExtDetail(id)));
  return results.filter(r=>r.status==="fulfilled"&&r.value).map(r=>r.value);
}

// ── Formatters ────────────────────────────────────────────────────────────────
export const fmtDownloads = n => n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1e3?`${(n/1e3).toFixed(0)}K`:String(n||0);
export const fmtRating    = r => (r||0).toFixed(1);
export const starsStr     = r => { const f=Math.round(r||0); return "★".repeat(f)+"☆".repeat(5-f); };

// ── Version helpers ───────────────────────────────────────────────────────────
function semverGt(a, b) {
  const pa = (a||"0").split(".").map(Number);
  const pb = (b||"0").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i]||0, nb = pb[i]||0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

// Returns { [id]: latestExt } for installed extensions that have a newer version available.
export async function checkForUpdates(installed) {
  if (!installed?.length) return {};
  const results = await Promise.allSettled(installed.map(e => getExtDetail(e.id)));
  const updates = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      const latest = r.value;
      const current = installed[i];
      if (semverGt(latest.version, current.version)) {
        updates[current.id] = latest;
      }
    }
  });
  return updates;
}
