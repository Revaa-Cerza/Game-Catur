/**
 * movegen.js — Move generation.
 *
 * generateMoves() produces pseudo-legal moves (fast, allocation-light: one
 * array of packed integers). generateLegalMoves() filters them with
 * make/unmake so pins, checks and every other legality constraint are exact.
 *
 * Castling is generated fully legal here (rights + empty path + the king may
 * not castle out of, through, or into check), so the make/unmake filter never
 * needs special cases for it.
 */

import {
  BISHOP,
  BISHOP_DIRS,
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  FLAG_CAPTURE,
  FLAG_CASTLE,
  FLAG_DOUBLE,
  FLAG_EP,
  FLAG_PROMOTION,
  KING,
  KING_OFFSETS,
  KNIGHT,
  KNIGHT_OFFSETS,
  PAWN,
  PAWN_ATTACKS,
  PAWN_PUSH,
  QUEEN,
  QUEEN_DIRS,
  ROOK,
  ROOK_DIRS,
  WHITE,
  encodeMove,
  makePiece,
  moveFrom,
  onBoard,
  pieceType,
  rankOf,
} from "./constants.js";

const PROMO_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT];

/**
 * Generate pseudo-legal moves for the side to move.
 * @param {import("./board.js").Board} board
 * @param {boolean} capturesOnly — when true, only captures, en-passant and
 *   promotions are generated (used by quiescence search).
 * @returns {number[]} packed moves
 */
export function generateMoves(board, capturesOnly = false) {
  const moves = [];
  const squares = board.squares;
  const us = board.turn;
  const them = us ^ 1;
  const push = PAWN_PUSH[us];
  const promoRank = us === WHITE ? 7 : 0;
  const doubleRank = us === WHITE ? 1 : 6;

  for (let from = 0; from < 128; from++) {
    if (from & 0x88) continue;
    const piece = squares[from];
    if (!piece || piece >> 3 !== us) continue;
    const type = pieceType(piece);

    if (type === PAWN) {
      // --- pushes -------------------------------------------------------
      const one = from + push;
      if (onBoard(one) && !squares[one]) {
        if (rankOf(one) === promoRank) {
          for (const p of PROMO_TYPES) {
            moves.push(encodeMove(from, one, piece, 0, p, FLAG_PROMOTION));
          }
        } else {
          if (!capturesOnly) {
            moves.push(encodeMove(from, one, piece));
            if (rankOf(from) === doubleRank) {
              const two = from + push * 2;
              if (!squares[two]) {
                moves.push(encodeMove(from, two, piece, 0, 0, FLAG_DOUBLE));
              }
            }
          }
        }
      }
      // --- captures (incl. en passant) ----------------------------------
      for (const off of PAWN_ATTACKS[us]) {
        const to = from + off;
        if (!onBoard(to)) continue;
        const target = squares[to];
        if (target && target >> 3 === them) {
          if (rankOf(to) === promoRank) {
            for (const p of PROMO_TYPES) {
              moves.push(
                encodeMove(from, to, piece, target, p, FLAG_PROMOTION | FLAG_CAPTURE),
              );
            }
          } else {
            moves.push(encodeMove(from, to, piece, target, 0, FLAG_CAPTURE));
          }
        } else if (to === board.ep) {
          moves.push(
            encodeMove(from, to, piece, makePiece(them, PAWN), 0, FLAG_EP | FLAG_CAPTURE),
          );
        }
      }
    } else if (type === KNIGHT || type === KING) {
      const offsets = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
      for (let i = 0; i < 8; i++) {
        const to = from + offsets[i];
        if (!onBoard(to)) continue;
        const target = squares[to];
        if (!target) {
          if (!capturesOnly) moves.push(encodeMove(from, to, piece));
        } else if (target >> 3 === them) {
          moves.push(encodeMove(from, to, piece, target, 0, FLAG_CAPTURE));
        }
      }
    } else {
      // Sliding pieces: bishop / rook / queen.
      const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : QUEEN_DIRS;
      for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        for (let to = from + dir; onBoard(to); to += dir) {
          const target = squares[to];
          if (!target) {
            if (!capturesOnly) moves.push(encodeMove(from, to, piece));
            continue;
          }
          if (target >> 3 === them) {
            moves.push(encodeMove(from, to, piece, target, 0, FLAG_CAPTURE));
          }
          break;
        }
      }
    }
  }

  // --- castling ----------------------------------------------------------
  if (!capturesOnly) {
    const king = makePiece(us, KING);
    if (us === WHITE) {
      if (
        board.castling & CASTLE_WK &&
        !squares[0x05] &&
        !squares[0x06] &&
        !board.isSquareAttacked(0x04, BLACK) &&
        !board.isSquareAttacked(0x05, BLACK) &&
        !board.isSquareAttacked(0x06, BLACK)
      ) {
        moves.push(encodeMove(0x04, 0x06, king, 0, 0, FLAG_CASTLE));
      }
      if (
        board.castling & CASTLE_WQ &&
        !squares[0x03] &&
        !squares[0x02] &&
        !squares[0x01] &&
        !board.isSquareAttacked(0x04, BLACK) &&
        !board.isSquareAttacked(0x03, BLACK) &&
        !board.isSquareAttacked(0x02, BLACK)
      ) {
        moves.push(encodeMove(0x04, 0x02, king, 0, 0, FLAG_CASTLE));
      }
    } else {
      if (
        board.castling & CASTLE_BK &&
        !squares[0x75] &&
        !squares[0x76] &&
        !board.isSquareAttacked(0x74, WHITE) &&
        !board.isSquareAttacked(0x75, WHITE) &&
        !board.isSquareAttacked(0x76, WHITE)
      ) {
        moves.push(encodeMove(0x74, 0x76, king, 0, 0, FLAG_CASTLE));
      }
      if (
        board.castling & CASTLE_BQ &&
        !squares[0x73] &&
        !squares[0x72] &&
        !squares[0x71] &&
        !board.isSquareAttacked(0x74, WHITE) &&
        !board.isSquareAttacked(0x73, WHITE) &&
        !board.isSquareAttacked(0x72, WHITE)
      ) {
        moves.push(encodeMove(0x74, 0x72, king, 0, 0, FLAG_CASTLE));
      }
    }
  }

  return moves;
}

/**
 * Strictly legal moves — pseudo-legal moves validated with make/unmake.
 * This is the single source of truth used by the UI and the search root.
 */
export function generateLegalMoves(board) {
  const pseudo = generateMoves(board);
  const legal = [];
  for (let i = 0; i < pseudo.length; i++) {
    if (board.makeMove(pseudo[i])) {
      board.unmakeMove();
      legal.push(pseudo[i]);
    }
  }
  return legal;
}

/** Legal moves that start on `from` (UI: legal-move indicators). */
export function legalMovesFrom(board, from) {
  return generateLegalMoves(board).filter((m) => moveFrom(m) === from);
}

/** Perft node counter — used by the test suite to validate the generator. */
export function perft(board, depth) {
  if (depth === 0) return 1;
  const moves = generateMoves(board);
  let nodes = 0;
  for (let i = 0; i < moves.length; i++) {
    if (board.makeMove(moves[i])) {
      nodes += perft(board, depth - 1);
      board.unmakeMove();
    }
  }
  return nodes;
}
