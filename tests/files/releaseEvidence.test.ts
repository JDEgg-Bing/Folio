import { describe, expect, it } from 'vitest';
const { validateEvidence } = require('../../scripts/release-evidence.cjs');
const build = { version: '1.2.0', asarSha256: 'a'.repeat(64), applicationSha256: 'b'.repeat(64) };
describe('Release evidence gate', () => {
  it('accepts a passing report for the tested application', () => {
    expect(validateEvidence({ result: 'PASS', build, errors: [] }, build, 'desktop').result).toBe('PASS');
  });
  it.each(['version', 'asarSha256', 'applicationSha256'])('rejects stale %s including resource-only rebuilds', key => {
    expect(() => validateEvidence({ result: 'PASS', build: { ...build, [key]: 'stale' } }, build, 'desktop')).toThrow('stale');
  });
  it('rejects legacy reports without build identity', () => {
    expect(() => validateEvidence({ result: 'PASS', version: '1.2.0' }, build, 'desktop')).toThrow();
  });
  it('rejects failed acceptance and reports with renderer errors', () => {
    expect(() => validateEvidence({ result: 'FAIL', build }, build, 'desktop')).toThrow();
    expect(() => validateEvidence({ result: 'PASS', build, errors: ['render failure'] }, build, 'desktop')).toThrow();
  });
});
