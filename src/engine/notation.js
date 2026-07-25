/**
 * notation.js — Standard Algebraic Notation (SAN) and UCI conversion.
 *
 * SAN generation handles piece letters, captures, pawn-capture file prefixes,
 * promotions, castling, full disambiguation (file / rank / both) and the
 * check (+) / checkmate (#) suffixes.
 */

import {
  FLAG_CASTLE,
  KING,
  PAWN,
  TYPE_TO_CHAR,
  algebraic,
  fileOf,
  moveCaptured,
  moveFlags,
  moveFrom,
  movePiece,
  movePromotion,
  moveTo,
  moveToUci,
  pieceType,
  rankOf,
} from "./constants.js";
import { generateLegalMoves } from "./movegen.js";

/** SAN body without check/mate suffix. `legalMoves` avoids regeneration. */
function sanBody(board, move, legalMoves) {
  const flags = moveFlags(move);
  if (flags & FLAG_CASTLE) {
    return moveTo(move) > moveFrom(move) ? "O-O" : "O-O-O";
  }

  const from = moveFrom(move);
  const to = moveTo(move);
  const piece = movePiece(move);
  const type = pieceType(piece);
  const isCapture = moveCaptured(move) !== 0;
  let san = "";

  if (type === PAWN) {
    if (isCapture) san += algebraic(from)[0] + "x";
    san += algebraic(to);
    const promo = movePromotion(move);
    if (promo) san += "=" + TYPE_TO_CHAR[promo];
    return san;
  }

  san += TYPE_TO_CHAR[type];

  // Disambiguation: other legal moves of the same piece type to the same square.
  if (type !== KING) {
    let sameFile = false;
    let sameRank = false;
    let ambiguous = false;
    for (const other of legalMoves) {
      if (other === move) continue;
      if (moveTo(other) !== to) continue;
      if (pieceType(movePiece(other)) !== type) continue;
      ambiguous = true;
      if (fileOf(moveFrom(other)) === fileOf(from)) sameFile = true;
      if (rankOf(moveFrom(other)) === rankOf(from)) sameRank = true;
    }
    if (ambiguous) {
      if (!sameFile) san += algebraic(from)[0];
      else if (!sameRank) san += algebraic(from)[1];
      else san += algebraic(from);
    }
  }

  if (isCapture) san += "x";
  san += algebraic(to);
  return san;
}

/**
 * Convert a legal move to SAN. Must be called *before* the move is made.
 */
export function moveToSan(board, move, legalMoves = generateLegalMoves(board)) {
  let san = sanBody(board, move, legalMoves);
  if (board.makeMove(move)) {
    if (board.inCheck()) {
      san += generateLegalMoves(board).length === 0 ? "#" : "+";
    }
    board.unmakeMove();
  }
  return san;
}

const normalizeSan = (san) =>
  san
    .replace(/[+#!?]+$/g, "")
    .replace(/^0-0-0/, "O-O-O")
    .replace(/^0-0/, "O-O")
    .replace(/e\.p\.?$/i, "")
    .trim();

/**
 * Parse a SAN token ("Nf3", "exd5", "O-O", "e8=Q+") against the current
 * position. Returns the packed move, or null when no legal move matches.
 */
export function sanToMove(board, san) {
  const target = normalizeSan(san);
  const legalMoves = generateLegalMoves(board);
  for (const move of legalMoves) {
    if (normalizeSan(sanBody(board, move, legalMoves)) === target) return move;
    if (moveToUci(move) === san.toLowerCase()) return move; // tolerate UCI input
  }
  return null;
}

/** Parse a UCI string ("e2e4", "a7a8q") into the matching legal move. */
export function uciToMove(board, uci) {
  const lower = uci.toLowerCase();
  for (const move of generateLegalMoves(board)) {
    if (moveToUci(move) === lower) return move;
  }
  return null;
}
