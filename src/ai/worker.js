/**
 * worker.js — The engine runs in a Web Worker (module worker).
 *
 * Keeping the search off the main thread is what makes the UI hit 60 FPS
 * while the bot thinks. The protocol is tiny and message-based:
 *
 *  -> { id, type: "search", startFen, uciMoves, maxDepth, timeMs, useBook }
 *  <- { id, type: "info",   depth, nodes, scoreCp, mate, pv (SAN[]), timeMs }
 *  <- { id, type: "result", uci, san, scoreCp, mate, depth, nodes, pv, timeMs, fromBook }
 *
 *  -> { id, type: "eval",   startFen, uciMoves, timeMs, maxDepth }
 *  <- { id, type: "result", scoreCp, mate, depth, bestUci, bestSan }
 *
 * Every reply echoes `id`; the controller ignores stale ids, which is how
 * undo / new-game safely "cancels" an in-flight search.
 */

import { Board } from "../engine/board.js";
import { START_FEN, moveToUci } from "../engine/constants.js";
import { loadFen } from "../engine/fen.js";
import { moveToSan, uciToMove } from "../engine/notation.js";
import { bookMove } from "./book.js";
import { Search } from "./search.js";

/** Rebuild a position from a start FEN plus UCI history (keeps repetition info). */
function buildBoard(startFen, uciMoves) {
  const board = new Board();
  loadFen(board, startFen || START_FEN);
  for (const uci of uciMoves || []) {
    const move = uciToMove(board, uci);
    if (!move) throw new Error(`Illegal move in history: ${uci}`);
    board.makeMove(move);
  }
  return board;
}

/** Convert a PV of packed moves into SAN, replaying on a scratch board. */
function pvToSan(board, pv) {
  const sans = [];
  let made = 0;
  for (const move of pv) {
    sans.push(moveToSan(board, move));
    if (!board.makeMove(move)) break;
    made++;
  }
  while (made--) board.unmakeMove();
  return sans;
}

const normalizeScore = (result) => ({
  scoreCp: result.mate === null ? result.score : null,
  mate: result.mate,
});

self.onmessage = (event) => {
  const msg = event.data;
  try {
    if (msg.type === "search") handleSearch(msg);
    else if (msg.type === "eval") handleEval(msg);
  } catch (err) {
    self.postMessage({ id: msg.id, type: "error", message: String(err?.message || err) });
  }
};

function handleSearch(msg) {
  const board = buildBoard(msg.startFen, msg.uciMoves);

  // Opening book (only from the standard initial position).
  if (msg.useBook && (!msg.startFen || msg.startFen === START_FEN)) {
    const uci = bookMove(msg.uciMoves || []);
    if (uci) {
      const move = uciToMove(board, uci);
      if (move) {
        self.postMessage({
          id: msg.id,
          type: "result",
          uci,
          san: moveToSan(board, move),
          scoreCp: 0,
          mate: null,
          depth: 0,
          nodes: 0,
          pv: [],
          timeMs: 0,
          fromBook: true,
        });
        return;
      }
    }
  }

  const search = new Search(board);
  const result = search.go({
    maxDepth: msg.maxDepth,
    timeMs: msg.timeMs,
    onInfo: (info) => {
      self.postMessage({
        id: msg.id,
        type: "info",
        depth: info.depth,
        nodes: info.nodes,
        ...normalizeScore(info),
        pv: pvToSan(board, info.pv),
        timeMs: info.timeMs,
      });
    },
  });

  if (!result || !result.move) {
    self.postMessage({ id: msg.id, type: "error", message: "No legal moves" });
    return;
  }

  self.postMessage({
    id: msg.id,
    type: "result",
    uci: moveToUci(result.move),
    san: moveToSan(board, result.move),
    ...normalizeScore(result),
    depth: result.depth,
    nodes: result.nodes,
    pv: pvToSan(board, result.pv),
    timeMs: result.timeMs,
    fromBook: false,
  });
}

function handleEval(msg) {
  const board = buildBoard(msg.startFen, msg.uciMoves);
  const search = new Search(board);
  const result = search.go({ maxDepth: msg.maxDepth ?? 12, timeMs: msg.timeMs ?? 350 });
  if (!result) {
    self.postMessage({ id: msg.id, type: "result", scoreCp: 0, mate: null, depth: 0 });
    return;
  }
  self.postMessage({
    id: msg.id,
    type: "result",
    ...normalizeScore(result),
    depth: result.depth,
    bestUci: result.move ? moveToUci(result.move) : null,
    bestSan: result.move ? moveToSan(board, result.move) : null,
  });
}
