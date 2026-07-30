import { lstatSync, realpathSync } from 'node:fs';
import { join, posix, relative } from 'node:path';

export const REQUIRED_SKILL_ADAPTERS = Object.freeze([
  'adaptive-orchestration',
  'new-module',
  'review-module',
]);

// agent-check:allow-vendor-name — đây là tên file tương thích do runtime quy định.
export const COMPAT_INSTRUCTION_FILENAME = 'CLAUDE.md';
// agent-check:allow-vendor-name — đây là thư mục tương thích do runtime quy định.
export const COMPAT_SKILL_DIRECTORY = '.claude/skills';

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//u, '');
}

export function parseGitIndexEntries(output) {
  const entries = new Map();
  for (const record of output.split('\0')) {
    if (!record) continue;
    const match =
      /^(?<mode>[0-7]{6}) (?<object>[0-9a-f]+) (?<stage>[0-3])\t(?<path>[\s\S]+)$/u.exec(
        record,
      );
    if (!match?.groups || match.groups.stage !== '0') continue;
    entries.set(normalizePath(match.groups.path), {
      mode: match.groups.mode,
      object: match.groups.object,
    });
  }
  return entries;
}

export function buildAdapterManifest(
  repositoryPaths,
  requiredSkillNames = REQUIRED_SKILL_ADAPTERS,
) {
  const canonicalInstructions = [
    ...new Set([...repositoryPaths].map(normalizePath)),
  ]
    .filter((path) => posix.basename(path) === 'AGENTS.md')
    .sort();

  const instructions = canonicalInstructions.map((canonical) => {
    const directory = posix.dirname(canonical);
    return {
      kind: 'instruction',
      canonical,
      adapter:
        directory === '.'
          ? COMPAT_INSTRUCTION_FILENAME
          : posix.join(directory, COMPAT_INSTRUCTION_FILENAME),
    };
  });

  const skills = [...new Set(requiredSkillNames)].sort().map((name) => ({
    kind: 'skill',
    canonical: posix.join('.agents/skills', name, 'SKILL.md'),
    adapter: posix.join(COMPAT_SKILL_DIRECTORY, name, 'SKILL.md'),
  }));

  return [...instructions, ...skills].sort((left, right) =>
    left.adapter < right.adapter ? -1 : left.adapter > right.adapter ? 1 : 0,
  );
}

export function assessAdapterManifest(manifest, readState) {
  const findings = [];
  let ready = 0;

  for (const mapping of manifest) {
    const canonical = readState(mapping.canonical);
    if (canonical.kind !== 'file') {
      findings.push({
        code: 'canonical-invalid',
        ...mapping,
        message: `${mapping.canonical}: nguồn canonical bị thiếu hoặc không phải file thường.`,
      });
      continue;
    }

    const adapter = readState(mapping.adapter);
    if (adapter.kind === 'missing') {
      findings.push({
        code: 'missing',
        ...mapping,
        message: `${mapping.adapter}: thiếu adapter symlink tới ${mapping.canonical}.`,
      });
      continue;
    }
    if (adapter.kind === 'broken') {
      findings.push({
        code: 'broken',
        ...mapping,
        message: `${mapping.adapter}: adapter symlink bị gãy; cần trỏ tới ${mapping.canonical}.`,
      });
      continue;
    }
    if (adapter.kind !== 'symlink') {
      findings.push({
        code: 'not-symlink',
        ...mapping,
        message: `${mapping.adapter}: adapter phải là symlink, không phải bản sao; canonical là ${mapping.canonical}.`,
      });
      continue;
    }
    if (adapter.identity !== canonical.identity) {
      findings.push({
        code: 'wrong-target',
        ...mapping,
        message: `${mapping.adapter}: trỏ sai canonical (${adapter.resolvedPath ?? 'không xác định'}); cần trỏ tới ${mapping.canonical}.`,
      });
      continue;
    }

    ready += 1;
  }

  return {
    ready,
    total: manifest.length,
    findings,
    byKind: {
      instruction: manifest.filter((item) => item.kind === 'instruction')
        .length,
      skill: manifest.filter((item) => item.kind === 'skill').length,
    },
  };
}

function filesystemState(root, path) {
  const absolute = join(root, path);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch (error) {
    return { kind: error?.code === 'ENOENT' ? 'missing' : 'unreadable' };
  }

  if (!stat.isSymbolicLink() && !stat.isFile()) return { kind: 'other' };

  let resolved;
  try {
    resolved = realpathSync(absolute);
  } catch {
    return { kind: stat.isSymbolicLink() ? 'broken' : 'unreadable' };
  }

  return {
    kind: stat.isSymbolicLink() ? 'symlink' : 'file',
    identity: resolved,
    resolvedPath: normalizePath(relative(root, resolved)),
  };
}

function indexState(path, entries, readSymlink) {
  const normalized = normalizePath(path);
  const entry = entries.get(normalized);
  if (!entry) return { kind: 'missing' };

  if (entry.mode === '120000') {
    let target;
    try {
      target = String(readSymlink(normalized));
    } catch {
      return { kind: 'broken' };
    }
    const resolvedPath = posix.isAbsolute(target)
      ? target
      : normalizePath(
          posix.normalize(posix.join(posix.dirname(normalized), target)),
        );
    return {
      kind: 'symlink',
      identity: resolvedPath,
      resolvedPath,
    };
  }

  if (entry.mode.startsWith('100')) {
    return {
      kind: 'file',
      identity: normalized,
      resolvedPath: normalized,
    };
  }
  return { kind: 'other' };
}

export function assessRepositoryAdapterParity({
  root,
  repositoryPaths,
  requiredSkillNames = REQUIRED_SKILL_ADAPTERS,
}) {
  const manifest = buildAdapterManifest(repositoryPaths, requiredSkillNames);
  return {
    ...assessAdapterManifest(manifest, (path) => filesystemState(root, path)),
    surface: 'worktree',
  };
}

export function assessIndexAdapterParity({
  indexEntries,
  readSymlink,
  requiredSkillNames = REQUIRED_SKILL_ADAPTERS,
}) {
  const manifest = buildAdapterManifest(
    indexEntries.keys(),
    requiredSkillNames,
  );
  return {
    ...assessAdapterManifest(manifest, (path) =>
      indexState(path, indexEntries, readSymlink),
    ),
    surface: 'index',
  };
}

export function adapterReadinessLine(report) {
  return (
    `Agent adapter readiness (${report.surface ?? 'fixture'}): ` +
    `${report.ready}/${report.total} canonical adapters ready ` +
    `(${report.byKind.instruction} instruction, ${report.byKind.skill} skill).`
  );
}
