/**
 * search.js — The thinking part of the engine.
 *
 * Negamax formulation of minimax with:
 *  - Alpha-beta pruning + principal-variation search (zero-window re-search)
 *  - Iterative deepening with a soft time limit
 *  - Quiescence search (captures & promotions) to fix the horizon effect
 *  - Transposition table keyed by 64-bit Zobrist hashes
 *  - Move ordering: TT move, MVV-LVA captures, promotions, killers, history
 *  - Killer-move heuristic (two per ply) and history heuristic
 *  - Null-move pruning and check extensions
 *  - Repetition / fifty-move draw scores inside the tree
 *  - Triangular PV table so the best line can be shown in the UI
 */

import {
  FLAG_CAPTURE,
  FLAG_PROMOTION,
  moveCaptured,
  moveFlags,
  movePiece,
  movePromotion,
  moveTo,
  pieceType,
} from "../engine/constants.js";
import { generateMoves } from "../engine/movegen.js";
import { MATERIAL, evaluate } from "./evaluate.js";

const MAX_PLY = 64;
export const MATE = 32000;
const MATE_BOUND = MATE - MAX_PLY;
const INFINITY = 40000;

// Transposition-table entry flags.
const TT_EXACT = 0;
const TT_LOWER = 1; // fail-high: score is a lower bound
const TT_UPPER = 2; // fail-low: score is an upper bound
const TT_MAX_ENTRIES = 1 << 20;

class TimeUp extends Error {}

export class Search {
  constructor(board) {
    this.board = board;
    /** @type {Map<number, {hi:number, depth:number, score:number, flag:number, move:number}>} */
    this.tt = new Map();
    this.killers = Array.from({ length: MAX_PLY }, () => [0, 0]);
    this.history = new Int32Array(16 * 128);
    this.pv = Array.from({ length: MAX_PLY + 1 }, () => []);
    this.nodes = 0;
    this.stopped = false;
    this.deadline = Infinity;
  }

  // ------------------------------------------------------------ TT plumbing

  ttProbe() {
    const entry = this.tt.get(this.board.hashLo);
    return entry && entry.hi === this.board.hashHi ? entry : null;
  }

  ttStore(depth, score, flag, move, ply) {
    // Normalize mate scores to "mate from this node" before storing.
    if (score > MATE_BOUND) score += ply;
    else if (score < -MATE_BOUND) score -= ply;
    if (this.tt.size >= TT_MAX_ENTRIES) this.tt.clear();
    this.tt.set(this.board.hashLo, { hi: this.board.hashHi, depth, score, flag, move });
  }

  // ---------------------------------------------------------- move ordering

  scoreMove(move, ttMove, ply) {
    if (move === ttMove) return 1_000_000;
    const flags = moveFlags(move);
    if (flags & FLAG_CAPTURE) {
      // MVV-LVA: most valuable victim first, least valuable attacker breaks ties.
      const victim = MATERIAL[pieceType(moveCaptured(move))] || 100; // EP: pawn
      const attacker = MATERIAL[pieceType(movePiece(move))];
      return 100_000 + victim * 10 - attacker / 10;
    }
    if (flags & FLAG_PROMOTION) return 90_000 + MATERIAL[movePromotion(move)];
    if (this.killers[ply][0] === move) return 80_000;
    if (this.killers[ply][1] === move) return 79_000;
    return this.history[(movePiece(move) << 7) | moveTo(move)];
  }

  orderMoves(moves, ttMove, ply) {
    const scored = moves.map((m) => ({ m, s: this.scoreMove(m, ttMove, ply) }));
    scored.sort((a, b) => b.s - a.s);
    for (let i = 0; i < moves.length; i++) moves[i] = scored[i].m;
  }

  // -------------------------------------------------------------- time mgmt

  checkTime() {
    if ((this.nodes & 2047) === 0 && performance.now() >= this.deadline) {
      this.stopped = true;
      throw new TimeUp();
    }
  }

  // ------------------------------------------------------------- repetition

  /** Draw inside the tree: one prior occurrence of this key, or 50-move. */
  isDraw() {
    const board = this.board;
    if (board.halfmove >= 100) return true;
    const kh = board.keyHistory;
    const lo = board.hashLo;
    const hi = board.hashHi;
    const maxPositions = board.halfmove;
    for (let i = kh.length - 4, seen = 0; i >= 0 && seen < maxPositions; i -= 2, seen++) {
      if (kh[i] === lo && kh[i + 1] === hi) return true;
    }
    return false;
  }

  // ------------------------------------------------------------- quiescence

  qsearch(alpha, beta, ply) {
    this.nodes++;
    this.checkTime();

    const standPat = evaluate(this.board);
    if (ply >= MAX_PLY - 1) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const moves = generateMoves(this.board, true);
    this.orderMoves(moves, 0, ply);

    for (const move of moves) {
      // Delta pruning: skip captures that cannot possibly raise alpha.
      const gain = MATERIAL[pieceType(moveCaptured(move))] || 100;
      if (!(moveFlags(move) & FLAG_PROMOTION) && standPat + gain + 200 < alpha) continue;

      if (!this.board.makeMove(move)) continue;
      const score = -this.qsearch(-beta, -alpha, ply + 1);
      this.board.unmakeMove();

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  // ----------------------------------------------------------------- search

  negamax(depth, alpha, beta, ply, allowNull) {
    this.pv[ply].length = 0;
    const board = this.board;
    const isPvNode = beta - alpha > 1;

    if (ply > 0 && this.isDraw()) return 0;

    // Mate-distance pruning.
    alpha = Math.max(alpha, -MATE + ply);
    beta = Math.min(beta, MATE - ply - 1);
    if (alpha >= beta) return alpha;

    const inCheck = board.inCheck();
    if (inCheck) depth++; // check extension

    if (depth <= 0) return this.qsearch(alpha, beta, ply);

    this.nodes++;
    this.checkTime();

    // Transposition table probe.
    const entry = this.ttProbe();
    let ttMove = 0;
    if (entry) {
      ttMove = entry.move;
      if (entry.depth >= depth && ply > 0 && !isPvNode) {
        let score = entry.score;
        if (score > MATE_BOUND) score -= ply;
        else if (score < -MATE_BOUND) score += ply;
        if (entry.flag === TT_EXACT) return score;
        if (entry.flag === TT_LOWER && score >= beta) return score;
        if (entry.flag === TT_UPPER && score <= alpha) return score;
      }
    }

    // Null-move pruning: give the opponent a free move; if we still beat
    // beta the real position is almost certainly a fail-high. Disabled in
    // check and in pawn endings (zugzwang).
    if (
      allowNull &&
      !isPvNode &&
      !inCheck &&
      depth >= 3 &&
      ply > 0 &&
      board.hasNonPawnMaterial(board.turn)
    ) {
      board.makeNullMove();
      const score = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      board.unmakeNullMove();
      if (this.stopped) throw new TimeUp();
      if (score >= beta && score < MATE_BOUND) return beta;
    }

    const moves = generateMoves(board);
    this.orderMoves(moves, ttMove, ply);

    let bestScore = -INFINITY;
    let bestMove = 0;
    let flag = TT_UPPER;
    let legalCount = 0;

    for (const move of moves) {
      if (!board.makeMove(move)) continue;
      legalCount++;

      let score;
      if (legalCount === 1) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        // PVS: prove the move is worse with a null window, re-search if not.
        score = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) {
          score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
        }
      }
      board.unmakeMove();

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (score > alpha) {
        alpha = score;
        flag = TT_EXACT;
        // Extend the principal variation.
        const child = this.pv[ply + 1];
        this.pv[ply] = [move, ...child];
      }
      if (alpha >= beta) {
        flag = TT_LOWER;
        // Quiet moves that cause cutoffs: killers + history bonus.
        if (!(moveFlags(move) & FLAG_CAPTURE)) {
          const killers = this.killers[ply];
          if (killers[0] !== move) {
            killers[1] = killers[0];
            killers[0] = move;
          }
          this.history[(movePiece(move) << 7) | moveTo(move)] += depth * depth;
        }
        break;
      }
    }

    if (legalCount === 0) {
      return inCheck ? -MATE + ply : 0; // checkmate / stalemate
    }

    this.ttStore(depth, bestScore, flag, bestMove, ply);
    return bestScore;
  }

  /**
   * Iterative-deepening driver.
   * @param {object} options
   * @param {number} options.maxDepth
   * @param {number} options.timeMs — soft limit; depth 1 always completes.
   * @param {(info: object) => void} [options.onInfo] — per-iteration progress.
   * @returns {{move:number, score:number, mate:number|null, depth:number,
   *            nodes:number, timeMs:number, pv:number[]}|null}
   */
  go({ maxDepth = MAX_PLY - 1, timeMs = 2000, onInfo } = {}) {
    const start = performance.now();
    this.nodes = 0;
    this.stopped = false;
    this.deadline = start + timeMs;
    this.history.fill(0);

    let best = null;

    for (let depth = 1; depth <= Math.min(maxDepth, MAX_PLY - 1); depth++) {
      if (depth === 1) this.deadline = Infinity; // always finish depth 1
      try {
        const score = this.negamax(depth, -INFINITY, INFINITY, 0, true);
        const elapsed = performance.now() - start;
        const pv = this.pv[0].slice();
        const mate =
          score > MATE_BOUND
            ? Math.ceil((MATE - score) / 2)
            : score < -MATE_BOUND
              ? -Math.ceil((MATE + score) / 2)
              : null;
        best = {
          move: pv[0] ?? best?.move ?? 0,
          score,
          mate,
          depth,
          nodes: this.nodes,
          timeMs: Math.round(elapsed),
          pv,
        };
        onInfo?.(best);
        if (mate !== null && Math.abs(score) > MATE_BOUND) break; // mate found
      } catch (err) {
        if (err instanceof TimeUp) break;
        throw err;
      } finally {
        if (depth === 1) this.deadline = start + timeMs;
      }
      if (performance.now() - start > timeMs * 0.6) break; // next iter won't fit
    }

    if (best && !best.move) {
      // Extremely rare (instant timeout): fall back to any legal move.
      const moves = generateMoves(this.board);
      for (const m of moves) {
        if (this.board.makeMove(m)) {
          this.board.unmakeMove();
          best.move = m;
          break;
        }
      }
    }
    return best;
  }
}
