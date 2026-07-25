/**
 * evaluate.js — Static evaluation in centipawns.
 *
 * A tapered evaluation: every term is computed for the middlegame and the
 * endgame and blended by the remaining non-pawn material ("phase"). Terms:
 *
 *  - Material (conventional piece values)
 *  - Piece-square tables (center control, development, piece activity)
 *  - Separate king tables for middlegame (castle & hide) / endgame (activate)
 *  - Pawn structure: doubled, isolated and passed pawns (rank-scaled bonus)
 *  - Bishop pair
 *  - Rooks on open / semi-open files, rook on the 7th
 *  - Mobility (pseudo-move counts per piece)
 *  - King safety: pawn-shield in front of a castled king
 *  - Development: penalty for minors still at home while the game is young
 *  - Tempo
 *
 * The score is returned from the perspective of the side to move (negamax).
 */

import {
  BISHOP,
  BISHOP_DIRS,
  BLACK,
  KING,
  KNIGHT,
  KNIGHT_OFFSETS,
  PAWN,
  QUEEN,
  QUEEN_DIRS,
  ROOK,
  ROOK_DIRS,
  WHITE,
  fileOf,
  onBoard,
  pieceType,
  rankOf,
} from "../engine/constants.js";

// Material values tuned for search (bishop slightly above knight).
export const MATERIAL = [0, 100, 320, 330, 500, 900, 0];

// Game phase weights (total 24 at the initial position).
const PHASE_WEIGHT = [0, 0, 1, 1, 2, 4, 0];
const PHASE_TOTAL = 24;

// --------------------------------------------------------------------------
// Piece-square tables, written from White's point of view with rank 8 first
// (the visually intuitive layout). idx = (7 - rank) * 8 + file for White.
// --------------------------------------------------------------------------
const PST_PAWN_MG = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_PAWN_EG = [
  0, 0, 0, 0, 0, 0, 0, 0,
  80, 80, 80, 80, 80, 80, 80, 80,
  50, 50, 50, 50, 50, 50, 50, 50,
  30, 30, 30, 30, 30, 30, 30, 30,
  15, 15, 15, 15, 15, 15, 15, 15,
  5, 5, 5, 5, 5, 5, 5, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const PST_KING_MG = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const PST_KING_EG = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

const PST_MG = [null, PST_PAWN_MG, PST_KNIGHT, PST_BISHOP, PST_ROOK, PST_QUEEN, PST_KING_MG];
const PST_EG = [null, PST_PAWN_EG, PST_KNIGHT, PST_BISHOP, PST_ROOK, PST_QUEEN, PST_KING_EG];

/** PST index for a 0x88 square, mirrored for Black. */
const pstIndex = (sq, color) => {
  const r = rankOf(sq);
  const f = fileOf(sq);
  return color === WHITE ? (7 - r) * 8 + f : r * 8 + f;
};

// Passed-pawn bonus indexed by relative rank (rank 1..7 from the pawn's side).
const PASSED_BONUS = [0, 5, 10, 20, 35, 60, 100, 0];

const DOUBLED_PENALTY = 12;
const ISOLATED_PENALTY = 15;
const BISHOP_PAIR_BONUS = 30;
const ROOK_OPEN_FILE = 20;
const ROOK_SEMI_OPEN = 10;
const ROOK_ON_SEVENTH = 20;
const SHIELD_PENALTY = 12;
const UNDEVELOPED_PENALTY = 10;
const TEMPO_BONUS = 10;

const MOBILITY_WEIGHT = [0, 0, 4, 4, 2, 1, 0];

// Home squares of the minor pieces (development term).
const HOME_MINORS = [
  [0x01, 0x06, 0x02, 0x05], // white Nb1 Ng1 Bc1 Bf1
  [0x71, 0x76, 0x72, 0x75], // black
];

/**
 * Evaluate `board`. Positive = good for the side to move.
 */
export function evaluate(board) {
  const squares = board.squares;

  let mg = 0; // white-positive middlegame score
  let eg = 0; // white-positive endgame score
  let phase = 0;

  // Pawn counts per file, and per-color piece lists for the structure terms.
  const pawnFiles = [new Int8Array(8), new Int8Array(8)];
  const pawns = [[], []];
  const bishops = [0, 0];
  const rooks = [[], []];

  // ---- first pass: material, PST, mobility, phase ------------------------
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const piece = squares[sq];
    if (!piece) continue;
    const color = piece >> 3;
    const type = pieceType(piece);
    const sign = color === WHITE ? 1 : -1;
    const idx = pstIndex(sq, color);

    phase += PHASE_WEIGHT[type];
    mg += sign * (MATERIAL[type] + PST_MG[type][idx]);
    eg += sign * (MATERIAL[type] + PST_EG[type][idx]);

    if (type === PAWN) {
      pawnFiles[color][fileOf(sq)]++;
      pawns[color].push(sq);
    } else if (type === BISHOP) {
      bishops[color]++;
    } else if (type === ROOK) {
      rooks[color].push(sq);
    }

    // Mobility: pseudo-move counts (cheap proxy for piece activity).
    const weight = MOBILITY_WEIGHT[type];
    if (weight) {
      let mobility = 0;
      if (type === KNIGHT) {
        for (let i = 0; i < 8; i++) {
          const s = sq + KNIGHT_OFFSETS[i];
          if (onBoard(s) && (!squares[s] || squares[s] >> 3 !== color)) mobility++;
        }
      } else {
        const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : QUEEN_DIRS;
        for (let i = 0; i < dirs.length; i++) {
          for (let s = sq + dirs[i]; onBoard(s); s += dirs[i]) {
            if (!squares[s]) {
              mobility++;
              continue;
            }
            if (squares[s] >> 3 !== color) mobility++;
            break;
          }
        }
      }
      mg += sign * mobility * weight;
      eg += sign * mobility * weight;
    }
  }

  // ---- pawn structure -----------------------------------------------------
  for (let color = WHITE; color <= BLACK; color++) {
    const sign = color === WHITE ? 1 : -1;
    const own = pawnFiles[color];
    const their = pawnFiles[color ^ 1];

    for (let f = 0; f < 8; f++) {
      if (own[f] > 1) {
        const extra = own[f] - 1;
        mg -= sign * extra * DOUBLED_PENALTY;
        eg -= sign * extra * DOUBLED_PENALTY;
      }
      if (own[f] > 0) {
        const left = f > 0 ? own[f - 1] : 0;
        const right = f < 7 ? own[f + 1] : 0;
        if (!left && !right) {
          mg -= sign * own[f] * ISOLATED_PENALTY;
          eg -= sign * own[f] * ISOLATED_PENALTY;
        }
      }
    }

    // Passed pawns: no enemy pawn ahead on this or adjacent files.
    for (const sq of pawns[color]) {
      const f = fileOf(sq);
      const r = rankOf(sq);
      let passed = true;
      for (const enemySq of pawns[color ^ 1]) {
        const ef = fileOf(enemySq);
        if (Math.abs(ef - f) > 1) continue;
        const er = rankOf(enemySq);
        if (color === WHITE ? er > r : er < r) {
          passed = false;
          break;
        }
      }
      if (passed) {
        const relRank = color === WHITE ? r : 7 - r;
        mg += sign * PASSED_BONUS[relRank];
        eg += sign * PASSED_BONUS[relRank] * 1.6;
      }
      void their; // (their file counts are folded into the loop above)
    }
  }

  // ---- bishops & rooks ----------------------------------------------------
  for (let color = WHITE; color <= BLACK; color++) {
    const sign = color === WHITE ? 1 : -1;
    if (bishops[color] >= 2) {
      mg += sign * BISHOP_PAIR_BONUS;
      eg += sign * BISHOP_PAIR_BONUS;
    }
    for (const sq of rooks[color]) {
      const f = fileOf(sq);
      const ownPawns = pawnFiles[color][f];
      const theirPawns = pawnFiles[color ^ 1][f];
      if (!ownPawns && !theirPawns) mg += sign * ROOK_OPEN_FILE;
      else if (!ownPawns) mg += sign * ROOK_SEMI_OPEN;
      const relRank = color === WHITE ? rankOf(sq) : 7 - rankOf(sq);
      if (relRank === 6) {
        mg += sign * ROOK_ON_SEVENTH;
        eg += sign * ROOK_ON_SEVENTH;
      }
    }
  }

  // ---- king safety (middlegame only): pawn shield -------------------------
  for (let color = WHITE; color <= BLACK; color++) {
    const sign = color === WHITE ? 1 : -1;
    const kingSq = board.kings[color];
    const kf = fileOf(kingSq);
    const forward = color === WHITE ? 16 : -16;
    let missing = 0;
    for (let df = -1; df <= 1; df++) {
      const f = kf + df;
      if (f < 0 || f > 7) continue;
      const s1 = kingSq + forward + df;
      const s2 = kingSq + 2 * forward + df;
      const pawn = (color << 3) | PAWN;
      const hasShield =
        (onBoard(s1) && squares[s1] === pawn) || (onBoard(s2) && squares[s2] === pawn);
      if (!hasShield) missing++;
    }
    mg -= sign * missing * SHIELD_PENALTY;
  }

  // ---- development (early game only) --------------------------------------
  if (phase > 18) {
    for (let color = WHITE; color <= BLACK; color++) {
      const sign = color === WHITE ? 1 : -1;
      for (const home of HOME_MINORS[color]) {
        const p = squares[home];
        if (p && p >> 3 === color) {
          const t = pieceType(p);
          if (t === KNIGHT || t === BISHOP) mg -= sign * UNDEVELOPED_PENALTY;
        }
      }
    }
  }

  // ---- tapered blend + tempo ----------------------------------------------
  const mgWeight = Math.min(phase, PHASE_TOTAL) / PHASE_TOTAL;
  let score = Math.round(mg * mgWeight + eg * (1 - mgWeight));
  score = board.turn === WHITE ? score : -score;
  return score + TEMPO_BONUS;
}
