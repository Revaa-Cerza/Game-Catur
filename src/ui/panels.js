/**
 * panels.js — The information panels around the board:
 * move history, captured pieces + material balance, engine telemetry,
 * game status and the evaluation bar.
 */

import { pieceSvg } from "../../assets/pieces.js";
import { escapeHtml, formatNumber, formatScore, scoreToFraction } from "../utils/helpers.js";

// ---------------------------------------------------------------------------
// Move list
// ---------------------------------------------------------------------------
export class MoveListView {
  /**
   * @param {HTMLElement} el
   * @param {(plyIndex:number) => void} onJump — jump to the position *after*
   *   move `plyIndex` (-1 = initial position).
   */
  constructor(el, onJump) {
    this.el = el;
    this.onJump = onJump;
    this.el.addEventListener("click", (event) => {
      const cell = event.target.closest("[data-ply]");
      if (cell) this.onJump(Number(cell.dataset.ply));
    });
  }

  /**
   * @param {{san:string, glyph?:string}[]} moves
   * @param {number} currentPly — index of the move we are currently *after*.
   */
  render(moves, currentPly) {
    let html = "";
    for (let i = 0; i < moves.length; i += 2) {
      const number = i / 2 + 1;
      const white = moves[i];
      const black = moves[i + 1];
      html += `<div class="move-row">`;
      html += `<span class="move-number">${number}.</span>`;
      html += this.cell(white, i, currentPly);
      html += black ? this.cell(black, i + 1, currentPly) : `<span class="move-cell empty"></span>`;
      html += `</div>`;
    }
    this.el.innerHTML = html || `<div class="move-list-empty">No moves yet</div>`;
    const current = this.el.querySelector(".move-cell.current");
    current?.scrollIntoView({ block: "nearest" });
  }

  cell(move, ply, currentPly) {
    const glyph = move.glyph ? `<span class="glyph ${move.glyphClass || ""}">${move.glyph}</span>` : "";
    const cls = `move-cell${ply === currentPly ? " current" : ""}${move.glyphClass ? " " + move.glyphClass : ""}`;
    return `<span class="${cls}" data-ply="${ply}">${escapeHtml(move.san)}${glyph}</span>`;
  }
}

// ---------------------------------------------------------------------------
// Captured pieces + material balance (one row per player)
// ---------------------------------------------------------------------------
const CAPTURE_ORDER = ["Q", "R", "B", "N", "P"];
const PIECE_POINTS = { P: 1, N: 3, B: 3, R: 5, Q: 9 };

export class CapturedView {
  /** @param {HTMLElement} whiteEl element showing pieces White captured */
  constructor(whiteEl, blackEl) {
    this.els = { w: whiteEl, b: blackEl };
  }

  /** @param {{w:string[], b:string[]}} captured piece letters per capturer */
  render(captured) {
    const points = (list) => list.reduce((sum, p) => sum + (PIECE_POINTS[p] || 0), 0);
    const wPoints = points(captured.w);
    const bPoints = points(captured.b);
    for (const color of ["w", "b"]) {
      const el = this.els[color];
      if (!el) continue;
      const enemy = color === "w" ? "b" : "w";
      const sorted = [...captured[color]].sort(
        (a, b) => CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b),
      );
      let html = sorted.map((p) => `<span class="cap-piece">${pieceSvg(enemy + p)}</span>`).join("");
      const diff = color === "w" ? wPoints - bPoints : bPoints - wPoints;
      if (diff > 0) html += `<span class="material-diff">+${diff}</span>`;
      el.innerHTML = html;
    }
  }
}

// ---------------------------------------------------------------------------
// Engine telemetry (thinking indicator, depth, nodes, score, PV, time)
// ---------------------------------------------------------------------------
export class EngineInfoView {
  constructor(el) {
    this.el = el;
    this.el.innerHTML = `
      <div class="engine-status"><span class="spinner" hidden></span><span class="engine-status-text">Idle</span></div>
      <div class="engine-grid">
        <div><span class="stat-label">Depth</span><span class="stat-value" data-stat="depth">–</span></div>
        <div><span class="stat-label">Nodes</span><span class="stat-value" data-stat="nodes">–</span></div>
        <div><span class="stat-label">Eval</span><span class="stat-value" data-stat="score">–</span></div>
        <div><span class="stat-label">Time</span><span class="stat-value" data-stat="time">–</span></div>
      </div>
      <div class="engine-pv"><span class="stat-label">Best line</span><span class="pv-text" data-stat="pv">–</span></div>`;
    this.spinner = this.el.querySelector(".spinner");
    this.statusText = this.el.querySelector(".engine-status-text");
    this.stats = {};
    for (const node of this.el.querySelectorAll("[data-stat]")) {
      this.stats[node.dataset.stat] = node;
    }
  }

  setThinking(thinking, label = "Thinking\u2026") {
    this.spinner.hidden = !thinking;
    this.statusText.textContent = thinking ? label : "Idle";
    this.el.classList.toggle("thinking", thinking);
  }

  update({ depth, nodes, scoreCp, mate, pv, timeMs, fromBook }) {
    if (fromBook) {
      this.stats.depth.textContent = "book";
      this.stats.nodes.textContent = "–";
      this.stats.score.textContent = "–";
      this.stats.time.textContent = "–";
      this.stats.pv.textContent = "Opening book move";
      return;
    }
    if (depth !== undefined) this.stats.depth.textContent = String(depth);
    if (nodes !== undefined) this.stats.nodes.textContent = formatNumber(nodes);
    if (scoreCp !== undefined || mate !== undefined) {
      this.stats.score.textContent = formatScore(scoreCp ?? null, mate ?? null);
    }
    if (timeMs !== undefined) this.stats.time.textContent = `${(timeMs / 1000).toFixed(1)}s`;
    if (pv) this.stats.pv.textContent = pv.join(" ") || "–";
  }

  reset() {
    this.setThinking(false);
    for (const key of Object.keys(this.stats)) this.stats[key].textContent = "–";
  }
}

// ---------------------------------------------------------------------------
// Game status line
// ---------------------------------------------------------------------------
export class StatusView {
  constructor(el) {
    this.el = el;
  }

  /** @param {"info"|"check"|"end"} kind */
  set(text, kind = "info") {
    this.el.textContent = text;
    this.el.dataset.kind = kind;
  }
}

// ---------------------------------------------------------------------------
// Evaluation bar (white share from the bottom)
// ---------------------------------------------------------------------------
export class EvalBarView {
  constructor(el) {
    this.el = el;
    this.el.innerHTML = `<div class="eval-fill"></div><span class="eval-label"></span>`;
    this.fill = this.el.querySelector(".eval-fill");
    this.label = this.el.querySelector(".eval-label");
    this.set(0, null);
  }

  /** @param {number|null} scoreCp white-positive centipawns */
  set(scoreCp, mate) {
    const fraction = scoreToFraction(scoreCp, mate);
    this.fill.style.height = `${fraction * 100}%`;
    this.label.textContent = formatScore(scoreCp, mate);
    this.label.classList.toggle("black-ahead", fraction < 0.5);
  }
}
