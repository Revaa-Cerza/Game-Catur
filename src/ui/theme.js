/**
 * theme.js — Light / dark theme handling.
 *
 * Defaults to the OS preference (prefers-color-scheme) and persists an
 * explicit user choice to localStorage.
 */

const STORAGE_KEY = "chessmaster.theme";

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));

  // Follow OS changes while the user has no explicit preference.
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(event.matches ? "dark" : "light");
    }
  });
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("btn-theme");
  if (btn) btn.textContent = theme === "dark" ? "\u2600\uFE0E" : "\u263D";
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme(next);
}
