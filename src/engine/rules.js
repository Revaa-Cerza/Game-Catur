/**
 * rules.js — Game termination and draw rules.
 *
 * Everything the arbiter would rule on: checkmate, stalemate, the fifty-move
 * rule, threefold repetition, and insufficient material. Draw by agreement is
 * handled at the game-controller level (it is a claim, not a board fact).
 */

import { BISHOP, KING, KNIGHT, PAWN, WHITE, fileOf, pieceType, rankOf } from "./constants.js";
import { generateLegalMoves } from "./movegen.js";

/**
 * How many times has the current position occurred (including now)?
 * Only positions since the last irreversible move can repeat, so the scan is
 * bounded by the halfmove clock.
 */
export function repetitionCount(board) {
  const kh = board.keyHistory;
  const lo = board.hashLo;
  const hi = board.hashHi;
  let count = 0;
  const maxPositions = board.halfmove + 1;
  for (let i = kh.length - 2, seen = 0; i >= 0 && seen < maxPositions; i -= 2, seen++) {
    if (kh[i] === lo && kh[i + 1] === hi) count++;
  }
  return count;
}

/**
 * FIDE “dead position” subset that is safely decidable from material alone:
 * K vs K, K+N vs K, K+B vs K, and same-colored-bishops only.
 */
export function insufficientMaterial(board) {
  const minors = [];
  let bishopSquareColors = new Set();
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const p = board.squares[sq];
    if (!p) continue;
    const t = pieceType(p);
    if (t === KING) continue;
    if (t === PAWN || t === 4 /* ROOK */ || t === 5 /* QUEEN */) return false;
    minors.push(t);
    if (t === BISHOP) bishopSquareColors.add((rankOf(sq) + fileOf(sq)) & 1);
  }
  if (minors.length === 0) return true; // K vs K
  if (minors.length === 1) return true; // K+minor vs K
  // Any number of bishops all standing on the same square color (no knights).
  if (minors.every((t) => t === BISHOP) && bishopSquareColors.size === 1) return true;
  return false;
}

/**
 * Full status of the position.
 * @returns {{
 *   over: boolean,
 *   result: "1-0"|"0-1"|"1/2-1/2"|null,
 *   reason: string|null,
 *   check: boolean,
 *   legalMoves: number[],
 * }}
 */
export function gameStatus(board) {
  const legalMoves = generateLegalMoves(board);
  const check = board.inCheck();

  if (legalMoves.length === 0) {
    if (check) {
      return {
        over: true,
        result: board.turn === WHITE ? "0-1" : "1-0",
        reason: "checkmate",
        check,
        legalMoves,
      };
    }
    return { over: true, result: "1/2-1/2", reason: "stalemate", check, legalMoves };
  }

  if (board.halfmove >= 100) {
    return { over: true, result: "1/2-1/2", reason: "fifty-move rule", check, legalMoves };
  }
  if (repetitionCount(board) >= 3) {
    return { over: true, result: "1/2-1/2", reason: "threefold repetition", check, legalMoves };
  }
  if (insufficientMaterial(board)) {
    return { over: true, result: "1/2-1/2", reason: "insufficient material", check, legalMoves };
  }

  return { over: false, result: null, reason: null, check, legalMoves };
}
