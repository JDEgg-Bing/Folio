import { afterEach, describe, expect, it, vi } from 'vitest';
import { StructureParsingScheduler } from '../../src/renderer/editor/StructureParsingScheduler';

afterEach(() => vi.useRealTimers());
describe('bounded structure parsing', () => {
  it('advances one slice per interval until complete without duplicate schedules', () => {
    vi.useFakeTimers(); let chunks = 0;
    const scheduler = new StructureParsingScheduler(() => chunks === 3, () => chunks++);
    scheduler.schedule(); scheduler.schedule();
    vi.advanceTimersByTime(24); expect(chunks).toBe(0);
    vi.advanceTimersByTime(1); expect(chunks).toBe(1);
    vi.runAllTimers(); expect(chunks).toBe(3); expect(vi.getTimerCount()).toBe(0);
    scheduler.destroy();
  });
  it('reads the latest document after an edit and cancels replaced editor work', () => {
    vi.useFakeTimers(); let revision = 1; const published: number[] = [];
    const old = new StructureParsingScheduler(() => false, () => published.push(revision));
    revision = 2; vi.advanceTimersByTime(25); expect(published).toEqual([2]);
    old.destroy(); revision = 3; vi.advanceTimersByTime(100); expect(published).toEqual([2]);
    const replacement = new StructureParsingScheduler(() => published.includes(3), () => published.push(revision));
    vi.runAllTimers(); expect(published).toEqual([2,3]); replacement.destroy();
  });
  it('skips stale scheduled work when the foreground parser has completed', () => {
    vi.useFakeTimers(); let complete = false; const advance = vi.fn();
    const scheduler = new StructureParsingScheduler(() => complete, advance);
    complete = true; vi.runAllTimers(); expect(advance).not.toHaveBeenCalled(); scheduler.destroy();
  });
});
