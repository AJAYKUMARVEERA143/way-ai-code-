/**
 * Way AI Code - ExtensionPreviewTab.jsx
 * Extension detail page - renders in main editor area as a tab
 * Way AI unique design: gradient hero, animated install, glow effects
 */

import { useState, useEffect } from "react";
import { fmtDownloads, fmtRating, starsStr } from "./ExtensionStore.js";
import "./ExtensionPreviewTab.css";

const TABS = ["DETAILS", "FEATURES", "CHANGELOG", "EXTENSION PACK"];

export default function ExtensionPreviewTab({ ext, installed, onInstall, onUninstall }) {
  const [tab, setTab] = useState("DETAILS");
  const [readme, setReadme] = useState("");
  const [readmeLoad, setRLoad] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [justDone, setJustDone] = useState(false);

  useEffect(() => {
    if (!ext) return;
    setTab("DETAILS");
    if (ext.readme) {
      setRLoad(true);
      fetch(ext.readme)
        .then((r) => r.text())
        .then((t) => setReadme(t))
        .catch(() => setReadme(ext.description || "No description available."))
        .finally(() => setRLoad(false));
    } else {
      setReadme(ext.description || "No description available.");
    }
  }, [ext?.id]);

  const handleInstall = async () => {
    if (installing || installed) return;
    setInstalling(true);
    await new Promise((r) => setTimeout(r, 900));
    onInstall?.(ext.id);
    setInstalling(false);
    setJustDone(true);
    setTimeout(() => setJustDone(false), 2500);
  };

  const handleUninstall = () => {
    onUninstall?.(ext.id);
    setJustDone(false);
  };

  if (!ext) {
    return (
      <div className="expt-empty">
        <div className="expt-empty-icon">◈</div>
        <div className="expt-empty-text">No extension selected</div>
      </div>
    );
  }

  const isInstalled = installed || justDone;

  return (
    <div className="expt-root">
      <div className="expt-hero">
        <div className="expt-hero-bg" />

        <div className="expt-hero-content">
          <div className="expt-hero-icon">
            {ext.icon ? (
              <img
                src={ext.icon}
                alt={ext.name}
                width={72}
                height={72}
                style={{ borderRadius: 12, display: "block" }}
                onError={(e) => {
                  e.target.style.display = "none";
                  if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
                }}
              />
            ) : null}
            <div className="expt-icon-fallback" style={{ display: ext.icon ? "none" : "flex" }}>
              {(ext.name?.[0] || "?").toUpperCase()}
            </div>
          </div>

          <div className="expt-hero-info">
            <div className="expt-hero-name">{ext.name}</div>
            <div className="expt-hero-pub-row">
              <span className="expt-hero-pub">
                <span className="expt-verified-icon">✓</span>
                {ext.publisher}
              </span>
              {ext.downloads > 0 && <span className="expt-hero-stat">☁ {fmtDownloads(ext.downloads)}</span>}
              {ext.rating > 0 && (
                <span className="expt-hero-stat expt-stars" title={`${fmtRating(ext.rating)}/5`}>
                  {starsStr(ext.rating)}
                  <span className="expt-rating-n">({ext.ratingCount || 0})</span>
                </span>
              )}
              <span className="expt-hero-stat">v{ext.version}</span>
            </div>
            <div className="expt-hero-desc">{ext.description}</div>

            <div className="expt-hero-actions">
              {!isInstalled ? (
                <button
                  className={`expt-install-btn ${installing ? "installing" : ""}`}
                  onClick={handleInstall}
                  disabled={installing}
                >
                  <span className="expt-install-ring" />
                  <span className="expt-install-label">{installing ? "Installing..." : "Install"}</span>
                </button>
              ) : (
                <div className="expt-installed-row">
                  <div className="expt-installed-badge">
                    <span className="expt-installed-check">✓</span>
                    Installed
                  </div>
                  <button className="expt-disable-btn">Disable</button>
                  <button className="expt-uninstall-btn" onClick={handleUninstall}>
                    Uninstall
                  </button>
                </div>
              )}
              <button className="expt-gear-btn" title="Extension Settings">
                ⚙
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="expt-tabbar">
        {TABS.map((t) => (
          <button
            key={t}
            className={`expt-tab ${tab === t ? "expt-tab-on" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="expt-body">
        {tab === "DETAILS" && (
          <div className="expt-details">
            <div className="expt-readme-wrap">
              {readmeLoad ? <div className="expt-loading">Loading documentation...</div> : <pre className="expt-readme">{readme}</pre>}
            </div>

            <div className="expt-info-sidebar">
              {ext.categories?.length > 0 && (
                <div className="expt-info-section">
                  <div className="expt-info-title">Categories</div>
                  <div className="expt-info-tags">
                    {ext.categories.map((c) => (
                      <span key={c} className="expt-info-tag">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="expt-info-section">
                <div className="expt-info-title">Resources</div>
                {ext.repository && (
                  <a href={ext.repository} target="_blank" rel="noreferrer" className="expt-info-link">
                    Repository
                  </a>
                )}
                {ext.license && <div className="expt-info-link">License ({ext.license})</div>}
                <a
                  href={`https://open-vsx.org/extension/${ext.namespace}/${ext.extName}`}
                  target="_blank"
                  rel="noreferrer"
                  className="expt-info-link"
                >
                  Open VSX Marketplace
                </a>
              </div>

              <div className="expt-info-section">
                <div className="expt-info-title">More Info</div>
                <div className="expt-info-row">
                  <span className="expt-info-key">Version</span>
                  <span className="expt-info-val">{ext.version}</span>
                </div>
                <div className="expt-info-row">
                  <span className="expt-info-key">Publisher</span>
                  <span className="expt-info-val">{ext.publisher}</span>
                </div>
                {ext.downloads > 0 && (
                  <div className="expt-info-row">
                    <span className="expt-info-key">Downloads</span>
                    <span className="expt-info-val">{fmtDownloads(ext.downloads)}</span>
                  </div>
                )}
                {ext.rating > 0 && (
                  <div className="expt-info-row">
                    <span className="expt-info-key">Rating</span>
                    <span className="expt-info-val">{fmtRating(ext.rating)} / 5</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "FEATURES" && (
          <div className="expt-placeholder">
            <div className="expt-placeholder-icon">⚡</div>
            <div>Feature contributions for {ext.name}</div>
            <div className="expt-placeholder-sub">Activates on: {ext.categories?.join(", ") || "various file types"}</div>
          </div>
        )}

        {tab === "CHANGELOG" && (
          <div className="expt-placeholder">
            <div className="expt-placeholder-icon">📋</div>
            {ext.changelog ? (
              <a href={ext.changelog} target="_blank" rel="noreferrer" className="expt-info-link">
                View Changelog
              </a>
            ) : (
              <div>No changelog available for {ext.name}</div>
            )}
          </div>
        )}

        {tab === "EXTENSION PACK" && (
          <div className="expt-placeholder">
            <div className="expt-placeholder-icon">◈</div>
            <div>This extension is not part of a pack.</div>
          </div>
        )}
      </div>
    </div>
  );
}
