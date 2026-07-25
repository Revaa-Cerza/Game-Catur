/**
 * zobrist.js — Zobrist hashing.
 *
 * Every position gets a 64-bit signature stored as two 32-bit integers
 * (JavaScript bitwise ops are 32-bit; using a lo/hi pair avoids slow BigInt
 * in the search hot path). The board XORs keys incrementally on make/unmake;
 * `computeHash` recomputes from scratch after FEN loads and in tests.
 *
 * Keys are produced by a deterministic xorshift32 PRNG so hashes are stable
 * across sessions — which lets the transposition table, repetition tracking
 * and the opening book all agree.
 */

function makeRng(seed) {
  let s = seed | 0;
  return function next() {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return s | 0;
  };
}

const rand = makeRng(0x2545f491);

const fill = (arr) => {
  for (let i = 0; i < arr.length; i++) arr[i] = rand();
  return arr;
};

/** piece (0..15) x square (0..127) */
export const PIECE_LO = fill(new Int32Array(16 * 128));
export const PIECE_HI = fill(new Int32Array(16 * 128));
/** castling rights bitmask (0..15) */
export const CASTLE_LO = fill(new Int32Array(16));
export const CASTLE_HI = fill(new Int32Array(16));
/** en-passant file (0..7) */
export const EP_LO = fill(new Int32Array(8));
export const EP_HI = fill(new Int32Array(8));
/** side to move (XORed in when black is to move) */
export const SIDE_LO = rand();
export const SIDE_HI = rand();

export const pieceKeyIndex = (piece, sq) => piece * 128 + sq;

/**
 * Full recomputation of the hash for `board`. Used when loading positions;
 * the incremental updates in Board.makeMove must always match this.
 */
export function computeHash(board) {
  let lo = 0;
  let hi = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const piece = board.squares[sq];
    if (piece) {
      const idx = pieceKeyIndex(piece, sq);
      lo ^= PIECE_LO[idx];
      hi ^= PIECE_HI[idx];
    }
  }
  lo ^= CASTLE_LO[board.castling];
  hi ^= CASTLE_HI[board.castling];
  if (board.ep !== -1) {
    lo ^= EP_LO[board.ep & 15];
    hi ^= EP_HI[board.ep & 15];
  }
  if (board.turn === 1) {
    lo ^= SIDE_LO;
    hi ^= SIDE_HI;
  }
  return { lo, hi };
}
