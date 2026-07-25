/**
 * main.js — Application entry point.
 *
 * Builds every view, wires the DOM controls and keyboard shortcuts to the
 * GameController, restores the autosaved game (or opens the New Game dialog)
 * and starts play.
 */

import { BoardView } from "./ui/boardView.js";
import { CapturedView, EngineInfoView, EvalBarView, MoveListView, StatusView } from "./ui/panels.js";
import { ChessClock } from "./ui/clock.js";
import { EvalGraph } from "./ui/evalGraph.js";
import { initTheme, toggleTheme } from "./ui/theme.js";
import { toast } from "./ui/dialogs.js";
import { SoundManager } from "./audio/sounds.js";
import { GameController } from "./game/gameController.js";
import { downloadText } from "./utils/helpers.js";

initTheme();

const $ = (id) => document.getElementById(id);

const dom = {
  playerTop: $("player-top"),
  playerBottom: $("player-bottom"),
  nameTop: $("name-top"),
  nameBottom: $("name-bottom"),
  clockTop: $("clock-top"),
  clockBottom: $("clock-bottom"),
  capturedTop: $("captured-top"),
  capturedBottom: $("captured-bottom"),
  btnUndo: $("btn-undo"),
  btnRedo: $("btn-redo"),
};

const sounds = new SoundManager();

// --- views ------------------------------------------------------------
const boardView = new BoardView($("board-wrap"), {
  onUserMove: (from, to) => controller.onUserMove(from, to),
  getLegalTargets: (from) => controller.getLegalTargets(from),
  canPickUp: (square) => controller.canPickUp(square),
});

const moveList = new MoveListView($("move-list"), (ply) => controller.jumpTo(ply));
const captured = new CapturedView(dom.capturedBottom, dom.capturedTop);
const engineInfo = new EngineInfoView($("engine-info"));
const status = new StatusView($("status"));
const evalBar = new EvalBarView($("eval-bar"));
const evalGraph = new EvalGraph($("eval-graph"), (ply) => controller.jumpTo(ply));

/** Declared before the clock: its onTick fires during construction. */
let controller;

const clock = new ChessClock({
  onTick: (times) => controller?.renderClocks(times),
  onFlag: (color) => controller?.onFlag(color),
  onLowTime: () => sounds.play("lowTime"),
});

controller = new GameController({
  boardView,
  moveList,
  captured,
  engineInfo,
  status,
  evalBar,
  evalGraph,
  clock,
  sounds,
  dom,
});

// --- header & sidebar controls -----------------------------------------
$("btn-new").addEventListener("click", () => controller.newGameDialog());
$("btn-restart").addEventListener("click", () => controller.restart());
$("btn-flip").addEventListener("click", () => controller.flipBoard());
$("btn-undo").addEventListener("click", () => controller.undo());
$("btn-redo").addEventListener("click", () => controller.redo());
$("btn-hint").addEventListener("click", () => controller.hint());
$("btn-draw").addEventListener("click", () => controller.offerDraw());
$("btn-resign").addEventListener("click", () => controller.resign());
$("btn-analyze").addEventListener("click", () => controller.analyzeGame());
$("btn-pause").addEventListener("click", () => controller.toggleAivaiPause());
$("btn-pgn").addEventListener("click", () => controller.openPgnTools());
$("btn-save").addEventListener("click", () => controller.saveGame());
$("btn-load").addEventListener("click", () => controller.loadGame());
$("btn-export").addEventListener("click", () => {
  const { filename, text } = controller.exportPgnFile();
  downloadText(filename, text);
});

$("btn-first").addEventListener("click", () => controller.jumpStart());
$("btn-prev").addEventListener("click", () => controller.stepBack());
$("btn-next").addEventListener("click", () => controller.stepForward());
$("btn-last").addEventListener("click", () => controller.jumpEnd());

$("btn-theme").addEventListener("click", toggleTheme);
$("btn-sound").addEventListener("click", () => {
  const on = sounds.toggle();
  $("btn-sound").textContent = on ? "\uD83D\uDD0A" : "\uD83D\uDD07";
  toast(on ? "Sound on" : "Sound off");
});

// --- keyboard shortcuts --------------------------------------------------
document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select")) return;
  switch (event.key) {
    case "ArrowLeft":
      controller.stepBack();
      break;
    case "ArrowRight":
      controller.stepForward();
      break;
    case "Home":
      controller.jumpStart();
      break;
    case "End":
      controller.jumpEnd();
      break;
    case "f":
      controller.flipBoard();
      break;
    case "u":
      controller.undo();
      break;
    case "r":
      controller.redo();
      break;
    default:
      return;
  }
  event.preventDefault();
});

// --- boot ----------------------------------------------------------------
if (!controller.tryRestoreAutosave()) {
  controller.startGame(controller.config);
  controller.newGameDialog();
}
