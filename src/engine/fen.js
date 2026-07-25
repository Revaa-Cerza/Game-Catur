/**
 * fen.js — Forsyth–Edwards Notation parsing and serialization.
 */

import {
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  CHAR_TO_TYPE,
  KING,
  TYPE_TO_CHAR,
  WHITE,
  algebraic,
  makePiece,
  parseSquare,
  pieceColor,
  pieceType,
  square,
} from "./constants.js";

/**
 * Load `fen` into `board`. Throws an Error with a readable message when the
 * FEN is malformed (the UI surfaces this directly to the user).
 */
export function loadFen(board, fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) throw new Error("FEN must contain at least a board and a side to move");
  const [placement, side, castling = "-", ep = "-", halfmove = "0", fullmove = "1"] = parts;

  const ranks = placement.split("/");
  if (ranks.length !== 8) throw new Error("FEN board must have 8 ranks");

  board.clear();

  let kings = { w: 0, b: 0 };
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of ranks[7 - r]) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
      } else {
        const type = CHAR_TO_TYPE[ch.toLowerCase()];
        if (!type || file > 7) throw new Error(`Invalid FEN board character "${ch}"`);
        const color = ch === ch.toUpperCase() ? WHITE : BLACK;
        if (type === KING) kings[color === WHITE ? "w" : "b"]++;
        board.squares[square(r, file)] = makePiece(color, type);
        file++;
      }
    }
    if (file !== 8) throw new Error("FEN rank does not sum to 8 squares");
  }
  if (kings.w !== 1 || kings.b !== 1) throw new Error("FEN must contain exactly one king per side");

  if (side !== "w" && side !== "b") throw new Error('FEN side to move must be "w" or "b"');
  board.turn = side === "w" ? WHITE : BLACK;

  board.castling = 0;
  if (castling !== "-") {
    for (const ch of castling) {
      if (ch === "K") board.castling |= CASTLE_WK;
      else if (ch === "Q") board.castling |= CASTLE_WQ;
      else if (ch === "k") board.castling |= CASTLE_BK;
      else if (ch === "q") board.castling |= CASTLE_BQ;
      else throw new Error(`Invalid castling field "${castling}"`);
    }
  }

  board.ep = ep === "-" ? -1 : parseSquare(ep);
  if (board.ep === -1 && ep !== "-") throw new Error(`Invalid en-passant square "${ep}"`);

  board.halfmove = Math.max(0, parseInt(halfmove, 10) || 0);
  board.fullmove = Math.max(1, parseInt(fullmove, 10) || 1);

  board.refreshDerivedState();

  // Reject positions where the side *not* to move is in check (impossible).
  if (board.isSquareAttacked(board.kings[board.turn ^ 1], board.turn)) {
    throw new Error("Illegal FEN: the side not to move is in check");
  }
  return board;
}

/** Serialize `board` to a FEN string. */
export function toFen(board) {
  let placement = "";
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board.squares[square(r, f)];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) {
        placement += empty;
        empty = 0;
      }
      const ch = TYPE_TO_CHAR[pieceType(p)];
      placement += pieceColor(p) === WHITE ? ch : ch.toLowerCase();
    }
    if (empty) placement += empty;
    if (r) placement += "/";
  }

  let castling = "";
  if (board.castling & CASTLE_WK) castling += "K";
  if (board.castling & CASTLE_WQ) castling += "Q";
  if (board.castling & CASTLE_BK) castling += "k";
  if (board.castling & CASTLE_BQ) castling += "q";

  return [
    placement,
    board.turn === WHITE ? "w" : "b",
    castling || "-",
    board.ep === -1 ? "-" : algebraic(board.ep),
    board.halfmove,
    board.fullmove,
  ].join(" ");
}
