/**
 * pieces.js — The piece set: a clean, flat, vector chess set drawn in code.
 *
 * Every piece is an SVG on a 45x45 viewBox, built from a shared base plinth
 * plus a per-piece silhouette. Because they are inline SVG they scale crisply
 * at any DPI, tint per theme, and require no image downloads — the whole app
 * stays a zero-asset, fully offline bundle.
 *
 * Usage: pieceSvg("wQ") -> "<svg …>…</svg>"
 */

const STYLES = {
  w: { fill: "#f9f9f7", stroke: "#3d3c39", detail: "#3d3c39" },
  b: { fill: "#3f3d3a", stroke: "#26251f", detail: "#d8d5cf" },
};

/** The base plinth every piece stands on. */
const base = () =>
  `<path d="M12 37.5 h21 a2 2 0 0 1 2 2 v0.8 a2 2 0 0 1 -2 2 h-21 a2 2 0 0 1 -2 -2 v-0.8 a2 2 0 0 1 2 -2 z"/>`;

const BODIES = {
  // ---- pawn ---------------------------------------------------------------
  P: (s) => `
    <circle cx="22.5" cy="12.2" r="5.2"/>
    <path d="M22.5 16.6 c-3 0 -5 2.1 -5 4.7 0 1.5 0.7 2.8 1.8 3.7 -3.3 2.5 -5.3 7 -5.3 12.5 h17 c0 -5.5 -2 -10 -5.3 -12.5 1.1 -0.9 1.8 -2.2 1.8 -3.7 0 -2.6 -2 -4.7 -5 -4.7 z"/>`,

  // ---- rook ---------------------------------------------------------------
  R: (s) => `
    <path d="M12.5 37.5 l1.8 -5 v-13 l-2.3 -2.8 v-6.2 h4.6 v3 h4 v-3 h4.8 v3 h4 v-3 h4.6 v6.2 l-2.3 2.8 v13 l1.8 5 z"/>
    <path d="M14.3 32.5 h16.4 M14.3 19.5 h16.4" fill="none" stroke="${s.detail}" stroke-width="1.1" opacity="0.55"/>`,

  // ---- knight -------------------------------------------------------------
  N: (s) => `
    <path d="M14.5 37.5 c0 -5.5 2 -8.5 4.6 -10.6 -2.9 0.2 -5.1 -1.6 -5.8 -3.7 -0.4 -1.2 0.1 -2 0.8 -2.7 -0.9 -1.1 -0.7 -2.6 0.3 -4.1 l2.7 -3.9 c0.6 -0.9 0.9 -2.1 1.1 -3.6 1.5 0.5 2.7 1.6 3.3 2.9 3 0.3 6.6 1.9 8.7 5 2.2 3.3 2.6 8 2.6 13 0 3 0.1 5.6 0.7 7.7 z"/>
    <circle cx="18" cy="16.2" r="1.2" fill="${s.detail}"/>
    <path d="M14.6 21.2 l2.5 -1.1" fill="none" stroke="${s.detail}" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>`,

  // ---- bishop -------------------------------------------------------------
  B: (s) => `
    <circle cx="22.5" cy="8.6" r="2.1"/>
    <path d="M22.5 11.6 c3.6 2.6 6.1 6.6 6.1 10.6 0 3.4 -2.2 6 -6.1 6 -3.9 0 -6.1 -2.6 -6.1 -6 0 -4 2.5 -8 6.1 -10.6 z"/>
    <path d="M20.4 17.2 l4.2 4.4" fill="none" stroke="${s.detail}" stroke-width="1.3" stroke-linecap="round" opacity="0.8"/>
    <path d="M16.8 37.5 c0 -4.6 2.2 -7.6 5.7 -8.7 3.5 1.1 5.7 4.1 5.7 8.7 z"/>`,

  // ---- queen --------------------------------------------------------------
  Q: (s) => `
    <path d="M11.6 15.5 l4 10.5 -1.6 4.5 h17 l-1.6 -4.5 4 -10.5 -5.5 8 -1.9 -10 -3.5 8.8 -3.5 -8.8 -1.9 10 z"/>
    <circle cx="11.4" cy="14" r="1.7"/>
    <circle cx="17" cy="12.4" r="1.7"/>
    <circle cx="22.5" cy="11.6" r="1.7"/>
    <circle cx="28" cy="12.4" r="1.7"/>
    <circle cx="33.6" cy="14" r="1.7"/>
    <path d="M14 30.5 c0.4 3 0 5 -1 7 h19 c-1 -2 -1.4 -4 -1 -7 z"/>`,

  // ---- king ---------------------------------------------------------------
  K: (s) => `
    <path d="M21.4 5.5 h2.2 v2.8 h2.8 v2.2 h-2.8 v3 h-2.2 v-3 h-2.8 v-2.2 h2.8 z"/>
    <path d="M22.5 25.5 c0 -5.5 4.3 -9.6 8 -7.9 3.4 1.6 2.4 6.8 -2.6 10.2 l-5.4 3 -5.4 -3 c-5 -3.4 -6 -8.6 -2.6 -10.2 3.7 -1.7 8 2.4 8 7.9 z"/>
    <path d="M15.8 37.5 c-0.4 -4 1.2 -6.8 6.7 -7.8 5.5 1 7.1 3.8 6.7 7.8 z"/>`,
};

const PIECE_CACHE = new Map();

/**
 * @param {string} code — "wP", "bK", … (color letter + piece letter)
 * @returns {string} inline SVG markup
 */
export function pieceSvg(code) {
  if (PIECE_CACHE.has(code)) return PIECE_CACHE.get(code);
  const s = STYLES[code[0]];
  const body = BODIES[code[1]];
  const svg = `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.5" stroke-linejoin="round">${body(s)}${base()}</g></svg>`;
  PIECE_CACHE.set(code, svg);
  return svg;
}

export const PIECE_CODES = [
  "wP", "wN", "wB", "wR", "wQ", "wK",
  "bP", "bN", "bB", "bR", "bQ", "bK",
];
