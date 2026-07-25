/**
 * perft.mjs — Engine correctness suite. Run with:  node test/perft.mjs
 *
 * 1. Perft: counts every legal move path to a fixed depth and compares with
 *    the community-verified reference numbers. Any rule bug (castling,
 *    en passant, pins, promotions…) changes these counts.
 * 2. Rule detection: checkmate, stalemate, draws.
 * 3. Notation: SAN round-trips, PGN import/export.
 */

import { Board } from "../src/engine/board.js";
import { START_FEN } from "../src/engine/constants.js";
import { loadFen, toFen } from "../src/engine/fen.js";
import { generateLegalMoves, perft } from "../src/engine/movegen.js";
import { moveToSan, sanToMove, uciToMove } from "../src/engine/notation.js";
import { exportPgn, importPgn } from "../src/engine/pgn.js";
import { gameStatus } from "../src/engine/rules.js";
import { Search } from "../src/ai/search.js";

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "\u2713" : "\u2717 FAIL"}  ${name}${ok ? "" : ` — expected ${expected}, got ${actual}`}`);
}

const board = new Board();

// ---------------------------------------------------------------- perft
console.log("\n== Perft: start position ==");
loadFen(board, START_FEN);
for (const [depth, expected] of [[1, 20], [2, 400], [3, 8902], [4, 197281]]) {
  const t0 = Date.now();
  const nodes = perft(board, depth);
  check(`perft(${depth}) [${Date.now() - t0}ms]`, nodes, expected);
}

console.log("\n== Perft: Kiwipete (castling/EP/pins torture test) ==");
loadFen(board, "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
for (const [depth, expected] of [[1, 48], [2, 2039], [3, 97862]]) {
  const t0 = Date.now();
  const nodes = perft(board, depth);
  check(`perft(${depth}) [${Date.now() - t0}ms]`, nodes, expected);
}

console.log("\n== Perft: en passant / promotion positions ==");
loadFen(board, "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"); // position 3
for (const [depth, expected] of [[1, 14], [2, 191], [3, 2812], [4, 43238]]) {
  check(`pos3 perft(${depth})`, perft(board, depth), expected);
}
loadFen(board, "n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1"); // promotion-heavy
for (const [depth, expected] of [[1, 24], [2, 496], [3, 9483]]) {
  check(`promo perft(${depth})`, perft(board, depth), expected);
}

// ------------------------------------------------------------ terminations
console.log("\n== Rule detection ==");

loadFen(board, "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
let status = gameStatus(board);
check("fool's mate is checkmate", status.reason, "checkmate");
check("fool's mate result", status.result, "0-1");

loadFen(board, "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
status = gameStatus(board);
check("stalemate detected", status.reason, "stalemate");
check("stalemate is a draw", status.result, "1/2-1/2");

loadFen(board, "8/8/8/8/8/5k2/8/5K2 w - - 0 1");
status = gameStatus(board);
check("K vs K insufficient material", status.reason, "insufficient material");

loadFen(board, "8/8/8/8/8/5k2/8/4BK2 w - - 0 1");
status = gameStatus(board);
check("K+B vs K insufficient material", status.reason, "insufficient material");

loadFen(board, "7k/8/8/8/8/8/r7/7K w - - 99 80");
// halfmove clock at 99: any quiet reply reaches 100 → draw
status = gameStatus(board);
check("not yet fifty-move draw at 99", status.over, false);
loadFen(board, "7k/8/8/8/8/8/r7/7K w - - 100 80");
status = gameStatus(board);
check("fifty-move rule at 100 halfmoves", status.reason, "fifty-move rule");

// Threefold repetition: shuffle knights back and forth from the start.
loadFen(board, START_FEN);
for (const uci of ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]) {
  const move = uciToMove(board, uci);
  if (!move || !board.makeMove(move)) {
    check(`repetition setup move ${uci} legal`, true, false);
    break;
  }
}
status = gameStatus(board);
check("threefold repetition detected", status.reason, "threefold repetition");

// Pins: the knight on d7 is absolutely pinned and must not move.
loadFen(board, "3k4/3n4/8/8/8/8/3R4/3K4 b - - 0 1");
{
  const moves = generateLegalMoves(board);
  const sans = moves.map((m) => moveToSan(board, m, moves));
  check("pinned knight cannot move", sans.some((s) => s.startsWith("N")), false);
}

// En passant is forced to resolve check? (EP capture removes the checker)
loadFen(board, "8/8/8/2k5/3Pp3/8/8/4K3 b - d3 0 1");
{
  const moves = generateLegalMoves(board);
  const hasEp = moves.some((m) => {
    const san = moveToSan(board, m, moves);
    return san.startsWith("exd3");
  });
  check("en passant capture available", hasEp, true);
}

// ---------------------------------------------------------------- notation
console.log("\n== Notation & PGN ==");

loadFen(board, START_FEN);
const sanLine = ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"];
let sanOk = true;
for (const san of sanLine) {
  const move = sanToMove(board, san);
  if (!move) {
    sanOk = false;
    console.log(`   could not parse SAN: ${san}`);
    break;
  }
  const rendered = moveToSan(board, move);
  if (rendered.replace(/[+#]/g, "") !== san) {
    sanOk = false;
    console.log(`   SAN mismatch: ${san} -> ${rendered}`);
    break;
  }
  board.makeMove(move);
}
check("SAN round-trip (Ruy Lopez line)", sanOk, true);

const pgnText = exportPgn({
  headers: { White: "Alice", Black: "Bob", Result: "*" },
  sans: sanLine,
  result: "*",
});
const reimported = importPgn(pgnText);
check("PGN round-trip move count", reimported.sans.length, sanLine.length);
check("PGN round-trip header", reimported.headers.White, "Alice");

// FEN round-trip.
const tricky = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
loadFen(board, tricky);
check("FEN round-trip", toFen(board), tricky);

// ------------------------------------------------------------------ search
console.log("\n== Search sanity ==");

// Mate in 1: the engine must find Qxf7#.
loadFen(board, "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 1");
{
  const search = new Search(board);
  const result = search.go({ maxDepth: 4, timeMs: 5000 });
  const san = moveToSan(board, result.move);
  check("finds Scholar's mate (Qxf7#)", san, "Qxf7#");
  check("reports mate score", result.mate, 1);
}

// Must escape check legally.
loadFen(board, "rnbqkbnr/ppppp1pp/8/5p1Q/8/4P3/PPPP1PPP/RNB1KBNR b KQkq - 1 2");
{
  const search = new Search(board);
  const result = search.go({ maxDepth: 3, timeMs: 3000 });
  check("responds to check with a legal move", result.move !== 0 && board.makeMove(result.move), true);
}

// ------------------------------------------------------------------ result
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
