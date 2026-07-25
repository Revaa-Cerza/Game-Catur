/**
 * boardView.js — Renders the board and handles user input.
 *
 * Rendering strategy (60 FPS friendly):
 *  - The 64 squares are static DOM nodes created once.
 *  - Pieces live in an absolutely-positioned layer; each piece is moved with
 *    a CSS `transform: translate(...)` only, so movement animates on the
 *    compositor with zero layout work.
 *  - Highlights (selection, last move, check, legal dots) are tiny overlay
 *    nodes toggled by class — no board re-render per frame.
 *
 * Input: click-click and pointer-based drag & drop (mouse + touch), with
 * legal-move indicators supplied by the controller.
 */

import { pieceSvg } from "../../assets/pieces.js";

const FILES = "abcdefgh";

/** rank/file (0-based, white perspective) -> square name like "e4". */
const squareName = (rank, file) => FILES[file] + (rank + 1);

export class BoardView {
  /**
   * @param {HTMLElement} root — the .board-wrap element.
   * @param {object} callbacks
   * @param {(from:string, to:string) => void} callbacks.onUserMove
   * @param {(from:string) => string[]} callbacks.getLegalTargets
   * @param {(square:string) => boolean} callbacks.canPickUp
   */
  constructor(root, { onUserMove, getLegalTargets, canPickUp }) {
    this.root = root;
    this.onUserMove = onUserMove;
    this.getLegalTargets = getLegalTargets;
    this.canPickUp = canPickUp;

    this.flipped = false;
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.checkSquare = null;
    /** @type {Map<string, HTMLElement>} square name -> piece element */
    this.pieces = new Map();
    this.interactive = true;

    this.buildDom();
    this.bindPointerEvents();
  }

  // ------------------------------------------------------------ DOM setup

  buildDom() {
    this.root.innerHTML = "";
    this.boardEl = document.createElement("div");
    this.boardEl.className = "board";

    this.squareEls = new Map();
    for (let visualRank = 7; visualRank >= 0; visualRank--) {
      for (let file = 0; file < 8; file++) {
        const el = document.createElement("div");
        el.className = `square ${(visualRank + file) % 2 ? "light" : "dark"}`;
        el.dataset.visualRank = visualRank;
        el.dataset.visualFile = file;
        this.boardEl.appendChild(el);
      }
    }

    this.pieceLayer = document.createElement("div");
    this.pieceLayer.className = "piece-layer";
    this.boardEl.appendChild(this.pieceLayer);

    this.arrowLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.arrowLayer.setAttribute("class", "arrow-layer");
    this.arrowLayer.setAttribute("viewBox", "0 0 800 800");
    this.boardEl.appendChild(this.arrowLayer);

    this.coordsEl = document.createElement("div");
    this.coordsEl.className = "coords";
    this.boardEl.appendChild(this.coordsEl);

    this.root.appendChild(this.boardEl);
    this.applyOrientation();
  }

  /** Re-label squares + coordinates for the current orientation. */
  applyOrientation() {
    for (const el of this.boardEl.querySelectorAll(".square")) {
      const vr = Number(el.dataset.visualRank);
      const vf = Number(el.dataset.visualFile);
      const rank = this.flipped ? 7 - vr : vr;
      const file = this.flipped ? 7 - vf : vf;
      const name = squareName(rank, file);
      el.dataset.square = name;
      this.squareEls.set(name, el);
    }
    // Coordinates: files along the bottom row, ranks along the left column.
    this.coordsEl.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const fileLabel = document.createElement("span");
      fileLabel.className = "coord coord-file";
      fileLabel.style.left = `${i * 12.5}%`;
      fileLabel.textContent = this.flipped ? FILES[7 - i] : FILES[i];
      this.coordsEl.appendChild(fileLabel);

      const rankLabel = document.createElement("span");
      rankLabel.className = "coord coord-rank";
      rankLabel.style.top = `${i * 12.5}%`;
      rankLabel.textContent = this.flipped ? String(i + 1) : String(8 - i);
      this.coordsEl.appendChild(rankLabel);
    }
    // Reposition existing pieces instantly.
    for (const [square, el] of this.pieces) this.placePiece(el, square, false);
    this.refreshHighlights();
  }

  // --------------------------------------------------------- positioning

  /** Percentage translate for a square name in the current orientation. */
  squareOffset(square) {
    const file = FILES.indexOf(square[0]);
    const rank = Number(square[1]) - 1;
    const x = this.flipped ? 7 - file : file;
    const y = this.flipped ? rank : 7 - rank;
    return { x: x * 100, y: y * 100 };
  }

  placePiece(el, square, animate = true) {
    const { x, y } = this.squareOffset(square);
    el.classList.toggle("no-anim", !animate);
    el.style.transform = `translate(${x}%, ${y}%)`;
    if (!animate) {
      // Force the style flush so the next transform change animates again.
      void el.offsetWidth;
      el.classList.remove("no-anim");
    }
  }

  makePieceEl(code) {
    const el = document.createElement("div");
    el.className = "piece";
    el.dataset.code = code;
    el.innerHTML = pieceSvg(code);
    this.pieceLayer.appendChild(el);
    return el;
  }

  /**
   * Reconcile the piece layer with `grid` (64-array, a1..h8 rank-major,
   * values like "wP" or null). When `animateMove` ({from,to}) is given the
   * moving piece glides; everything else snaps (captures fade out).
   */
  setPosition(grid, animateMove = null) {
    const target = new Map();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const code = grid[rank * 8 + file];
        if (code) target.set(squareName(rank, file), code);
      }
    }

    const oldPieces = this.pieces;
    const newPieces = new Map();

    // 1. The animated mover (also covers castling's king; the rook snaps).
    if (animateMove && oldPieces.has(animateMove.from) && target.has(animateMove.to)) {
      const el = oldPieces.get(animateMove.from);
      oldPieces.delete(animateMove.from);
      const newCode = target.get(animateMove.to);
      if (el.dataset.code !== newCode) {
        el.dataset.code = newCode; // promotion changes the sprite mid-flight
        el.innerHTML = pieceSvg(newCode);
      }
      this.placePiece(el, animateMove.to, true);
      newPieces.set(animateMove.to, el);
      target.delete(animateMove.to);
    }

    // 2. Keep pieces that did not change.
    for (const [square, code] of target) {
      const el = oldPieces.get(square);
      if (el && el.dataset.code === code) {
        oldPieces.delete(square);
        newPieces.set(square, el);
        target.delete(square);
      }
    }

    // 3. Reuse leftover elements of the same piece code (rook in castling,
    //    arbitrary jumps when navigating history), else create new ones.
    for (const [square, code] of target) {
      let matchSquare = null;
      for (const [oldSquare, el] of oldPieces) {
        if (el.dataset.code === code) {
          matchSquare = oldSquare;
          break;
        }
      }
      let el;
      if (matchSquare) {
        el = oldPieces.get(matchSquare);
        oldPieces.delete(matchSquare);
        this.placePiece(el, square, true);
      } else {
        el = this.makePieceEl(code);
        this.placePiece(el, square, false);
      }
      newPieces.set(square, el);
    }

    // 4. Whatever is left was captured / removed — fade it out.
    for (const [, el] of oldPieces) {
      el.classList.add("captured");
      setTimeout(() => el.remove(), 160);
    }

    this.pieces = newPieces;
    this.clearSelection();
  }

  // ----------------------------------------------------------- highlights

  setLastMove(from, to) {
    this.lastMove = from && to ? { from, to } : null;
    this.refreshHighlights();
  }

  setCheck(square) {
    this.checkSquare = square || null;
    this.refreshHighlights();
  }

  refreshHighlights() {
    for (const el of this.boardEl.querySelectorAll(".square")) {
      const name = el.dataset.square;
      el.classList.toggle(
        "last-move",
        !!this.lastMove && (name === this.lastMove.from || name === this.lastMove.to),
      );
      el.classList.toggle("in-check", name === this.checkSquare);
      el.classList.toggle("selected", name === this.selected);
      const isTarget = this.legalTargets.includes(name);
      el.classList.toggle("legal-target", isTarget);
      el.classList.toggle("legal-capture", isTarget && this.pieces.has(name));
    }
  }

  clearSelection() {
    this.selected = null;
    this.legalTargets = [];
    this.refreshHighlights();
  }

  select(square) {
    this.selected = square;
    this.legalTargets = this.getLegalTargets(square);
    this.refreshHighlights();
  }

  // -------------------------------------------------------------- arrows

  drawArrow(from, to, className = "hint-arrow") {
    const cell = 100; // viewBox is 800/8
    const center = (square) => {
      const { x, y } = this.squareOffset(square);
      return { cx: x + 50, cy: y + 50 };
    };
    const a = center(from);
    const b = center(to);
    const angle = Math.atan2(b.cy - a.cy, b.cx - a.cx);
    const head = 30;
    const endX = b.cx - Math.cos(angle) * 18;
    const endY = b.cy - Math.sin(angle) * 18;
    const ns = "http://www.w3.org/2000/svg";
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", a.cx * (cell / 100));
    line.setAttribute("y1", a.cy * (cell / 100));
    line.setAttribute("x2", endX - Math.cos(angle) * head * 0.6);
    line.setAttribute("y2", endY - Math.sin(angle) * head * 0.6);
    line.setAttribute("class", className);
    const tip = document.createElementNS(ns, "polygon");
    const px = endX;
    const py = endY;
    const left = angle + Math.PI * 0.82;
    const right = angle - Math.PI * 0.82;
    tip.setAttribute(
      "points",
      `${px},${py} ${px + Math.cos(left) * head},${py + Math.sin(left) * head} ` +
        `${px + Math.cos(right) * head},${py + Math.sin(right) * head}`,
    );
    tip.setAttribute("class", className);
    this.arrowLayer.appendChild(line);
    this.arrowLayer.appendChild(tip);
  }

  clearArrows() {
    this.arrowLayer.innerHTML = "";
  }

  // ---------------------------------------------------------------- input

  setInteractive(on) {
    this.interactive = on;
    if (!on) this.clearSelection();
  }

  squareFromPoint(clientX, clientY) {
    const rect = this.boardEl.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return null;
    const visualFile = Math.floor(fx * 8);
    const visualRank = 7 - Math.floor(fy * 8);
    const rank = this.flipped ? 7 - visualRank : visualRank;
    const file = this.flipped ? 7 - visualFile : visualFile;
    return squareName(rank, file);
  }

  bindPointerEvents() {
    let drag = null;

    this.boardEl.addEventListener("pointerdown", (event) => {
      if (!this.interactive || event.button > 0) return;
      const square = this.squareFromPoint(event.clientX, event.clientY);
      if (!square) return;

      const hasPiece = this.pieces.has(square);

      // Second click: try to move to the clicked square.
      if (this.selected && this.legalTargets.includes(square)) {
        const from = this.selected;
        this.clearSelection();
        this.onUserMove(from, square);
        return;
      }

      if (hasPiece && this.canPickUp(square)) {
        this.select(square);
        // Begin a potential drag.
        const el = this.pieces.get(square);
        drag = { from: square, el, moved: false };
        el.classList.add("dragging");
        this.boardEl.setPointerCapture(event.pointerId);
      } else {
        this.clearSelection();
      }
    });

    this.boardEl.addEventListener("pointermove", (event) => {
      if (!drag) return;
      drag.moved = true;
      const rect = this.boardEl.getBoundingClientRect();
      const size = rect.width / 8;
      const x = event.clientX - rect.left - size / 2;
      const y = event.clientY - rect.top - size / 2;
      drag.el.classList.add("no-anim");
      drag.el.style.transform = `translate(${(x / size) * 100}%, ${(y / size) * 100}%)`;
    });

    const endDrag = (event) => {
      if (!drag) return;
      const { from, el, moved } = drag;
      drag = null;
      el.classList.remove("dragging");
      el.classList.remove("no-anim");

      if (!moved) {
        // Simple click — leave the selection active for click-click moving.
        this.placePiece(el, from, false);
        return;
      }
      const dropSquare = this.squareFromPoint(event.clientX, event.clientY);
      if (dropSquare && dropSquare !== from && this.legalTargets.includes(dropSquare)) {
        this.placePiece(el, from, false); // controller will re-render/animate
        this.clearSelection();
        this.onUserMove(from, dropSquare);
      } else {
        this.placePiece(el, from, true); // snap back
        if (dropSquare === from) return; // keep selection
        this.clearSelection();
      }
    };

    this.boardEl.addEventListener("pointerup", endDrag);
    this.boardEl.addEventListener("pointercancel", endDrag);
  }

  flip() {
    this.flipped = !this.flipped;
    this.applyOrientation();
  }
}
