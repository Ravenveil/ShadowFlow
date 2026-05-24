/**
 * extractRows · Round 2.5 — markdown → typed row list.
 *
 * Coverage:
 *   1. pure prose → single text row
 *   2. fenced bash block surrounded by prose → text + bash-chip + text
 *   3. multiple fenced blocks of different languages → preserve order
 *   4. inline `$ cmd` lines (no fence) → bash-inline rows
 *   5. empty / whitespace input → []
 *   6. consecutive fences with no prose between → no spurious empty text row
 */
import { describe, it, expect } from 'vitest';
import { extractRows } from '../extractRows';

describe('extractRows', () => {
  it('returns single text row for pure prose', () => {
    const rows = extractRows('hello world\nthis is plain text');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      kind: 'text',
      body: 'hello world\nthis is plain text',
    });
  });

  it('returns empty array for empty / whitespace body', () => {
    expect(extractRows('')).toEqual([]);
    expect(extractRows('   \n\n  ')).toEqual([]);
  });

  it('extracts a fenced bash block surrounded by prose', () => {
    const body = [
      'Here is the setup:',
      '',
      '```bash',
      'npm install',
      'npm run dev',
      '```',
      '',
      'Then open browser.',
    ].join('\n');
    const rows = extractRows(body);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ kind: 'text', body: 'Here is the setup:' });
    expect(rows[1]).toMatchObject({
      kind: 'bash-chip',
      cmd: 'npm install',
      body: 'npm install\nnpm run dev',
    });
    expect(rows[2]).toEqual({ kind: 'text', body: 'Then open browser.' });
  });

  it('handles multiple fenced blocks of mixed languages in document order', () => {
    const body = [
      'First, a python script:',
      '',
      '```python',
      'print("hi")',
      '```',
      '',
      'Then run:',
      '',
      '```bash',
      'python script.py',
      '```',
      '',
      'And a JSON config:',
      '',
      '```json',
      '{"key": "value"}',
      '```',
    ].join('\n');
    const rows = extractRows(body);
    // 4 text + 3 code = 7? Actually: text, code, text, bash, text, code → 6.
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.kind)).toEqual([
      'text',
      'code-chip',
      'text',
      'bash-chip',
      'text',
      'code-chip',
    ]);
    expect((rows[1] as { lang: string }).lang).toBe('python');
    expect((rows[5] as { lang: string }).lang).toBe('json');
  });

  it('splits prose with inline `$ cmd` lines into text + bash-inline rows', () => {
    const body = [
      'Run the following:',
      '$ ls -la',
      '$ cat README.md',
      'Then check the output.',
    ].join('\n');
    const rows = extractRows(body);
    expect(rows.map((r) => r.kind)).toEqual([
      'text',
      'bash-inline',
      'bash-inline',
      'text',
    ]);
    expect((rows[1] as { cmd: string }).cmd).toBe('ls -la');
    expect((rows[2] as { cmd: string }).cmd).toBe('cat README.md');
  });

  it('does not emit spurious empty text rows between adjacent fences', () => {
    const body = [
      '```bash',
      'echo hi',
      '```',
      '```python',
      'print("yo")',
      '```',
    ].join('\n');
    const rows = extractRows(body);
    expect(rows.map((r) => r.kind)).toEqual(['bash-chip', 'code-chip']);
  });

  it('treats `sh` / `shell` / `zsh` fences as bash-chip', () => {
    const rows = extractRows('```sh\necho a\n```');
    expect(rows[0]?.kind).toBe('bash-chip');
    const rows2 = extractRows('```shell\necho b\n```');
    expect(rows2[0]?.kind).toBe('bash-chip');
    const rows3 = extractRows('```zsh\necho c\n```');
    expect(rows3[0]?.kind).toBe('bash-chip');
  });

  it('extracts `## heading` lines as section-header rows', () => {
    const body = [
      'intro paragraph',
      '',
      '## 步骤一',
      '',
      'do this thing',
      '',
      '### 子步骤',
      '',
      'detail',
    ].join('\n');
    const rows = extractRows(body);
    expect(rows.map((r) => r.kind)).toEqual([
      'text',
      'section-header',
      'text',
      'section-header',
      'text',
    ]);
    expect((rows[1] as { title: string }).title).toBe('步骤一');
    expect((rows[3] as { title: string }).title).toBe('子步骤');
  });

  it('extracts label from `title="..."` info string on bash fence', () => {
    const body = '```bash title="Run server"\nnpm start\n```';
    const rows = extractRows(body);
    expect(rows[0]).toMatchObject({
      kind: 'bash-chip',
      label: 'Run server',
      cmd: 'npm start',
    });
  });
});
