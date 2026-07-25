/**
 * constants.js — Shared constants and low-level helpers for the whole engine.
 *
 * Board representation: 0x88.
 * A square is `rank * 16 + file` (rank 0 = rank 1, file 0 = the a-file).
 * A square index is on the board iff (sq & 0x88) === 0. This makes
 * off-board detection a single AND — the main reason 0x88 move generation
 * is fast without full bitboards.
 *
 * Piece encoding: 4 bits — `type | (color << 3)`.
 * Move encoding: a single 30-bit integer (see encodeMove below), which keeps
 * move lists allocation-free and cache-friendly during search.
 */

// ---------------------------------------------------------------- colors ---
export const WHITE = 0;
export const BLACK = 1;

// ------------------------------------------------------------ piece types ---
export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

const TYPE_MASK = 0b0111;

export const makePiece = (color, type) => type | (color << 3);
export const pieceType = (piece) => piece & TYPE_MASK;
export const pieceColor = (piece) => piece >> 3;
export const opposite = (color) => color ^ 1;

/** Piece letters indexed by type (uppercase). */
export const TYPE_TO_CHAR = ["", "P", "N", "B", "R", "Q", "K"];
export const CHAR_TO_TYPE = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };

// ------------------------------------------------------- square utilities ---
export const fileOf = (sq) => sq & 15;
export const rankOf = (sq) => sq >> 4;
export const onBoard = (sq) => (sq & 0x88) === 0;
export const square = (rank, file) => (rank << 4) | file;

export const FILES = "abcdefgh";

/** 0x88 square -> "e4" */
export const algebraic = (sq) => FILES[fileOf(sq)] + (rankOf(sq) + 1);

/** "e4" -> 0x88 square, or -1 when malformed. */
export function parseSquare(str) {
  if (typeof str !== "string" || str.length < 2) return -1;
  const f = str.charCodeAt(0) - 97;
  const r = str.charCodeAt(1) - 49;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return square(r, f);
}

// -------------------------------------------------------- castling rights ---
export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

/**
 * Castling-rights mask, indexed by square. After any move,
 * `rights &= MASK[from] & MASK[to]` removes exactly the rights that die when
 * a king/rook leaves its home square or a rook is captured on one.
 */
export const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0x00] = 15 & ~CASTLE_WQ; // a1
CASTLE_MASK[0x07] = 15 & ~CASTLE_WK; // h1
CASTLE_MASK[0x04] = 15 & ~(CASTLE_WK | CASTLE_WQ); // e1
CASTLE_MASK[0x70] = 15 & ~CASTLE_BQ; // a8
CASTLE_MASK[0x77] = 15 & ~CASTLE_BK; // h8
CASTLE_MASK[0x74] = 15 & ~(CASTLE_BK | CASTLE_BQ); // e8

// ------------------------------------------------------------- move flags ---
export const FLAG_CAPTURE = 1;
export const FLAG_DOUBLE = 2; // double pawn push
export const FLAG_EP = 4; // en-passant capture
export const FLAG_CASTLE = 8;
export const FLAG_PROMOTION = 16;

// ----------------------------------------------------------- move packing ---
// bits 0-6   from square
// bits 7-13  to square
// bits 14-17 moving piece (with color)
// bits 18-21 captured piece (with color, 0 = none)
// bits 22-24 promotion piece *type* (0 = none)
// bits 25-29 flags
export const encodeMove = (from, to, piece, captured = 0, promotion = 0, flags = 0) =>
  from | (to << 7) | (piece << 14) | (captured << 18) | (promotion << 22) | (flags << 25);

export const moveFrom = (m) => m & 127;
export const moveTo = (m) => (m >> 7) & 127;
export const movePiece = (m) => (m >> 14) & 15;
export const moveCaptured = (m) => (m >> 18) & 15;
export const movePromotion = (m) => (m >> 22) & 7;
export const moveFlags = (m) => (m >> 25) & 31;

const PROMO_CHARS = "..nbrq";

/** Packed move -> long algebraic UCI string ("e2e4", "e7e8q"). */
export const moveToUci = (m) =>
  algebraic(moveFrom(m)) +
  algebraic(moveTo(m)) +
  (movePromotion(m) ? PROMO_CHARS[movePromotion(m)] : "");

// -------------------------------------------------------- movement tables ---
export const KNIGHT_OFFSETS = [33, 31, 18, 14, -14, -18, -31, -33];
export const KING_OFFSETS = [17, 16, 15, 1, -1, -15, -16, -17];
export const BISHOP_DIRS = [17, 15, -15, -17];
export const ROOK_DIRS = [16, 1, -1, -16];
export const QUEEN_DIRS = [17, 16, 15, 1, -1, -15, -16, -17];

/** Pawn push direction indexed by color. */
export const PAWN_PUSH = [16, -16];
/** Offsets from a pawn to the squares it attacks, indexed by color. */
export const PAWN_ATTACKS = [
  [15, 17],
  [-15, -17],
];

// ------------------------------------------------------------------ misc ---
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Conventional material values in centipawns, indexed by piece type. */
export const PIECE_VALUES = [0, 100, 320, 330, 500, 900, 20000];
