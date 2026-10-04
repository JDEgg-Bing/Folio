/** Timers retain no document snapshot. Each slice reads the adapter's current state;
 * replacing/destroying the editor cancels pending work instead of publishing stale data. */
export class StructureParsingScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  constructor(private readonly complete: () => boolean, private readonly advance: () => void) { this.schedule(); }
  schedule(): void {
    if (this.destroyed || this.timer !== null || this.complete()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.destroyed) return;
      if (!this.complete()) this.advance();
      this.schedule();
    }, 25);
  }
  destroy(): void { this.destroyed = true; if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }
}
