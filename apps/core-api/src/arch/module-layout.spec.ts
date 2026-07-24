import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const MODULES_DIR = resolve(__dirname, '../modules');

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
});
