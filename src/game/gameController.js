/**
 * gameController.js — The conductor.
 *
 * Owns the live Board, the move list, undo/redo, clocks, the AI worker,
 * game modes (PvP / PvAI / AIvAI / Practice / Puzzle), draw offers,
 * resignation, save/load + autosave, PGN/FEN import-export, hints,
 * post-game analysis with blunder detection, and every view around the board.
 *
 * Threading model: the engine lives in a Web Worker. Every request carries an
 * id; results with stale ids (after undo, restart, new game) are discarded,
 * which makes cancellation trivial and race-free.
 */

import { Board } from "../engine/board.js";
import {
  FLAG_CASTLE,
  FLAG_PROMOTION,
  START_FEN,
  WHITE,
  algebraic,
  moveCaptured,
  moveFlags,
  moveFrom,
  movePromotion,
  moveTo,
  moveToUci,
  parseSquare,
  pieceType,
} from "../engine/constants.js";
import { loadFen, toFen } from "../engine/fen.js";
import { legalMovesFrom } from "../engine/movegen.js";
import { moveToSan, sanToMove, uciToMove } from "../engine/notation.js";
import { exportPgn, importPgn } from "../engine/pgn.js";
import { gameStatus } from "../engine/rules.js";
import { randomOpening } from "../ai/book.js";
import { askConfirm, askNewGame, askPromotion, showGameOver, showPgnDialog, toast } from "../ui/dialogs.js";
import { formatClock } from "../utils/helpers.js";
import { PUZZLES } from "./puzzles.js";

const DIFFICULTY = {
  easy: { label: "Easy", maxDepth: 2, timeMs: 400 },
  medium: { label: "Medium", maxDepth: 4, timeMs: 1200 },
  hard: { label: "Hard", maxDepth: 6, timeMs: 3000 },
  expert: { label: "Expert", maxDepth: 99, timeMs: 5000 },
};

const TIME_CONTROLS = {
  none: { initial: 0, increment: 0 },
  "3+2": { initial: 3 * 60_000, increment: 2000 },
  "5+0": { initial: 5 * 60_000, increment: 0 },
  "10+0": { initial: 10 * 60_000, increment: 0 },
  "15+10": { initial: 15 * 60_000, increment: 10_000 },
};

const DEFAULT_CONFIG = {
  mode: "pvai",
  difficulty: "medium",
  difficultyBlack: "medium",
  playerColor: "w",
  timeControl: "none",
  whiteName: "Player",
  blackName: "Computer",
  randomOpening: false,
  puzzleIndex: 0,
  startFen: "",
};

const AUTOSAVE_KEY = "chessmaster.autosave";
const SAVE_KEY = "chessmaster.save";

export class GameController {
  /**
   * @param {object} deps — every view + the sound manager (constructed in main.js)
   */
  constructor({ boardView, moveList, captured, engineInfo, status, evalBar, evalGraph, clock, sounds, dom }) {
    this.boardView = boardView;
    this.moveList = moveList;
    this.captured = captured;
    this.engineInfo = engineInfo;
    this.status = status;
    this.evalBar = evalBar;
    this.evalGraph = evalGraph;
    this.clock = clock;
    this.sounds = sounds;
    this.dom = dom;

    this.config = { ...DEFAULT_CONFIG };
    this.board = new Board();
    this.startFen = START_FEN;
    /** @type {Array<object>} move records (uci, san, fenAfter, …) */
    this.moves = [];
    this.redoStack = [];
    this.viewPly = -1;
    this.gameOver = null;
    this.puzzle = null;
    this.aivaiPaused = false;
    this.thinking = false;

    this.searchId = 0;
    this.evalId = 0;
    this.analysisId = 0;
    this.openingToken = 0;
    this.lastEval = { cp: 0, mate: null }; // white-positive

    this.scratch = new Board();

    this.worker = new Worker(new URL("../ai/worker.js", import.meta.url), { type: "module" });
    this.worker.onmessage = (event) => this.onWorkerMessage(event.data);
    this.worker.onerror = (event) => toast(`Engine error: ${event.message || "worker failed"}`);

    loadFen(this.board, START_FEN);
  }

  // ========================================================== game lifecycle

  async newGameDialog() {
    const config = await askNewGame(this.config, PUZZLES);
    if (config) this.startGame(config);
  }

  startGame(config) {
    this.config = { ...this.config, ...config };
    const { mode } = this.config;

    // Cancel anything in flight.
    this.searchId++;
    this.evalId++;
    this.analysisId++;
    this.openingToken++;
    this.thinking = false;
    this.aivaiPaused = false;

    this.puzzle = mode === "puzzle" ? PUZZLES[this.config.puzzleIndex] || PUZZLES[0] : null;
    this.startFen = this.puzzle?.fen || this.config.startFen || START_FEN;

    try {
      loadFen(this.board, this.startFen);
    } catch (err) {
      toast(`Invalid FEN: ${err.message}`);
      this.startFen = START_FEN;
      loadFen(this.board, this.startFen);
    }

    this.moves = [];
    this.redoStack = [];
    this.viewPly = -1;
    this.gameOver = null;
    this.lastEval = { cp: 0, mate: null };

    // Orientation: the human (or the puzzle solver) sits at the bottom.
    let flipped = false;
    if ((mode === "pvai" || mode === "practice") && this.config.playerColor === "b") flipped = true;
    if (mode === "puzzle") flipped = this.board.turn !== WHITE;
    if (this.boardView.flipped !== flipped) this.boardView.flipped = flipped;
    this.boardView.applyOrientation();
    this.boardView.clearArrows();

    // Clock.
    const tc = TIME_CONTROLS[this.config.timeControl] || TIME_CONTROLS.none;
    const clockOn = tc.initial > 0 && mode !== "puzzle" && mode !== "aivai";
    this.clock.reset(clockOn ? tc.initial : 0, tc.increment);

    this.engineInfo.reset();
    this.evalBar.set(0, null);
    this.evalGraph.setData([]);

    this.renderAll();
    this.persistAutosave();

    if (mode === "puzzle") {
      this.status.set(`${this.puzzle.name} — ${this.puzzle.description}`, "info");
      toast(this.puzzle.description);
      return;
    }

    if (
      this.config.randomOpening &&
      this.startFen === START_FEN &&
      (mode === "pvai" || mode === "practice" || mode === "aivai")
    ) {
      this.playRandomOpening();
      return;
    }

    if (clockOn) this.clock.start(this.turnColor());
    this.maybeRequestAi();
    this.maybeQuietEval();
  }

  restart() {
    this.startGame(this.config);
  }

  /** Auto-play a named opening line, then hand over control. */
  playRandomOpening() {
    const opening = randomOpening();
    const token = ++this.openingToken;
    toast(`Opening: ${opening.name}`);
    const step = (index) => {
      if (token !== this.openingToken) return;
      if (index >= opening.moves.length) {
        if (this.clock.enabled) this.clock.start(this.turnColor());
        this.maybeRequestAi();
        this.maybeQuietEval();
        return;
      }
      const move = uciToMove(this.board, opening.moves[index]);
      if (!move) return; // defensive: never happens for book lines
      this.commitMove(move, { suppressFollowUp: true });
      setTimeout(() => step(index + 1), 350);
    };
    step(0);
  }

  // ================================================================ helpers

  turnColor() {
    return this.board.turn === WHITE ? "w" : "b";
  }

  isLive() {
    return this.viewPly === this.moves.length - 1;
  }

  fenAt(ply) {
    return ply < 0 ? this.startFen : this.moves[ply].fenAfter;
  }

  isAiColor(color) {
    const { mode, playerColor } = this.config;
    if (mode === "aivai") return true;
    if (mode === "pvai" || mode === "practice") return color !== playerColor;
    return false;
  }

  humanCanMoveNow() {
    if (this.gameOver || this.thinking || !this.isLive()) return false;
    if (this.config.mode === "puzzle") return true;
    return !this.isAiColor(this.turnColor());
  }

  playerName(color) {
    const { mode, whiteName, blackName, difficulty, difficultyBlack } = this.config;
    if (this.isAiColor(color)) {
      const diff = color === "b" && mode === "aivai" ? difficultyBlack : difficulty;
      return `Bot (${DIFFICULTY[diff].label})`;
    }
    return color === "w" ? whiteName : blackName;
  }

  // ============================================================= user input

  /** BoardView callback: legal target squares from a square. */
  getLegalTargets(fromSquare) {
    if (!this.humanCanMoveNow()) return [];
    const from = parseSquare(fromSquare);
    return legalMovesFrom(this.board, from).map((m) => algebraic(moveTo(m)));
  }

  /** BoardView callback: may the user pick up the piece on this square? */
  canPickUp(square) {
    if (!this.humanCanMoveNow()) return false;
    const piece = this.board.squares[parseSquare(square)];
    return !!piece && (piece >> 3 === this.board.turn);
  }

  /** BoardView callback: the user dropped/clicked a move. */
  async onUserMove(fromSquare, toSquare) {
    if (!this.humanCanMoveNow()) return;
    const from = parseSquare(fromSquare);
    const to = parseSquare(toSquare);
    const candidates = legalMovesFrom(this.board, from).filter((m) => moveTo(m) === to);
    if (candidates.length === 0) {
      this.sounds.play("illegal");
      return;
    }

    let move = candidates[0];
    if (candidates.length > 1) {
      // Promotion: four candidate moves differ only in the promotion piece.
      const choice = await askPromotion(this.turnColor());
      if (!choice) {
        this.renderPosition();
        return;
      }
      const promoType = { n: 2, b: 3, r: 4, q: 5 }[choice];
      move = candidates.find((m) => movePromotion(m) === promoType) || candidates[0];
    }

    // Puzzle mode: the move must match the solution.
    if (this.puzzle) {
      const expected = this.puzzle.solution[this.moves.length];
      if (moveToUci(move) !== expected) {
        this.sounds.play("illegal");
        toast("Not the best move — try again!");
        this.renderPosition();
        return;
      }
    }

    this.redoStack = [];
    this.commitMove(move);
  }

  // ============================================================ core commit

  /**
   * Validate-and-apply is already guaranteed (the move came from the legal
   * generator); this records, animates, sounds, updates clocks and decides
   * what happens next.
   */
  commitMove(move, { evalCp, evalMate, suppressFollowUp = false } = {}) {
    const san = moveToSan(this.board, move);
    const color = this.turnColor();
    const from = algebraic(moveFrom(move));
    const to = algebraic(moveTo(move));
    const flags = moveFlags(move);
    const capturedPiece = moveCaptured(move);

    if (!this.board.makeMove(move)) {
      // Unreachable for generator moves; guards against future bugs.
      this.sounds.play("illegal");
      return;
    }

    const record = {
      uci: moveToUci(move),
      san,
      color,
      from,
      to,
      captured: capturedPiece ? "PNBRQK"[pieceType(capturedPiece) - 1] : null,
      fenAfter: toFen(this.board),
      evalCp: evalCp ?? null,
      evalMate: evalMate ?? null,
      glyph: null,
      glyphClass: null,
    };
    this.moves.push(record);
    this.viewPly = this.moves.length - 1;

    const status = gameStatus(this.board);

    // Sounds: most specific wins; check/end layered on top.
    if (flags & FLAG_CASTLE) this.sounds.play("castle");
    else if (flags & FLAG_PROMOTION) this.sounds.play("promote");
    else if (record.captured) this.sounds.play("capture");
    else this.sounds.play("move");
    if (status.check && !status.over) this.sounds.play("check");

    this.clock.press();
    this.boardView.clearArrows();
    this.renderAll({ from, to });
    if (evalCp !== undefined || evalMate !== undefined) {
      this.setEvalFromRecord(record);
    }
    this.updateEvalGraph();
    this.persistAutosave();

    if (status.over) {
      this.endGame(status.result, status.reason);
      return;
    }

    if (suppressFollowUp) return;

    // Puzzle: auto-play the opponent's reply, or celebrate.
    if (this.puzzle) {
      if (this.moves.length >= this.puzzle.solution.length) {
        this.sounds.play("gameEnd");
        showGameOver(
          { title: "Puzzle solved!", subtitle: this.puzzle.name },
          { onRematch: () => this.restart(), onAnalyze: () => this.analyzeGame() },
        );
        return;
      }
      if (this.isLive() && !this.isPuzzleSolverTurn()) {
        const reply = uciToMove(this.board, this.puzzle.solution[this.moves.length]);
        if (reply) setTimeout(() => this.commitMove(reply), 450);
      }
      return;
    }

    this.maybeRequestAi();
    this.maybeQuietEval();
  }

  isPuzzleSolverTurn() {
    // The solver moves on even plies of the solution (0-based).
    return this.moves.length % 2 === 0;
  }

  endGame(result, reason) {
    this.gameOver = { result, reason };
    this.clock.pause();
    this.thinking = false;
    this.engineInfo.setThinking(false);
    this.sounds.play("gameEnd");
    this.renderStatus();
    this.persistAutosave();

    const titles = {
      "1-0": `${this.playerName("w")} wins`,
      "0-1": `${this.playerName("b")} wins`,
      "1/2-1/2": "Draw",
    };
    showGameOver(
      { title: titles[result] || "Game over", subtitle: `by ${reason} · ${result}` },
      { onRematch: () => this.restart(), onAnalyze: () => this.analyzeGame() },
    );
  }

  // ================================================================= the AI

  difficultyFor(color) {
    const key = color === "b" && this.config.mode === "aivai"
      ? this.config.difficultyBlack
      : this.config.difficulty;
    return DIFFICULTY[key] || DIFFICULTY.medium;
  }

  maybeRequestAi() {
    if (this.gameOver || this.puzzle || !this.isLive()) return;
    if (!this.isAiColor(this.turnColor())) return;
    if (this.config.mode === "aivai" && this.aivaiPaused) return;
    this.requestAiMove();
  }

  requestAiMove() {
    const color = this.turnColor();
    const diff = this.difficultyFor(color);
    const id = ++this.searchId;
    this.thinking = true;
    this.engineInfo.setThinking(true, `Thinking… (${diff.label}, depth ≤ ${diff.maxDepth === 99 ? "∞" : diff.maxDepth})`);
    this.renderPlayerBars();

    this.worker.postMessage({
      id,
      type: "search",
      startFen: this.startFen,
      uciMoves: this.moves.map((m) => m.uci),
      maxDepth: diff.maxDepth,
      timeMs: diff.timeMs,
      useBook: true,
    });
  }

  onWorkerMessage(msg) {
    // ---- game search --------------------------------------------------
    if (msg.id === this.searchId) {
      if (msg.type === "info") {
        this.engineInfo.update(msg);
        this.setEvalWhitePositive(msg.scoreCp, msg.mate, this.turnColor());
        return;
      }
      if (msg.type === "error") {
        this.thinking = false;
        this.engineInfo.setThinking(false);
        toast(msg.message);
        return;
      }
      if (msg.type === "result") {
        this.thinking = false;
        this.engineInfo.setThinking(false);
        this.engineInfo.update(msg);
        const move = uciToMove(this.board, msg.uci);
        if (!move) return; // stale (position changed) — id check makes this rare
        const color = this.turnColor();
        const whiteCp = msg.fromBook ? null : this.toWhitePositive(msg.scoreCp, msg.mate, color);
        this.commitMove(move, {
          evalCp: whiteCp?.cp ?? null,
          evalMate: whiteCp?.mate ?? null,
        });
        // Keep AIvAI flowing.
        if (this.config.mode === "aivai" && !this.gameOver && !this.aivaiPaused) {
          setTimeout(() => this.maybeRequestAi(), 320);
        }
        return;
      }
    }

    // ---- quiet evaluation (eval bar after human moves) -----------------
    if (msg.id === this.evalId && msg.type === "result") {
      const ply = this.evalPly;
      if (ply === this.moves.length - 1 && !this.thinking) {
        const color = this.turnColor();
        const white = this.toWhitePositive(msg.scoreCp, msg.mate, color);
        this.lastEval = white;
        this.evalBar.set(white.cp, white.mate);
        if (ply >= 0) {
          this.moves[ply].evalCp = white.cp;
          this.moves[ply].evalMate = white.mate;
          this.updateEvalGraph();
        }
      }
      return;
    }

    // ---- analysis ------------------------------------------------------
    if (msg.id === this.analysisId && msg.type === "result") {
      this.analysisResolve?.(msg);
    }
  }

  /** Convert a side-to-move score into white-positive {cp, mate}. */
  toWhitePositive(scoreCp, mate, sideToMove) {
    if (mate !== null && mate !== undefined) {
      return { cp: null, mate: sideToMove === "w" ? mate : -mate };
    }
    return { cp: sideToMove === "w" ? (scoreCp ?? 0) : -(scoreCp ?? 0), mate: null };
  }

  setEvalWhitePositive(scoreCp, mate, sideToMove) {
    this.lastEval = this.toWhitePositive(scoreCp, mate, sideToMove);
    this.evalBar.set(this.lastEval.cp, this.lastEval.mate);
  }

  setEvalFromRecord(record) {
    if (record.evalCp !== null || record.evalMate !== null) {
      this.lastEval = { cp: record.evalCp, mate: record.evalMate };
      this.evalBar.set(record.evalCp, record.evalMate);
    }
  }

  /** Cheap background eval so the bar/graph track human moves too. */
  maybeQuietEval() {
    if (this.gameOver || this.thinking) return;
    const id = ++this.evalId;
    this.evalPly = this.moves.length - 1;
    this.worker.postMessage({
      id,
      type: "eval",
      startFen: this.startFen,
      uciMoves: this.moves.map((m) => m.uci),
      timeMs: 300,
      maxDepth: 10,
    });
  }

  /** Practice-mode hint: ask the engine, then draw an arrow. */
  async hint() {
    if (!this.humanCanMoveNow()) return;
    const id = ++this.analysisId;
    this.engineInfo.setThinking(true, "Finding a hint…");
    const result = await new Promise((resolve) => {
      this.analysisResolve = resolve;
      this.worker.postMessage({
        id,
        type: "eval",
        startFen: this.startFen,
        uciMoves: this.moves.map((m) => m.uci),
        timeMs: 900,
        maxDepth: 12,
      });
    });
    this.engineInfo.setThinking(false);
    if (id !== this.analysisId || !result.bestUci) return;
    this.boardView.clearArrows();
    this.boardView.drawArrow(result.bestUci.slice(0, 2), result.bestUci.slice(2, 4));
    toast(`Hint: ${result.bestSan}`);
  }

  toggleAivaiPause() {
    if (this.config.mode !== "aivai") return;
    this.aivaiPaused = !this.aivaiPaused;
    toast(this.aivaiPaused ? "AI vs AI paused" : "AI vs AI resumed");
    if (!this.aivaiPaused) this.maybeRequestAi();
  }

  // ============================================================== undo/redo

  rebuildBoard() {
    loadFen(this.board, this.startFen);
    for (const record of this.moves) {
      const move = uciToMove(this.board, record.uci);
      this.board.makeMove(move);
    }
  }

  cancelSearch() {
    this.searchId++;
    this.thinking = false;
    this.engineInfo.setThinking(false);
  }

  undo() {
    if (this.moves.length === 0) return;
    this.cancelSearch();
    this.openingToken++;
    if (this.config.mode === "aivai") this.aivaiPaused = true;

    const popOne = () => this.redoStack.push(this.moves.pop());
    popOne();
    // In human-vs-AI modes keep popping until it's the human's turn again.
    const solverSideOk = () =>
      this.puzzle ? this.isPuzzleSolverTurn() : !this.isAiColor(this.moves.length % 2 === 0 ? this.startColor() : this.otherColor(this.startColor()));
    void solverSideOk;
    if (this.config.mode === "pvai" || this.config.mode === "practice" || this.puzzle) {
      this.rebuildBoard();
      const humanTurn = this.puzzle
        ? this.isPuzzleSolverTurn()
        : !this.isAiColor(this.turnColor());
      if (!humanTurn && this.moves.length > 0) popOne();
    }

    this.afterHistoryChange();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.cancelSearch();
    const apply = () => {
      const record = this.redoStack.pop();
      const move = uciToMove(this.board, record.uci);
      if (move) this.commitMove(move, { suppressFollowUp: true, evalCp: record.evalCp, evalMate: record.evalMate });
    };
    apply();
    // Replay the AI's reply too, so the human is back on move.
    if (
      (this.config.mode === "pvai" || this.config.mode === "practice" || this.puzzle) &&
      this.redoStack.length > 0 &&
      (this.puzzle ? !this.isPuzzleSolverTurn() : this.isAiColor(this.turnColor()))
    ) {
      apply();
    }
    this.afterHistoryChange();
  }

  startColor() {
    return this.startFen.split(" ")[1] === "b" ? "b" : "w";
  }

  otherColor(color) {
    return color === "w" ? "b" : "w";
  }

  afterHistoryChange() {
    this.rebuildBoard();
    this.viewPly = this.moves.length - 1;
    this.gameOver = null;
    if (this.clock.enabled) this.clock.start(this.turnColor());
    this.boardView.clearArrows();
    this.renderAll();
    this.updateEvalGraph();
    this.persistAutosave();
    this.maybeQuietEval();
  }

  // ======================================================== history browsing

  jumpTo(ply) {
    this.viewPly = Math.max(-1, Math.min(ply, this.moves.length - 1));
    this.renderPosition();
    this.renderMoveList();
    this.renderStatus();
    this.renderCaptured();
  }

  stepBack() {
    this.jumpTo(this.viewPly - 1);
  }

  stepForward() {
    this.jumpTo(this.viewPly + 1);
  }

  jumpStart() {
    this.jumpTo(-1);
  }

  jumpEnd() {
    this.jumpTo(this.moves.length - 1);
  }

  // ============================================================ draw/resign

  async offerDraw() {
    if (this.gameOver || this.config.mode === "aivai" || this.puzzle) return;
    if (this.config.mode === "pvp") {
      const offerer = this.playerName(this.turnColor());
      const receiver = this.playerName(this.otherColor(this.turnColor()));
      const accepted = await askConfirm(
        "Draw offer",
        `${offerer} offers a draw. ${receiver}, do you accept?`,
      );
      if (accepted) this.endGame("1/2-1/2", "agreement");
      else toast("Draw declined");
      return;
    }
    // Against the AI: it accepts when it is clearly worse.
    const aiColor = this.otherColor(this.config.playerColor);
    const aiEval =
      this.lastEval.mate !== null
        ? (this.lastEval.mate > 0 ? 1 : -1) * (aiColor === "w" ? 10_000 : -10_000)
        : (aiColor === "w" ? 1 : -1) * (this.lastEval.cp ?? 0);
    if (aiEval <= -120) this.endGame("1/2-1/2", "agreement");
    else toast("The computer declines your draw offer");
  }

  async resign() {
    if (this.gameOver) return;
    const color = this.config.mode === "pvai" || this.config.mode === "practice"
      ? this.config.playerColor
      : this.turnColor();
    const sure = await askConfirm("Resign", `${this.playerName(color)}, resign this game?`, "Resign", "Cancel");
    if (!sure) return;
    this.endGame(color === "w" ? "0-1" : "1-0", "resignation");
  }

  onFlag(color) {
    if (this.gameOver) return;
    // Winner on time — unless the opponent has no mating material (then draw).
    const opponentHasMaterial = this.sideHasMatingMaterial(this.otherColor(color));
    if (opponentHasMaterial) this.endGame(color === "w" ? "0-1" : "1-0", "timeout");
    else this.endGame("1/2-1/2", "timeout vs insufficient material");
  }

  sideHasMatingMaterial(color) {
    const c = color === "w" ? 0 : 1;
    let minors = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const p = this.board.squares[sq];
      if (!p || p >> 3 !== c) continue;
      const t = pieceType(p);
      if (t === 1 || t === 4 || t === 5) return true; // pawn/rook/queen
      if (t === 2 || t === 3) minors++;
    }
    return minors >= 2;
  }

  // ======================================================= analysis & graph

  updateEvalGraph() {
    const data = this.moves.map((m) => ({
      cp: m.evalCp,
      mate: m.evalMate,
      glyphClass: m.glyphClass,
    }));
    // Fill gaps by carrying the previous value so the line stays continuous.
    let last = { cp: 0, mate: null };
    for (const entry of data) {
      if (entry.cp === null && entry.mate === null) {
        entry.cp = last.cp;
        entry.mate = last.mate;
      } else {
        last = { cp: entry.cp, mate: entry.mate };
      }
    }
    this.evalGraph.setData(data);
  }

  /**
   * Post-game analysis: evaluate every position, annotate inaccuracies (?!),
   * mistakes (?) and blunders (??), and rebuild the evaluation graph.
   */
  async analyzeGame() {
    if (this.moves.length === 0) {
      toast("Nothing to analyze yet");
      return;
    }
    const id = ++this.analysisId;
    this.cancelSearch();
    toast("Analyzing game…");

    const evalAt = async (ply) => {
      const msg = await new Promise((resolve) => {
        this.analysisResolve = resolve;
        this.worker.postMessage({
          id,
          type: "eval",
          startFen: this.fenAt(ply),
          uciMoves: [],
          timeMs: 380,
          maxDepth: 12,
        });
      });
      const side = this.fenAt(ply).split(" ")[1] === "b" ? "b" : "w";
      return this.toWhitePositive(msg.scoreCp, msg.mate, side);
    };

    const evals = [];
    for (let ply = -1; ply < this.moves.length; ply++) {
      if (id !== this.analysisId) return; // cancelled
      this.status.set(`Analyzing… ${ply + 2}/${this.moves.length + 1}`, "info");
      evals.push(await evalAt(ply));
    }

    const asCp = (e) => (e.mate !== null ? (e.mate > 0 ? 1200 : -1200) : e.cp);
    for (let i = 0; i < this.moves.length; i++) {
      const record = this.moves[i];
      const before = asCp(evals[i]);
      const after = asCp(evals[i + 1]);
      const loss = record.color === "w" ? before - after : after - before;
      record.evalCp = evals[i + 1].cp;
      record.evalMate = evals[i + 1].mate;
      if (loss >= 200) {
        record.glyph = "??";
        record.glyphClass = "blunder";
      } else if (loss >= 100) {
        record.glyph = "?";
        record.glyphClass = "mistake";
      } else if (loss >= 50) {
        record.glyph = "?!";
        record.glyphClass = "inaccuracy";
      } else {
        record.glyph = null;
        record.glyphClass = null;
      }
    }

    if (id !== this.analysisId) return;
    const blunders = this.moves.filter((m) => m.glyphClass === "blunder").length;
    const mistakes = this.moves.filter((m) => m.glyphClass === "mistake").length;
    this.renderMoveList();
    this.updateEvalGraph();
    this.renderStatus();
    toast(`Analysis done — ${blunders} blunder${blunders === 1 ? "" : "s"}, ${mistakes} mistake${mistakes === 1 ? "" : "s"}`);
  }

  // ========================================================== PGN/FEN/saves

  currentPgn() {
    return exportPgn({
      headers: {
        White: this.playerName("w"),
        Black: this.playerName("b"),
        Result: this.gameOver?.result || "*",
        ...(this.startFen !== START_FEN ? { SetUp: "1", FEN: this.startFen } : {}),
        ...(this.gameOver ? { Termination: this.gameOver.reason } : {}),
      },
      sans: this.moves.map((m) => m.san),
      result: this.gameOver?.result || "*",
    });
  }

  currentFen() {
    return this.fenAt(this.viewPly);
  }

  openPgnTools() {
    showPgnDialog({
      pgn: this.currentPgn(),
      fen: this.currentFen(),
      onImportPgn: (text) => this.importPgnText(text),
      onImportFen: (fen) => {
        loadFen(this.scratch, fen); // validate before committing
        this.startGame({ ...this.config, mode: this.config.mode === "puzzle" ? "pvp" : this.config.mode, startFen: fen, randomOpening: false });
        toast("Position loaded from FEN");
      },
    });
  }

  importPgnText(text) {
    const { headers, sans, result } = importPgn(text);
    const startFen = headers.FEN || "";
    this.startGame({
      ...this.config,
      mode: "pvp",
      whiteName: headers.White || "White",
      blackName: headers.Black || "Black",
      startFen,
      randomOpening: false,
      timeControl: "none",
    });
    for (const san of sans) {
      const move = sanToMove(this.board, san);
      if (!move) throw new Error(`Illegal or unknown move in PGN: "${san}"`);
      this.commitMove(move, { suppressFollowUp: true });
    }
    if (result && result !== "*" && !this.gameOver) {
      const reasons = { "1-0": "agreement", "0-1": "agreement", "1/2-1/2": "agreement" };
      this.gameOver = { result, reason: headers.Termination || reasons[result] || "result" };
      this.renderStatus();
    }
    toast(`Imported ${sans.length} moves`);
  }

  serialize() {
    return JSON.stringify({
      version: 1,
      config: this.config,
      startFen: this.startFen,
      uciMoves: this.moves.map((m) => m.uci),
      gameOver: this.gameOver,
      clock: {
        enabled: this.clock.enabled,
        incrementMs: this.clock.incrementMs,
        times: this.clock.times,
      },
      savedAt: Date.now(),
    });
  }

  persistAutosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, this.serialize());
    } catch {
      /* storage may be unavailable (private mode) — the game still works */
    }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, this.serialize());
      toast("Game saved");
    } catch {
      toast("Could not save (storage unavailable)");
    }
  }

  loadGame() {
    const data = localStorage.getItem(SAVE_KEY);
    if (!data) {
      toast("No saved game found");
      return;
    }
    this.restoreFrom(data);
    toast("Game loaded");
  }

  tryRestoreAutosave() {
    const data = localStorage.getItem(AUTOSAVE_KEY);
    if (!data) return false;
    try {
      const parsed = JSON.parse(data);
      if (!parsed.uciMoves?.length || parsed.gameOver) return false;
      this.restoreFrom(data);
      toast("Resumed your last game");
      return true;
    } catch {
      return false;
    }
  }

  restoreFrom(json) {
    const data = JSON.parse(json);
    this.startGame({ ...data.config, startFen: data.startFen === START_FEN ? "" : data.startFen, randomOpening: false });
    for (const uci of data.uciMoves) {
      const move = uciToMove(this.board, uci);
      if (!move) break;
      this.commitMove(move, { suppressFollowUp: true });
    }
    if (data.clock?.enabled) {
      this.clock.restore(data.clock.times, data.clock.incrementMs, true);
      if (!this.gameOver) this.clock.start(this.turnColor());
    }
    if (data.gameOver) {
      this.gameOver = data.gameOver;
      this.renderStatus();
    } else {
      this.maybeRequestAi();
      this.maybeQuietEval();
    }
  }

  exportPgnFile() {
    return { filename: "chessmaster-game.pgn", text: this.currentPgn() };
  }

  // ============================================================== rendering

  renderAll(animateMove = null) {
    this.renderPosition(animateMove);
    this.renderMoveList();
    this.renderCaptured();
    this.renderPlayerBars();
    this.renderStatus();
  }

  renderPosition(animateMove = null) {
    let grid;
    let lastMove = null;
    let checkSquare = null;

    if (this.isLive()) {
      grid = this.board.toGrid();
      const last = this.moves[this.moves.length - 1];
      if (last) lastMove = { from: last.from, to: last.to };
      if (this.board.inCheck()) checkSquare = algebraic(this.board.kings[this.board.turn]);
    } else {
      loadFen(this.scratch, this.fenAt(this.viewPly));
      grid = this.scratch.toGrid();
      const record = this.moves[this.viewPly];
      if (record) lastMove = { from: record.from, to: record.to };
      if (this.scratch.inCheck()) checkSquare = algebraic(this.scratch.kings[this.scratch.turn]);
    }

    this.boardView.setPosition(grid, animateMove);
    this.boardView.setLastMove(lastMove?.from, lastMove?.to);
    this.boardView.setCheck(checkSquare);
    this.boardView.setInteractive(!this.gameOver);
  }

  renderMoveList() {
    this.moveList.render(this.moves, this.viewPly);
    this.dom.btnUndo.disabled = this.moves.length === 0;
    this.dom.btnRedo.disabled = this.redoStack.length === 0;
  }

  renderCaptured() {
    const captured = { w: [], b: [] };
    for (let i = 0; i <= this.viewPly; i++) {
      const record = this.moves[i];
      if (record.captured) captured[record.color].push(record.captured);
    }
    const bottomColor = this.boardView.flipped ? "b" : "w";
    this.captured.els = {
      [bottomColor]: this.dom.capturedBottom,
      [this.otherColor(bottomColor)]: this.dom.capturedTop,
    };
    this.captured.render(captured);
  }

  renderPlayerBars() {
    const bottomColor = this.boardView.flipped ? "b" : "w";
    const topColor = this.otherColor(bottomColor);
    this.dom.nameBottom.textContent = this.playerName(bottomColor);
    this.dom.nameTop.textContent = this.playerName(topColor);
    this.dom.playerBottom.classList.toggle("thinking", this.thinking && this.isAiColor(bottomColor) && this.turnColor() === bottomColor);
    this.dom.playerTop.classList.toggle("thinking", this.thinking && this.isAiColor(topColor) && this.turnColor() === topColor);
    this.dom.playerBottom.classList.toggle("active", !this.gameOver && this.turnColor() === bottomColor);
    this.dom.playerTop.classList.toggle("active", !this.gameOver && this.turnColor() === topColor);
    this.renderClocks(this.clock.times);
  }

  renderClocks(times) {
    const bottomColor = this.boardView.flipped ? "b" : "w";
    const show = this.clock.enabled;
    this.dom.clockBottom.hidden = !show;
    this.dom.clockTop.hidden = !show;
    if (!show) return;
    this.dom.clockBottom.textContent = formatClock(times[bottomColor]);
    this.dom.clockTop.textContent = formatClock(times[this.otherColor(bottomColor)]);
    this.dom.clockBottom.classList.toggle("low", times[bottomColor] < 10_000);
    this.dom.clockTop.classList.toggle("low", times[this.otherColor(bottomColor)] < 10_000);
  }

  renderStatus() {
    if (this.gameOver) {
      const { result, reason } = this.gameOver;
      const text =
        result === "1/2-1/2"
          ? `Draw by ${reason} · ½–½`
          : `${this.playerName(result === "1-0" ? "w" : "b")} wins by ${reason} · ${result}`;
      this.status.set(text, "end");
      return;
    }
    if (!this.isLive()) {
      this.status.set(`Viewing move ${this.viewPly + 1} of ${this.moves.length} — press End to return`, "info");
      return;
    }
    const name = this.playerName(this.turnColor());
    if (this.board.inCheck()) {
      this.status.set(`${name} is in check!`, "check");
    } else {
      this.status.set(`${name} to move`, "info");
    }
  }

  flipBoard() {
    this.boardView.flip();
    this.renderCaptured();
    this.renderPlayerBars();
  }
}
