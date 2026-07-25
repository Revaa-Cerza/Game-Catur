/**
 * evalGraph.js — The evaluation graph drawn on a <canvas>.
 *
 * X axis: plies. Y axis: white-positive evaluation clamped to ±6 pawns
 * (mates pin to the edge). White's advantage fills up from the midline,
 * Black's down. Blunder plies get a red marker; clicking jumps to that move.
 */

import { clamp } from "../utils/helpers.js";

const RANGE_CP = 600;

export class EvalGraph {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(ply:number) => void} onJump
   */
  constructor(canvas, onJump) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.data = []; // { cp:number|null, mate:number|null, glyphClass?:string }
    this.onJump = onJump;

    canvas.addEventListener("click", (event) => {
      if (this.data.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const frac = (event.clientX - rect.left) / rect.width;
      const ply = clamp(Math.round(frac * (this.data.length - 1)), 0, this.data.length - 1);
      this.onJump?.(ply);
    });

    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  /** @param {{cp:number|null, mate:number|null, glyphClass?:string}[]} data per ply */
  setData(data) {
    this.data = data;
    this.draw();
  }

  valueToY(entry, height) {
    let cp;
    if (entry.mate !== null && entry.mate !== undefined) cp = entry.mate > 0 ? RANGE_CP : -RANGE_CP;
    else cp = clamp(entry.cp ?? 0, -RANGE_CP, RANGE_CP);
    return height / 2 - (cp / RANGE_CP) * (height / 2);
  }

  draw() {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const lineColor = styles.getPropertyValue("--accent").trim() || "#2783de";
    const gridColor = styles.getPropertyValue("--border").trim() || "#e6e5e3";
    const fillColor = lineColor + "33";

    // Midline.
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (this.data.length < 2) return;

    const stepX = width / (this.data.length - 1);

    // Area fill + line.
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    this.data.forEach((entry, i) => ctx.lineTo(i * stepX, this.valueToY(entry, height)));
    ctx.lineTo(width, height / 2);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.beginPath();
    this.data.forEach((entry, i) => {
      const y = this.valueToY(entry, height);
      i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * stepX, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Blunder / mistake markers.
    this.data.forEach((entry, i) => {
      if (!entry.glyphClass) return;
      ctx.beginPath();
      ctx.arc(i * stepX, this.valueToY(entry, height), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = entry.glyphClass === "blunder" ? "#e56458" : "#d5803b";
      ctx.fill();
    });
  }
}
