import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const original = readFileSync('manifest.yml', 'utf8');
const identity = /^ {2}id: ari:cloud:ecosystem::app\/([^\s]+)$/m;
const sourceId = original.match(identity)?.[1] ?? '';
if (!sourceId) throw new Error('Fixture manifest is missing its app identity.');
const exampleJudgeId = '11111111-2222-4333-8444-555555555555';
const check = (id: string, option = '--check') =>
  spawnSync('bash', ['scripts/judge-build.sh', option], {
    encoding: 'utf8',
    env: { ...process.env, JUDGE_APP_ID: id },
  });

describe('judge build manifest preflight', () => {
  it('prints a manifest with only the judge app identity changed', () => {
    const result = check(exampleJudgeId);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(original.replace(identity, `  id: ari:cloud:ecosystem::app/${exampleJudgeId}`));
  });

  it('rejects empty, malformed, or working app identities before building', () => {
    for (const id of ['', 'missing/uuid', sourceId, sourceId.toUpperCase()]) {
      const result = check(id);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/JUDGE_APP_ID/);
    }
  });

  it('does not deploy for an unsupported argument', () => {
    const result = check(exampleJudgeId, '--unknown');
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Usage:/);
  });
});
