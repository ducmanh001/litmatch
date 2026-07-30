import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const MODULES_DIR = resolve(__dirname, '../modules');
const ALLOWED_ROLE_DIRECTORIES = new Set([
  'clients',
  'controllers',
  'dto',
  'entities',
  'events',
  'jobs',
  'ports',
  'redis',
  'repositories',
  'services',
  'webhooks',
]);

/**
 * Debt tương thích đã tồn tại trước gate root allowlist. Danh sách này là ratchet:
 * không cho thêm file mới và sẽ fail nếu file đã được dọn mà quên xoá exception.
 */
const LEGACY_ROOT_FILE_EXCEPTIONS = new Set([
  'auth/auth.cookies.ts',
  'calling/calling.metrics.ts',
  'discovery/nearby.constants.ts',
  'discovery/nearby.service.ts',
  'economy/economy.metrics.ts',
  'matching/matcher-wakeup.ts',
  'matching/matching.metrics.ts',
  'soul-match/soul-match.types.ts',
]);

function directoriesAt(path: string): string[] {
  return readdirSync(path).filter((name) =>
    statSync(join(path, name)).isDirectory(),
  );
}

function productionControllers(path: string): string[] {
  return readdirSync(path, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.controller.ts') &&
        !entry.name.endsWith('.controller.spec.ts'),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

function isRootProductionFile(moduleName: string, fileName: string): boolean {
  if (!fileName.endsWith('.ts') || fileName.endsWith('.spec.ts')) return false;
  return ![
    'index.ts',
    `${moduleName}.constants.ts`,
    `${moduleName}.controller.ts`,
    `${moduleName}.errors.ts`,
    `${moduleName}.module.ts`,
    `${moduleName}.service.ts`,
  ].includes(fileName);
}

describe('module layout (docs/16)', () => {
  const moduleNames = directoriesAt(MODULES_DIR);

  it.each(moduleNames)(
    'module "%s" có public index và module class',
    (name) => {
      const moduleRoot = join(MODULES_DIR, name);
      expect(existsSync(join(moduleRoot, 'index.ts'))).toBe(true);
      expect(existsSync(join(moduleRoot, `${name}.module.ts`))).toBe(true);
    },
  );

  it.each(moduleNames)(
    'module "%s" chỉ để HTTP facade chính ở root',
    (name) => {
      const moduleRoot = join(MODULES_DIR, name);
      const violations = productionControllers(moduleRoot)
        .map((file) => relative(moduleRoot, file))
        .filter((path) => {
          const parts = path.split(sep);
          if (parts.length === 1) return path !== `${name}.controller.ts`;
          return !['controllers', 'webhooks'].includes(parts[0] ?? '');
        });

      expect(violations).toEqual([]);
    },
  );

  it.each(moduleNames)(
    'module "%s" chỉ dùng folder đã có vai trò kiến trúc',
    (name) => {
      const moduleRoot = join(MODULES_DIR, name);
      const violations = directoriesAt(moduleRoot).filter(
        (directory) => !ALLOWED_ROLE_DIRECTORIES.has(directory),
      );

      expect(violations).toEqual([]);
    },
  );

  it.each(moduleNames)(
    'module "%s" không thêm production file ngoài root allowlist',
    (name) => {
      const moduleRoot = join(MODULES_DIR, name);
      const violations = readdirSync(moduleRoot)
        .filter((fileName) => isRootProductionFile(name, fileName))
        .map((fileName) => `${name}/${fileName}`)
        .filter((fileName) => !LEGACY_ROOT_FILE_EXCEPTIONS.has(fileName));

      expect(violations).toEqual([]);
    },
  );

  it('không giữ compatibility exception đã được dọn', () => {
    const staleExceptions = [...LEGACY_ROOT_FILE_EXCEPTIONS].filter(
      (fileName) => !existsSync(join(MODULES_DIR, fileName)),
    );

    expect(staleExceptions).toEqual([]);
  });

  it('counterexample: root file và role folder lạ bị từ chối', () => {
    expect(isRootProductionFile('feed', 'feed.manager.ts')).toBe(true);
    expect(ALLOWED_ROLE_DIRECTORIES.has('managers')).toBe(false);
  });
});
