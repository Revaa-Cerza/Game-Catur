/**
 * helpers.js — Small shared utilities (no chess knowledge in here).
 */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** 90000 -> "1:30", 65500 -> "1:05", 9800 -> "0:09.8" (tenths under 10s). */
export function formatClock(ms) {
  const clamped = Math.max(0, ms);
  const totalSeconds = clamped / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (clamped < 10_000 && minutes === 0) {
    const tenths = Math.floor((clamped % 1000) / 100);
    return `0:0${seconds}.${tenths}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** 1234567 -> "1,234,567" (for node counts). */
export const formatNumber = (n) => n.toLocaleString("en-US");

/** Centipawns -> "+1.24" / "-0.30"; mate -> "#4" / "#-3". */
export function formatScore(scoreCp, mate) {
  if (mate !== null && mate !== undefined) return mate > 0 ? `#${mate}` : `#-${Math.abs(mate)}`;
  const pawns = (scoreCp ?? 0) / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

/**
 * Convert a (white-positive) score to a 0..1 fill fraction for the eval bar
 * using the familiar logistic curve; mate pins the bar to the edge.
 */
export function scoreToFraction(scoreCp, mate) {
  if (mate !== null && mate !== undefined) return mate > 0 ? 1 : 0;
  return 1 / (1 + Math.pow(10, -(scoreCp ?? 0) / 400));
}

/** Trigger a client-side text-file download. */
export function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Read a user-picked file as text (PGN import). */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Escape text for safe innerHTML interpolation. */
export const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
