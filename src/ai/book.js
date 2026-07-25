/**
 * book.js — A compact opening book.
 *
 * The book is keyed by the space-joined UCI move history from the initial
 * position; values are the candidate replies. It covers the main lines of
 * the most common openings to ~8 plies. The engine consults it only when the
 * game actually started from the standard initial position.
 *
 * NAMED_OPENINGS powers the "random opening" feature: a full line can be
 * auto-played onto the board before play begins.
 */

export const OPENING_BOOK = {
  "": ["e2e4", "d2d4", "c2c4", "g1f3"],

  // ---- 1. e4 --------------------------------------------------------------
  "e2e4": ["e7e5", "c7c5", "e7e6", "c7c6", "g8f6"],

  // Open games
  "e2e4 e7e5": ["g1f3", "f1c4", "b1c3"],
  "e2e4 e7e5 g1f3": ["b8c6", "g8f6"],
  "e2e4 e7e5 g1f3 b8c6": ["f1b5", "f1c4", "d2d4"],
  // Ruy Lopez
  "e2e4 e7e5 g1f3 b8c6 f1b5": ["a7a6", "g8f6", "f7f5"],
  "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6": ["b5a4", "b5c6"],
  "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4": ["g8f6"],
  "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6": ["e1g1"],
  "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1": ["f8e7", "f6e4"],
  "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6": ["d7c6"],
  "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6 d7c6": ["e1g1", "d2d4"],
  // Italian
  "e2e4 e7e5 g1f3 b8c6 f1c4": ["f8c5", "g8f6"],
  "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5": ["c2c3", "d2d3", "b2b4"],
  "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3": ["g8f6"],
  "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6": ["d2d4", "d2d3"],
  "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6": ["d2d3", "f3g5", "d2d4"],
  "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3": ["f8c5", "f8e7"],
  // Petrov
  "e2e4 e7e5 g1f3 g8f6": ["f3e5", "b1c3", "d2d4"],
  "e2e4 e7e5 g1f3 g8f6 f3e5": ["d7d6"],
  "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6": ["e5f3"],
  "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3": ["f6e4"],

  // Sicilian
  "e2e4 c7c5": ["g1f3", "b1c3", "c2c3"],
  "e2e4 c7c5 g1f3": ["d7d6", "b8c6", "e7e6"],
  "e2e4 c7c5 g1f3 d7d6": ["d2d4", "f1b5"],
  "e2e4 c7c5 g1f3 d7d6 d2d4": ["c5d4"],
  "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4": ["f3d4"],
  "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4": ["g8f6"],
  "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6": ["b1c3"],
  "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3": ["a7a6", "g7g6", "b8c6"],
  "e2e4 c7c5 g1f3 b8c6": ["d2d4", "f1b5"],
  "e2e4 c7c5 g1f3 b8c6 d2d4": ["c5d4"],
  "e2e4 c7c5 g1f3 b8c6 d2d4 c5d4": ["f3d4"],
  "e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4": ["g8f6", "e7e5", "g7g6"],
  "e2e4 c7c5 g1f3 e7e6": ["d2d4"],
  "e2e4 c7c5 g1f3 e7e6 d2d4": ["c5d4"],
  "e2e4 c7c5 g1f3 e7e6 d2d4 c5d4": ["f3d4"],
  "e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4": ["a7a6", "b8c6"],

  // French
  "e2e4 e7e6": ["d2d4"],
  "e2e4 e7e6 d2d4": ["d7d5"],
  "e2e4 e7e6 d2d4 d7d5": ["b1c3", "e4e5", "b1d2", "e4d5"],
  "e2e4 e7e6 d2d4 d7d5 b1c3": ["g8f6", "f8b4"],
  "e2e4 e7e6 d2d4 d7d5 e4e5": ["c7c5"],
  "e2e4 e7e6 d2d4 d7d5 e4e5 c7c5": ["c2c3"],
  "e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3": ["b8c6"],

  // Caro-Kann
  "e2e4 c7c6": ["d2d4", "b1c3"],
  "e2e4 c7c6 d2d4": ["d7d5"],
  "e2e4 c7c6 d2d4 d7d5": ["b1c3", "e4e5", "e4d5"],
  "e2e4 c7c6 d2d4 d7d5 b1c3": ["d5e4"],
  "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4": ["c3e4"],
  "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4": ["c8f5", "b8d7"],
  "e2e4 c7c6 d2d4 d7d5 e4e5": ["c8f5"],

  // ---- 1. d4 --------------------------------------------------------------
  "d2d4": ["g8f6", "d7d5", "e7e6"],
  "d2d4 d7d5": ["c2c4", "g1f3", "c1f4"],
  // Queen's Gambit
  "d2d4 d7d5 c2c4": ["e7e6", "c7c6", "d5c4"],
  "d2d4 d7d5 c2c4 e7e6": ["b1c3", "g1f3"],
  "d2d4 d7d5 c2c4 e7e6 b1c3": ["g8f6"],
  "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6": ["c1g5", "g1f3"],
  "d2d4 d7d5 c2c4 c7c6": ["g1f3", "b1c3"],
  "d2d4 d7d5 c2c4 c7c6 g1f3": ["g8f6"],
  "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6": ["b1c3", "e2e3"],
  "d2d4 d7d5 c2c4 d5c4": ["g1f3", "e2e4"],
  "d2d4 d7d5 c2c4 d5c4 g1f3": ["g8f6"],
  // London
  "d2d4 d7d5 c1f4": ["g8f6", "c7c5"],
  "d2d4 d7d5 c1f4 g8f6": ["e2e3", "g1f3"],
  // Indian defences
  "d2d4 g8f6": ["c2c4", "g1f3", "c1f4"],
  "d2d4 g8f6 c2c4": ["e7e6", "g7g6", "c7c5"],
  "d2d4 g8f6 c2c4 e7e6": ["b1c3", "g1f3", "g2g3"],
  "d2d4 g8f6 c2c4 e7e6 b1c3": ["f8b4", "d7d5"],
  "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4": ["e2e3", "d1c2", "a2a3"],
  "d2d4 g8f6 c2c4 e7e6 g1f3": ["b7b6", "d7d5", "f8b4"],
  "d2d4 g8f6 c2c4 g7g6": ["b1c3", "g1f3"],
  "d2d4 g8f6 c2c4 g7g6 b1c3": ["f8g7", "d7d5"],
  "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7": ["e2e4", "g1f3"],
  "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4": ["d7d6"],
  "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6": ["g1f3", "f2f3"],
  "d2d4 g8f6 g1f3": ["e7e6", "g7g6", "d7d5"],

  // ---- 1. c4 / 1. Nf3 -----------------------------------------------------
  "c2c4": ["e7e5", "g8f6", "c7c5", "e7e6"],
  "c2c4 e7e5": ["b1c3", "g2g3"],
  "c2c4 e7e5 b1c3": ["g8f6", "b8c6"],
  "c2c4 e7e5 b1c3 g8f6": ["g1f3", "g2g3"],
  "c2c4 g8f6": ["b1c3", "g1f3", "d2d4"],
  "c2c4 c7c5": ["g1f3", "b1c3"],
  "g1f3": ["g8f6", "d7d5", "c7c5"],
  "g1f3 d7d5": ["d2d4", "g2g3", "c2c4"],
  "g1f3 g8f6": ["c2c4", "d2d4", "g2g3"],
  "g1f3 c7c5": ["c2c4", "e2e4", "g2g3"],
};

/**
 * Look up a book reply for the given UCI move history.
 * @param {string[]} uciHistory
 * @param {() => number} [rng] — injectable RNG for tests.
 * @returns {string|null}
 */
export function bookMove(uciHistory, rng = Math.random) {
  const candidates = OPENING_BOOK[uciHistory.join(" ")];
  if (!candidates || candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/** Full named lines for the "random opening" game option. */
export const NAMED_OPENINGS = [
  { name: "Italian Game", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "c2c3", "g8f6"] },
  { name: "Ruy Lopez, Morphy Defence", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1"] },
  { name: "Sicilian Najdorf", moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"] },
  { name: "French, Advance Variation", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "e4e5", "c7c5", "c2c3", "b8c6"] },
  { name: "Caro-Kann, Classical", moves: ["e2e4", "c7c6", "d2d4", "d7d5", "b1c3", "d5e4", "c3e4", "c8f5"] },
  { name: "Queen's Gambit Declined", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "f8e7"] },
  { name: "Slav Defence", moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "d5c4"] },
  { name: "King's Indian Defence", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "g1f3", "e8g8"] },
  { name: "Nimzo-Indian Defence", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4", "e2e3", "e8g8"] },
  { name: "London System", moves: ["d2d4", "d7d5", "c1f4", "g8f6", "e2e3", "c7c5", "c2c3", "b8c6"] },
  { name: "English Opening, Four Knights", moves: ["c2c4", "e7e5", "b1c3", "g8f6", "g1f3", "b8c6", "g2g3", "d7d5"] },
  { name: "Petrov Defence", moves: ["e2e4", "e7e5", "g1f3", "g8f6", "f3e5", "d7d6", "e5f3", "f6e4", "d2d4", "d6d5"] },
];

export function randomOpening(rng = Math.random) {
  return NAMED_OPENINGS[Math.floor(rng() * NAMED_OPENINGS.length)];
}
