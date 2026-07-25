/**
 * dialogs.js — Modal dialogs: promotion picker, new game, game over,
 * PGN/FEN import-export, and a generic confirm (draw offers in PvP).
 *
 * The modal markup lives in index.html; this module only wires behavior.
 */

import { pieceSvg } from "../../assets/pieces.js";
import { escapeHtml } from "../utils/helpers.js";

const show = (el) => {
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("open"));
};
const hide = (el) => {
  el.classList.remove("open");
  setTimeout(() => (el.hidden = true), 150);
};

// ---------------------------------------------------------------------------
// Promotion picker
// ---------------------------------------------------------------------------
/**
 * @param {"w"|"b"} color
 * @returns {Promise<"q"|"r"|"b"|"n"|null>} null when dismissed (move cancelled)
 */
export function askPromotion(color) {
  const modal = document.getElementById("promotion-modal");
  const row = modal.querySelector(".promotion-row");
  row.innerHTML = ["Q", "R", "B", "N"]
    .map(
      (p) =>
        `<button class="promotion-choice" data-piece="${p.toLowerCase()}" aria-label="Promote to ${p}">${pieceSvg(color + p)}</button>`,
    )
    .join("");
  show(modal);
  return new Promise((resolve) => {
    const done = (value) => {
      hide(modal);
      modal.removeEventListener("click", onClick);
      resolve(value);
    };
    const onClick = (event) => {
      const btn = event.target.closest(".promotion-choice");
      if (btn) done(btn.dataset.piece);
      else if (event.target === modal) done(null);
    };
    modal.addEventListener("click", onClick);
  });
}

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------
export function showGameOver({ title, subtitle }, { onRematch, onAnalyze }) {
  const modal = document.getElementById("gameover-modal");
  modal.querySelector(".gameover-title").textContent = title;
  modal.querySelector(".gameover-subtitle").textContent = subtitle;
  show(modal);
  const rematchBtn = modal.querySelector("[data-action='rematch']");
  const analyzeBtn = modal.querySelector("[data-action='analyze']");
  const closeBtn = modal.querySelector("[data-action='close']");
  const cleanup = () => {
    hide(modal);
    rematchBtn.onclick = analyzeBtn.onclick = closeBtn.onclick = modal.onclick = null;
  };
  rematchBtn.onclick = () => {
    cleanup();
    onRematch();
  };
  analyzeBtn.onclick = () => {
    cleanup();
    onAnalyze();
  };
  closeBtn.onclick = cleanup;
  modal.onclick = (event) => {
    if (event.target === modal) cleanup();
  };
}

// ---------------------------------------------------------------------------
// Generic confirm (PvP draw offers, dangerous actions)
// ---------------------------------------------------------------------------
export function askConfirm(title, message, confirmLabel = "Accept", cancelLabel = "Decline") {
  const modal = document.getElementById("confirm-modal");
  modal.querySelector(".confirm-title").textContent = title;
  modal.querySelector(".confirm-message").textContent = message;
  const yes = modal.querySelector("[data-action='yes']");
  const no = modal.querySelector("[data-action='no']");
  yes.textContent = confirmLabel;
  no.textContent = cancelLabel;
  show(modal);
  return new Promise((resolve) => {
    const done = (value) => {
      hide(modal);
      yes.onclick = no.onclick = modal.onclick = null;
      resolve(value);
    };
    yes.onclick = () => done(true);
    no.onclick = () => done(false);
    modal.onclick = (event) => {
      if (event.target === modal) done(false);
    };
  });
}

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------
/**
 * @param {object} defaults previous config
 * @param {{name:string}[]} puzzles for the puzzle selector
 * @returns {Promise<object|null>} chosen config or null when cancelled
 */
export function askNewGame(defaults, puzzles) {
  const modal = document.getElementById("newgame-modal");
  const form = modal.querySelector("form");

  form.elements.mode.value = defaults.mode;
  form.elements.difficulty.value = defaults.difficulty;
  form.elements.difficultyBlack.value = defaults.difficultyBlack || defaults.difficulty;
  form.elements.playerColor.value = defaults.playerColor;
  form.elements.timeControl.value = defaults.timeControl;
  form.elements.whiteName.value = defaults.whiteName;
  form.elements.blackName.value = defaults.blackName;
  form.elements.randomOpening.checked = !!defaults.randomOpening;
  form.elements.startFen.value = "";

  const puzzleSelect = form.elements.puzzle;
  puzzleSelect.innerHTML = puzzles
    .map((p, i) => `<option value="${i}">${escapeHtml(p.name)}</option>`)
    .join("");

  const sync = () => {
    const mode = form.elements.mode.value;
    modal.querySelector("[data-row='difficulty']").hidden = !(mode === "pvai" || mode === "practice" || mode === "aivai");
    modal.querySelector("[data-row='difficultyBlack']").hidden = mode !== "aivai";
    modal.querySelector("[data-row='playerColor']").hidden = !(mode === "pvai" || mode === "practice");
    modal.querySelector("[data-row='puzzle']").hidden = mode !== "puzzle";
    modal.querySelector("[data-row='timeControl']").hidden = mode === "puzzle" || mode === "aivai";
    modal.querySelector("[data-row='randomOpening']").hidden = !(mode === "pvai" || mode === "practice" || mode === "aivai");
    modal.querySelector("[data-row='startFen']").hidden = mode === "puzzle";
    const labelWhite = modal.querySelector("[data-label='whiteName']");
    const labelBlack = modal.querySelector("[data-label='blackName']");
    labelWhite.hidden = mode === "aivai" || mode === "puzzle";
    labelBlack.hidden = mode !== "pvp";
  };
  form.elements.mode.onchange = sync;
  sync();

  show(modal);
  return new Promise((resolve) => {
    const done = (value) => {
      hide(modal);
      form.onsubmit = modal.onclick = null;
      modal.querySelector("[data-action='cancel']").onclick = null;
      resolve(value);
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      done({
        mode: form.elements.mode.value,
        difficulty: form.elements.difficulty.value,
        difficultyBlack: form.elements.difficultyBlack.value,
        playerColor: form.elements.playerColor.value,
        timeControl: form.elements.timeControl.value,
        whiteName: form.elements.whiteName.value.trim() || "White",
        blackName: form.elements.blackName.value.trim() || "Black",
        randomOpening: form.elements.randomOpening.checked,
        puzzleIndex: Number(form.elements.puzzle.value || 0),
        startFen: form.elements.startFen.value.trim(),
      });
    };
    modal.querySelector("[data-action='cancel']").onclick = () => done(null);
    modal.onclick = (event) => {
      if (event.target === modal) done(null);
    };
  });
}

// ---------------------------------------------------------------------------
// PGN / FEN tools
// ---------------------------------------------------------------------------
export function showPgnDialog({ pgn, fen, onImportPgn, onImportFen }) {
  const modal = document.getElementById("pgn-modal");
  const textarea = modal.querySelector("#pgn-text");
  const fenInput = modal.querySelector("#fen-text");
  const error = modal.querySelector(".pgn-error");
  textarea.value = pgn;
  fenInput.value = fen;
  error.textContent = "";
  show(modal);

  const close = () => {
    hide(modal);
    modal.onclick = null;
  };
  modal.querySelector("[data-action='close']").onclick = close;
  modal.onclick = (event) => {
    if (event.target === modal) close();
  };
  modal.querySelector("[data-action='copy-pgn']").onclick = () =>
    navigator.clipboard?.writeText(textarea.value);
  modal.querySelector("[data-action='copy-fen']").onclick = () =>
    navigator.clipboard?.writeText(fenInput.value);
  modal.querySelector("[data-action='import-pgn']").onclick = () => {
    try {
      onImportPgn(textarea.value);
      close();
    } catch (err) {
      error.textContent = String(err.message || err);
    }
  };
  modal.querySelector("[data-action='import-fen']").onclick = () => {
    try {
      onImportFen(fenInput.value.trim());
      close();
    } catch (err) {
      error.textContent = String(err.message || err);
    }
  };
}

/** Small transient toast in the corner. */
export function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("visible"), 2600);
}
