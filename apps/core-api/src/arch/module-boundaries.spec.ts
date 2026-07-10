import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * ArchUnit-style test (docs/03 § 3.2): module trong core-api chỉ được import
 * module khác qua public API (modules/<x>/index.ts), không import thẳng file nội bộ.
 * Test này chạy cùng unit test — vi phạm boundary là fail CI, không cần plugin lint riêng.
 */
const MODULES_DIR = resolve(__dirname, '../modules');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
}

describe('module boundaries (docs/03 § 3.2)', () => {
  const moduleNames = readdirSync(MODULES_DIR).filter((n) => statSync(join(MODULES_DIR, n)).isDirectory());

  it.each(moduleNames)('module "%s" không import file nội bộ của module khác', (moduleName) => {
    const files = walk(join(MODULES_DIR, moduleName)).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
    );
    const violations: string[] = [];

    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (!spec.startsWith('.')) continue; // package import — Nx boundary rule lo phần lib
        const target = resolve(join(file, '..'), spec);
        for (const other of moduleNames) {
          if (other === moduleName) continue;
          const otherRoot = join(MODULES_DIR, other);
          if (target.startsWith(otherRoot + '/') || target === otherRoot) {
            // hợp lệ duy nhất: trỏ đúng vào public API index của module kia
            if (target !== join(otherRoot, 'index') && target !== otherRoot) {
              violations.push(`${file.replace(MODULES_DIR, 'modules')} → ${spec}`);
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
