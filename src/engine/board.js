/**
 * board.js — Mutable position with legal make/unmake.
 *
 * The Board owns every piece of state a chess position needs:
 * squares, side to move, castling rights, en-passant square, the two clocks,
 * king locations, the incremental Zobrist key, and the stacks required to
 * unmake moves and to detect repetitions.
 *
 * makeMove() applies a *pseudo-legal* move and returns false (after fully
 * restoring the position) when it would leave the mover's king in check.
 * This is how pins, discovered checks and "king may never move into check"
 * are enforced: illegal moves simply cannot be made.
 */

import {
  BLACK,
  CASTLE_MASK,
  EMPTY,
  FLAG_CASTLE,
  FLAG_DOUBLE,
  FLAG_EP,
  KING,
  KING_OFFSETS,
  KNIGHT,
  KNIGHT_OFFSETS,
  BISHOP,
  BISHOP_DIRS,
  ROOK,
  ROOK_DIRS,
  QUEEN,
  PAWN,
  PAWN_PUSH,
  WHITE,
  fileOf,
  makePiece,
  moveCaptured,
  moveFlags,
  moveFrom,
  movePiece,
  movePromotion,
  moveTo,
  onBoard,
  pieceType,
} from "./constants.js";
import {
  CASTLE_HI,
  CASTLE_LO,
  EP_HI,
  EP_LO,
  PIECE_HI,
  PIECE_LO,
  SIDE_HI,
  SIDE_LO,
  computeHash,
  pieceKeyIndex,
} from "./zobrist.js";

export class Board {
  constructor() {
    /** @type {Int8Array} 0x88 array of encoded pieces (0 = empty). */
    this.squares = new Int8Array(128);
    this.turn = WHITE;
    this.castling = 0;
    /** En-passant target square, or -1. Only set when a capture is possible. */
    this.ep = -1;
    this.halfmove = 0; // plies since last pawn move / capture (fifty-move rule)
    this.fullmove = 1;
    /** King squares indexed by color — kept in sync by make/unmake. */
    this.kings = [-1, -1];
    this.hashLo = 0;
    this.hashHi = 0;
    /** Undo records for unmakeMove. */
    this.undoStack = [];
    /** Flat [lo, hi, lo, hi, ...] history of position keys for repetitions. */
    this.keyHistory = [];
  }

  clear() {
    this.squares.fill(EMPTY);
    this.turn = WHITE;
    this.castling = 0;
    this.ep = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.kings = [-1, -1];
    this.hashLo = 0;
    this.hashHi = 0;
    this.undoStack.length = 0;
    this.keyHistory.length = 0;
  }

  /** Recompute hash + king squares from the raw board (after setup/FEN). */
  refreshDerivedState() {
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const p = this.squares[sq];
      if (pieceType(p) === KING) this.kings[p >> 3] = sq;
    }
    const { lo, hi } = computeHash(this);
    this.hashLo = lo;
    this.hashHi = hi;
    this.keyHistory.length = 0;
    this.keyHistory.push(lo, hi);
  }

  // ------------------------------------------------------------ hashing ---

  xorPiece(piece, sq) {
    const idx = pieceKeyIndex(piece, sq);
    this.hashLo ^= PIECE_LO[idx];
    this.hashHi ^= PIECE_HI[idx];
  }

  xorCastling() {
    this.hashLo ^= CASTLE_LO[this.castling];
    this.hashHi ^= CASTLE_HI[this.castling];
  }

  xorEp() {
    if (this.ep !== -1) {
      this.hashLo ^= EP_LO[fileOf(this.ep)];
      this.hashHi ^= EP_HI[fileOf(this.ep)];
    }
  }

  xorSide() {
    this.hashLo ^= SIDE_LO;
    this.hashHi ^= SIDE_HI;
  }

  // ----------------------------------------------------- attack queries ---

  /**
   * Is `sq` attacked by any piece of color `by`?
   * Scans pawn/knight/king jump tables plus the eight sliding rays.
   */
  isSquareAttacked(sq, by) {
    const squares = this.squares;

    // Pawns: a white pawn on sq-15/sq-17 attacks sq (white pawns push +16).
    if (by === WHITE) {
      let s = sq - 15;
      if (onBoard(s) && squares[s] === makePiece(WHITE, PAWN)) return true;
      s = sq - 17;
      if (onBoard(s) && squares[s] === makePiece(WHITE, PAWN)) return true;
    } else {
      let s = sq + 15;
      if (onBoard(s) && squares[s] === makePiece(BLACK, PAWN)) return true;
      s = sq + 17;
      if (onBoard(s) && squares[s] === makePiece(BLACK, PAWN)) return true;
    }

    // Knights.
    const knight = makePiece(by, KNIGHT);
    for (let i = 0; i < 8; i++) {
      const s = sq + KNIGHT_OFFSETS[i];
      if (onBoard(s) && squares[s] === knight) return true;
    }

    // King (adjacency).
    const king = makePiece(by, KING);
    for (let i = 0; i < 8; i++) {
      const s = sq + KING_OFFSETS[i];
      if (onBoard(s) && squares[s] === king) return true;
    }

    // Sliding pieces: rook/queen along ranks & files…
    for (let i = 0; i < 4; i++) {
      const dir = ROOK_DIRS[i];
      for (let s = sq + dir; onBoard(s); s += dir) {
        const p = squares[s];
        if (!p) continue;
        if (p >> 3 === by) {
          const t = pieceType(p);
          if (t === ROOK || t === QUEEN) return true;
        }
        break;
      }
    }
    // …bishop/queen along diagonals.
    for (let i = 0; i < 4; i++) {
      const dir = BISHOP_DIRS[i];
      for (let s = sq + dir; onBoard(s); s += dir) {
        const p = squares[s];
        if (!p) continue;
        if (p >> 3 === by) {
          const t = pieceType(p);
          if (t === BISHOP || t === QUEEN) return true;
        }
        break;
      }
    }
    return false;
  }

  /** Is the side `color` (default: side to move) currently in check? */
  inCheck(color = this.turn) {
    return this.isSquareAttacked(this.kings[color], color ^ 1);
  }

  // -------------------------------------------------------- make/unmake ---

  /**
   * Apply a pseudo-legal move. Returns true when legal; otherwise the move
   * is fully rolled back and false is returned.
   */
  makeMove(move) {
    const from = moveFrom(move);
    const to = moveTo(move);
    const piece = movePiece(move);
    const captured = moveCaptured(move);
    const promo = movePromotion(move);
    const flags = moveFlags(move);
    const us = this.turn;
    const them = us ^ 1;
    const squares = this.squares;

    this.undoStack.push({
      move,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
      hashLo: this.hashLo,
      hashHi: this.hashHi,
    });

    // Remove old castling/ep contributions before mutating them.
    this.xorCastling();
    this.xorEp();

    // Remove the captured piece.
    if (flags & FLAG_EP) {
      const capSq = to - PAWN_PUSH[us];
      squares[capSq] = EMPTY;
      this.xorPiece(makePiece(them, PAWN), capSq);
    } else if (captured) {
      this.xorPiece(captured, to);
    }

    // Move the piece (possibly promoting).
    squares[from] = EMPTY;
    this.xorPiece(piece, from);
    const placed = promo ? makePiece(us, promo) : piece;
    squares[to] = placed;
    this.xorPiece(placed, to);

    // Castling: also move the rook.
    if (flags & FLAG_CASTLE) {
      const rook = makePiece(us, ROOK);
      let rookFrom;
      let rookTo;
      if (to > from) {
        rookFrom = to + 1; // h-file
        rookTo = to - 1; // f-file
      } else {
        rookFrom = to - 2; // a-file
        rookTo = to + 1; // d-file
      }
      squares[rookFrom] = EMPTY;
      squares[rookTo] = rook;
      this.xorPiece(rook, rookFrom);
      this.xorPiece(rook, rookTo);
    }

    if (pieceType(piece) === KING) this.kings[us] = to;

    // Castling rights decay when kings/rooks move or rooks are captured.
    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];

    // En-passant target: only record it when an enemy pawn can actually
    // capture (keeps repetition detection and FEN output exact).
    this.ep = -1;
    if (flags & FLAG_DOUBLE) {
      const epSq = from + PAWN_PUSH[us];
      const enemyPawn = makePiece(them, PAWN);
      const left = to - 1;
      const right = to + 1;
      if (
        (onBoard(left) && squares[left] === enemyPawn) ||
        (onBoard(right) && squares[right] === enemyPawn)
      ) {
        this.ep = epSq;
      }
    }

    // Fifty-move clock.
    this.halfmove =
      pieceType(piece) === PAWN || captured || flags & FLAG_EP ? 0 : this.halfmove + 1;

    if (us === BLACK) this.fullmove++;
    this.turn = them;

    // Re-add new castling/ep contributions and toggle side.
    this.xorCastling();
    this.xorEp();
    this.xorSide();

    this.keyHistory.push(this.hashLo, this.hashHi);

    // Legality: the mover's king may not be left attacked.
    if (this.isSquareAttacked(this.kings[us], them)) {
      this.unmakeMove();
      return false;
    }
    return true;
  }

  /** Undo the last move made with makeMove(). */
  unmakeMove() {
    const undo = this.undoStack.pop();
    const move = undo.move;
    const from = moveFrom(move);
    const to = moveTo(move);
    const piece = movePiece(move);
    const captured = moveCaptured(move);
    const flags = moveFlags(move);
    const squares = this.squares;

    this.turn ^= 1;
    const us = this.turn;

    squares[from] = piece;
    squares[to] = EMPTY;

    if (flags & FLAG_EP) {
      squares[to - PAWN_PUSH[us]] = makePiece(us ^ 1, PAWN);
    } else if (captured) {
      squares[to] = captured;
    }

    if (flags & FLAG_CASTLE) {
      const rook = makePiece(us, ROOK);
      if (to > from) {
        squares[to + 1] = rook;
        squares[to - 1] = EMPTY;
      } else {
        squares[to - 2] = rook;
        squares[to + 1] = EMPTY;
      }
    }

    if (pieceType(piece) === KING) this.kings[us] = from;
    if (us === BLACK) this.fullmove--;

    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    this.hashLo = undo.hashLo;
    this.hashHi = undo.hashHi;
    this.keyHistory.length -= 2;
  }

  // ----------------------------------------------------------- null move ---

  /** Pass the turn (used by null-move pruning in the search). */
  makeNullMove() {
    this.undoStack.push({
      move: 0,
      castling: this.castling,
      ep: this.ep,
      halfmove: this.halfmove,
      hashLo: this.hashLo,
      hashHi: this.hashHi,
    });
    this.xorEp();
    this.ep = -1;
    this.turn ^= 1;
    this.xorSide();
    this.keyHistory.push(this.hashLo, this.hashHi);
  }

  unmakeNullMove() {
    const undo = this.undoStack.pop();
    this.turn ^= 1;
    this.castling = undo.castling;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    this.hashLo = undo.hashLo;
    this.hashHi = undo.hashHi;
    this.keyHistory.length -= 2;
  }

  // -------------------------------------------------------------- helpers ---

  /**
   * 64-length array (a1..h8, rank-major) of piece codes like "wP"/"bK"
   * or null — the shape the UI consumes.
   */
  toGrid() {
    const grid = new Array(64).fill(null);
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = this.squares[(r << 4) | f];
        if (p) {
          grid[r * 8 + f] =
            (p >> 3 === WHITE ? "w" : "b") + "PNBRQK"[pieceType(p) - 1];
        }
      }
    }
    return grid;
  }

  /** Does `color` have any non-pawn, non-king material? (null-move guard) */
  hasNonPawnMaterial(color) {
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const p = this.squares[sq];
      if (p && p >> 3 === color) {
        const t = pieceType(p);
        if (t !== PAWN && t !== KING) return true;
      }
    }
    return false;
  }
}
