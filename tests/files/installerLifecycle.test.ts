import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => [] as { executable: string; args: string[] }[]);
vi.mock('node:child_process', () => ({ execFile: (executable: string, args: string[], _options: unknown, callback: (cause: null, stdout: string, stderr: string) => void) => {
  calls.push({ executable, args }); callback(null, '', '');
} }));
vi.mock('node:fs/promises', () => ({ copyFile: vi.fn(async () => {}) }));
import { handleInstallerEvent } from '../../src/main/lifecycle';
describe('Windows install lifecycle', () => {
  beforeEach(() => { calls.length = 0; });
  it('updates shortcuts and Open With registration without changing the default editor', async () => {
    await handleInstallerEvent('--squirrel-updated', 'C:/User/My App/app-1.1.0/Folio.exe');
    expect(calls.some(c => c.args.includes('--removeShortcut') && c.args.includes('Markdown Editor.exe'))).toBe(true);
    expect(calls.some(c => c.args.includes('--createShortcut') && c.args.includes('Folio.exe'))).toBe(true);
    expect(calls.some(c => c.args.includes('DisplayIcon') && c.args.some(arg => arg.endsWith('app.ico')))).toBe(true);
    const command = calls.find(c => c.args[1]?.endsWith('shell\\open\\command'))!;
    expect(command.args.join(' ')).toContain('Update.exe');
    expect(command.args.join(' ')).toContain('--process-start-args "\\"%1\\""');
    expect(calls.filter(c => c.args[1]?.includes('OpenWithProgids'))).toHaveLength(2);
    expect(calls.some(c => /UserChoice/.test(c.args.join(' ')))).toBe(false);
    expect(calls.some(c => /^HKCU\\Software\\Classes\\\.(md|markdown)$/.test(c.args[1] ?? ''))).toBe(false);
  });
  it('uninstalls only its own associations and shortcuts, preserving data and other editors', async () => {
    await handleInstallerEvent('--squirrel-uninstall', 'C:/User/My App/app-1.1.0/Folio.exe');
    const registryCalls = calls.filter(c => c.executable === 'reg.exe');
    expect(registryCalls).toHaveLength(3);
    expect(registryCalls.every(c => c.args[0] === 'delete')).toBe(true);
    expect(registryCalls.filter(c => c.args[1].includes('OpenWithProgids')).every(c => c.args.includes('/v') && c.args.includes('Folio.Markdown'))).toBe(true);
    expect(calls.some(c => c.args.join(' ').includes('userData'))).toBe(false);
  });
});
