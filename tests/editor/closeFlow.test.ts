import { describe, expect, it, vi } from 'vitest';
import { handleCloseRequest } from '../../src/renderer/app/closeFlow';

function makeFlow(overrides: Partial<Parameters<typeof handleCloseRequest>[0]> = {}) {
  const complete = vi.fn();
  const flow = {
    isDirty: () => true,
    confirm: async () => 'cancel' as const,
    save: async () => true,
    complete,
    ...overrides
  };
  return { flow, complete };
}

describe('application close flow', () => {
  it('approves close immediately for a clean document', async () => {
    const { flow, complete } = makeFlow({ isDirty: () => false });
    await handleCloseRequest(flow);
    expect(complete).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('approves close for Don’t Save', async () => {
    const { flow, complete } = makeFlow({ confirm: async () => 'discard' });
    await handleCloseRequest(flow);
    expect(complete).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('keeps the window open for Cancel', async () => {
    const { flow, complete } = makeFlow({ confirm: async () => 'cancel' });
    await handleCloseRequest(flow);
    expect(complete).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('closes after Save only when saving succeeds', async () => {
    let cleanAfterSave = false;
    const success = makeFlow({
      isDirty: () => !cleanAfterSave,
      confirm: async () => 'save',
      save: async () => { cleanAfterSave = true; return true; }
    });
    await handleCloseRequest(success.flow);
    expect(success.complete).toHaveBeenCalledExactlyOnceWith(true);

    const failure = makeFlow({ confirm: async () => 'save', save: async () => false });
    await handleCloseRequest(failure.flow);
    expect(failure.complete).toHaveBeenCalledExactlyOnceWith(false);

    const editedDuringSave = makeFlow({
      confirm: async () => 'save',
      save: async () => true,
      isDirty: () => true
    });
    await handleCloseRequest(editedDuringSave.flow);
    expect(editedDuringSave.complete).toHaveBeenCalledExactlyOnceWith(false);
  });
});
