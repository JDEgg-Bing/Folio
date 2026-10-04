import { execFile } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { copyFile } from 'node:fs/promises';

const run = promisify(execFile);
const registry = 'HKCU\\Software\\Classes';
async function association(executable: string, install: boolean): Promise<void> {
  const key = `${registry}\\Folio.Markdown`;
  if (!install) {
    await run('reg.exe', ['delete', key, '/f'], { windowsHide: true }).catch(() => {});
    for (const extension of ['.md', '.markdown']) await run('reg.exe', ['delete', `${registry}\\${extension}\\OpenWithProgids`, '/v', 'Folio.Markdown', '/f'], { windowsHide: true }).catch(() => {});
    return;
  }
  const add = (key: string, args: string[]) => run('reg.exe', ['add', key, ...args, '/f'], { windowsHide: true });
  const update = resolve(dirname(executable), '..', 'Update.exe');
  await add(key, ['/ve', '/d', 'Folio Markdown 文稿']);
  await add(`${key}\\DefaultIcon`, ['/ve', '/d', `"${executable}",0`]);
  // Update.exe resolves the current version after an upgrade. Do not change the
  // user's default editor; register Folio as an Open With choice only.
  await add(`${key}\\shell\\open\\command`, ['/ve', '/d', `"${update}" --processStart Folio.exe --process-start-args "\\"%1\\""`]);
  for (const extension of ['.md', '.markdown']) await add(`${registry}\\${extension}\\OpenWithProgids`, ['/v', 'Folio.Markdown', '/t', 'REG_SZ', '/d', '']);
}

export async function handleInstallerEvent(event: string | undefined, executable: string): Promise<void> {
  const updater = join(dirname(executable), '..', 'Update.exe');
  const shortcut = (name: string, remove: boolean) => run(updater, [remove ? '--removeShortcut' : '--createShortcut', name], { windowsHide: true });
  if (event === '--squirrel-install' || event === '--squirrel-updated') {
    const localIcon = resolve(dirname(executable), '..', 'app.ico');
    await copyFile(join(dirname(executable), 'resources', 'folio.ico'), localIcon);
    await run('reg.exe', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\markdown_editor_v1',
      '/v', 'DisplayIcon', '/d', localIcon, '/f'], { windowsHide: true });
    await shortcut('Markdown Editor.exe', true).catch(() => {});
    await shortcut(basename(executable), false);
    await association(executable, true);
  } else if (event === '--squirrel-uninstall') {
    await shortcut(basename(executable), true);
    await shortcut('Markdown Editor.exe', true).catch(() => {});
    await association(executable, false);
  }
}

export function markdownArgument(args: readonly string[]): string | null {
  return args.find(arg => !arg.startsWith('-') && /\.(md|markdown)$/i.test(arg)) ?? null;
}
