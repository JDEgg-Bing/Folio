import type { Text } from '@codemirror/state';
import type { SaveSnapshot } from './EditorController';

export async function writeSaveSnapshot(
  snapshot: SaveSnapshot,
  write: (text: string) => Promise<boolean>,
  markSaved: (doc: Text) => void
): Promise<boolean> {
  const succeeded = await write(snapshot.text);
  if (!succeeded) return false;
  markSaved(snapshot.doc);
  return true;
}
