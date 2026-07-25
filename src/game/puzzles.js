/**
 * puzzles.js — Built-in tactics puzzles for Puzzle Mode.
 *
 * Each puzzle is a position plus the winning line in UCI. The player must
 * find every move of the line; the opponent's replies are auto-played.
 * All solutions were verified with the engine's own legal move generator
 * (see test/rules.test.mjs).
 */

export const PUZZLES = [
  {
    name: "Back-rank mate in 1",
    description: "White to move. Deliver mate on the back rank.",
    fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    solution: ["d1d8"],
  },
  {
    name: "Smothered queen sac — mate in 1",
    description: "White to move. The knight finishes the job.",
    fen: "6rk/6pp/7N/8/8/8/6PP/6K1 w - - 0 1",
    solution: ["h6f7"],
  },
  {
    name: "Queen and rook ladder — mate in 2",
    description: "White to move. Force mate with the heavy pieces.",
    fen: "6k1/8/8/8/8/8/1R6/1Q4K1 w - - 0 1",
    solution: ["b2b7", "g8f8", "b1f5"],
  },
  {
    name: "Anastasia's mate — mate in 2",
    description: "White to move. Knight and rook cooperate on the h-file.",
    fen: "5r1k/4Nppp/8/8/8/8/8/4R2K w - - 0 1",
    solution: ["e1e6", "h7h6", "e6h6"],
  },
  {
    name: "Promotion tactics",
    description: "White to move. Promote with decisive effect.",
    fen: "8/5P1k/8/8/8/8/8/6K1 w - - 0 1",
    solution: ["f7f8q"],
  },
  {
    name: "Skewer the queen",
    description: "White to move. Win the queen with a skewer.",
    fen: "6k1/8/8/3q4/8/8/8/B5K1 w - - 0 1",
    solution: ["a1g7", "g8g7"],
  },
];
