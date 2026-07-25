/**
 * clock.js — A two-sided chess clock with optional Fischer increment.
 *
 * The clock is driven by requestAnimationFrame while running (smooth tenths
 * display under 10s) and uses absolute timestamps, so it never drifts even
 * if frames are dropped.
 */

export class ChessClock {
  /**
   * @param {object} callbacks
   * @param {(times:{w:number,b:number}) => void} callbacks.onTick
   * @param {(color:"w"|"b") => void} callbacks.onFlag
   * @param {(color:"w"|"b") => void} [callbacks.onLowTime] fired once <10s
   */
  constructor({ onTick, onFlag, onLowTime }) {
    this.onTick = onTick;
    this.onFlag = onFlag;
    this.onLowTime = onLowTime;
    this.reset(0, 0);
  }

  /** @param {number} initialMs 0 disables the clock */
  reset(initialMs, incrementMs = 0) {
    this.enabled = initialMs > 0;
    this.incrementMs = incrementMs;
    this.times = { w: initialMs, b: initialMs };
    this.running = null; // "w" | "b" | null
    this.lastStamp = 0;
    this.lowTimeFired = { w: false, b: false };
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onTick?.({ ...this.times });
  }

  /** Restore a saved state. */
  restore(times, incrementMs, enabled) {
    this.enabled = enabled;
    this.incrementMs = incrementMs;
    this.times = { ...times };
    this.running = null;
    this.onTick?.({ ...this.times });
  }

  start(color) {
    if (!this.enabled) return;
    this.running = color;
    this.lastStamp = performance.now();
    if (!this.raf) this.tickLoop();
  }

  /** The running side completed a move: add increment, switch sides. */
  press() {
    if (!this.enabled || !this.running) return;
    this.applyElapsed();
    this.times[this.running] += this.incrementMs;
    this.running = this.running === "w" ? "b" : "w";
    this.lastStamp = performance.now();
    this.onTick?.({ ...this.times });
  }

  pause() {
    if (this.running) this.applyElapsed();
    this.running = null;
  }

  stop() {
    this.pause();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  applyElapsed() {
    const now = performance.now();
    this.times[this.running] = Math.max(0, this.times[this.running] - (now - this.lastStamp));
    this.lastStamp = now;
  }

  tickLoop() {
    this.raf = requestAnimationFrame(() => {
      if (this.running) {
        this.applyElapsed();
        const color = this.running;
        this.onTick?.({ ...this.times });
        if (this.times[color] < 10_000 && !this.lowTimeFired[color]) {
          this.lowTimeFired[color] = true;
          this.onLowTime?.(color);
        }
        if (this.times[color] <= 0) {
          this.running = null;
          this.onFlag?.(color);
        }
      }
      this.tickLoop();
    });
  }
}
