/** Explicit navigation owns the reading position until the next user movement.
 * Programmatic scrolling and preview measurements must not undo a TOC click. */
export class ReadingTracker {
  private target: number | null = null;
  jump(position: number): number { this.target = position; return position; }
  userMoved(): void { this.target = null; }
  position(measured: number): number { return this.target ?? measured; }
}
