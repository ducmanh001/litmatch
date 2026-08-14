import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assessDirectoryMirror,
  assessIndexAdapterParity,
  assessAdapterManifest,
  assessWindowsAdapterParity,
  buildAdapterManifest,
  COMPAT_INSTRUCTION_FILENAME,
  COMPAT_SKILL_DIRECTORY,
  parseGitIndexEntries,
} from './adapter-parity.mjs';

function file(identity) {
  return { kind: 'file', identity, resolvedPath: identity };
}

function symlink(identity) {
  return { kind: 'symlink', identity, resolvedPath: identity };
}

test('directory mirror phát hiện file adapter thừa và content drift', () => {
  const files = {
    'canonical:SKILL.md': 'canonical-v1',
    'adapter:SKILL.md': 'adapter-v2',
  };
  const findings = assessDirectoryMirror({
    canonicalFiles: ['SKILL.md'],
    adapterFiles: ['SKILL.md', 'references/extra.md'],
    readFile: (kind, path) => files[`${kind}:${path}`] ?? '',
  });

  assert.deepEqual(
    findings.map(({ code, path }) => ({ code, path })),
    [
      { code: 'content-drift', path: 'SKILL.md' },
      { code: 'missing-canonical', path: 'references/extra.md' },
    ],
  );
});

test('manifest tự khám phá instruction tracked/untracked và skill bắt buộc', () => {
  const trackedPaths = ['README.md', 'AGENTS.md'];
  const untrackedPaths = ['apps/web/AGENTS.md', 'apps/web/AGENTS.md'];
  const manifest = buildAdapterManifest(
    [...trackedPaths, ...untrackedPaths],
    ['adaptive-orchestration'],
  );

  assert.deepEqual(manifest, [
    {
      kind: 'skill',
      canonical: '.agents/skills/adaptive-orchestration/SKILL.md',
      adapter: `${COMPAT_SKILL_DIRECTORY}/adaptive-orchestration/SKILL.md`,
    },
    {
      kind: 'instruction',
      canonical: 'AGENTS.md',
      adapter: COMPAT_INSTRUCTION_FILENAME,
    },
    {
      kind: 'instruction',
      canonical: 'apps/web/AGENTS.md',
      adapter: `apps/web/${COMPAT_INSTRUCTION_FILENAME}`,
    },
  ]);
});

test('Git index parser giữ path có newline và chỉ lấy stage 0', () => {
  const adapterWithNewline = `apps/weird\nname/${COMPAT_INSTRUCTION_FILENAME}`;
  const entries = parseGitIndexEntries(
    '100644 abc123 0\tAGENTS.md\0' +
      `120000 def456 0\t${adapterWithNewline}\0` +
      '100644 aaa111 2\tconflicted/AGENTS.md\0',
  );

  assert.deepEqual(
    [...entries],
    [
      ['AGENTS.md', { mode: '100644', object: 'abc123' }],
      [adapterWithNewline, { mode: '120000', object: 'def456' }],
    ],
  );
});

test('adapter đúng loại và resolve về đúng canonical được tính là ready', () => {
  const manifest = buildAdapterManifest(
    ['AGENTS.md', 'apps/web/AGENTS.md'],
    ['adaptive-orchestration'],
  );
  const states = new Map([
    ['AGENTS.md', file('/repo/AGENTS.md')],
    [COMPAT_INSTRUCTION_FILENAME, symlink('/repo/AGENTS.md')],
    ['apps/web/AGENTS.md', file('/repo/apps/web/AGENTS.md')],
    [
      `apps/web/${COMPAT_INSTRUCTION_FILENAME}`,
      symlink('/repo/apps/web/AGENTS.md'),
    ],
    [
      '.agents/skills/adaptive-orchestration/SKILL.md',
      file('/repo/.agents/skills/adaptive-orchestration/SKILL.md'),
    ],
    [
      `${COMPAT_SKILL_DIRECTORY}/adaptive-orchestration/SKILL.md`,
      symlink('/repo/.agents/skills/adaptive-orchestration/SKILL.md'),
    ],
  ]);

  const report = assessAdapterManifest(
    manifest,
    (path) => states.get(path) ?? { kind: 'missing' },
  );

  assert.equal(report.ready, 3);
  assert.equal(report.total, 3);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.byKind, { instruction: 2, skill: 1 });
});

test('phát hiện adapter thiếu, trỏ sai canonical và copy thay vì symlink', () => {
  const manifest = buildAdapterManifest(
    ['AGENTS.md', 'apps/web/AGENTS.md'],
    ['adaptive-orchestration'],
  );
  const states = new Map([
    ['AGENTS.md', file('/repo/AGENTS.md')],
    [COMPAT_INSTRUCTION_FILENAME, { kind: 'missing' }],
    ['apps/web/AGENTS.md', file('/repo/apps/web/AGENTS.md')],
    [`apps/web/${COMPAT_INSTRUCTION_FILENAME}`, symlink('/repo/AGENTS.md')],
    [
      '.agents/skills/adaptive-orchestration/SKILL.md',
      file('/repo/.agents/skills/adaptive-orchestration/SKILL.md'),
    ],
    [
      `${COMPAT_SKILL_DIRECTORY}/adaptive-orchestration/SKILL.md`,
      file('/repo/.agents/skills/adaptive-orchestration/SKILL.md'),
    ],
  ]);

  const report = assessAdapterManifest(
    manifest,
    (path) => states.get(path) ?? { kind: 'missing' },
  );

  assert.equal(report.ready, 0);
  assert.equal(report.total, 3);
  assert.deepEqual(report.findings.map((finding) => finding.code).sort(), [
    'missing',
    'not-symlink',
    'wrong-target',
  ]);
  assert.match(
    report.findings.find((finding) => finding.code === 'wrong-target').message,
    /trỏ sai canonical/u,
  );
});

test('staged snapshot không cho working-tree adapter che commit thiếu hoặc trỏ sai', () => {
  const webAdapter = `apps/web/${COMPAT_INSTRUCTION_FILENAME}`;
  const entries = parseGitIndexEntries(
    [
      '100644 aaa111 0\tAGENTS.md',
      `120000 aaa112 0\t${COMPAT_INSTRUCTION_FILENAME}`,
      '100644 bbb111 0\tapps/web/AGENTS.md',
      `120000 bbb112 0\t${webAdapter}`,
      '100644 ccc111 0\t.agents/skills/adaptive-orchestration/SKILL.md',
    ].join('\0') + '\0',
  );
  const stagedLinks = new Map([
    [COMPAT_INSTRUCTION_FILENAME, 'AGENTS.md'],
    [webAdapter, '../../AGENTS.md'],
  ]);

  const report = assessIndexAdapterParity({
    indexEntries: entries,
    readSymlink: (path) => stagedLinks.get(path),
    requiredSkillNames: ['adaptive-orchestration'],
  });

  assert.equal(report.surface, 'index');
  assert.equal(report.ready, 1);
  assert.equal(report.total, 3);
  assert.deepEqual(report.findings.map((finding) => finding.code).sort(), [
    'missing',
    'wrong-target',
  ]);
});

test('Windows materialized symlink adapter must match the Git index target', () => {
  const root = mkdtempSync(join(tmpdir(), 'litmatch-adapter-parity-'));
  try {
    writeFileSync(join(root, 'AGENTS.md'), 'canonical\n');
    writeFileSync(join(root, COMPAT_INSTRUCTION_FILENAME), 'AGENTS.md\r\n');
    const entries = parseGitIndexEntries(
      `100644 aaa111 0\tAGENTS.md\0` +
        `120000 bbb222 0\t${COMPAT_INSTRUCTION_FILENAME}\0`,
    );
    const readSymlink = () => 'AGENTS.md';

    const ready = assessWindowsAdapterParity({
      root,
      repositoryPaths: ['AGENTS.md', COMPAT_INSTRUCTION_FILENAME],
      indexEntries: entries,
      readSymlink,
      requiredSkillNames: [],
    });
    assert.equal(ready.ready, 1);
    assert.deepEqual(ready.findings, []);

    writeFileSync(join(root, COMPAT_INSTRUCTION_FILENAME), 'drifted\n');
    const drifted = assessWindowsAdapterParity({
      root,
      repositoryPaths: ['AGENTS.md', COMPAT_INSTRUCTION_FILENAME],
      indexEntries: entries,
      readSymlink,
      requiredSkillNames: [],
    });
    assert.deepEqual(
      drifted.findings.map((finding) => finding.code),
      ['not-symlink'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
