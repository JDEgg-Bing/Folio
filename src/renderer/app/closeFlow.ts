export interface CloseFlow {
  isDirty(): boolean;
  confirm(): Promise<'save' | 'discard' | 'cancel'>;
  save(): Promise<boolean>;
  complete(approved: boolean): void | Promise<void>;
}

export async function handleCloseRequest(flow: CloseFlow): Promise<void> {
  if (!flow.isDirty()) {
    await flow.complete(true);
    return;
  }

  const decision = await flow.confirm();
  if (decision === 'cancel') {
    await flow.complete(false);
    return;
  }
  if (decision === 'discard') {
    await flow.complete(true);
    return;
  }
  const saved = await flow.save();
  await flow.complete(saved && !flow.isDirty());
}
