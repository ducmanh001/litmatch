import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  findConfigFile,
  parseJsonConfigFileContent,
  preProcessFile,
  readConfigFile,
  resolveModuleName,
  sys,
  type CompilerOptions,
} from 'typescript';

/**
 * ArchUnit-style test (docs/03 § 3.2): module trong core-api chỉ được import
 * module khác qua public API (modules/<x>/index.ts), không import thẳng file nội bộ.
 * TypeScript pre-processor cover static import/export, dynamic import và require;
 * regex đơn giản có thể bị lách bởi quote hoặc cú pháp khác.
 */
const WORKSPACE_ROOT = resolve(__dirname, '../../../..');
const MODULES_DIR = resolve(__dirname, '../modules');
const TSCONFIG_PATH = findConfigFile(
  WORKSPACE_ROOT,
  sys.fileExists,
  'tsconfig.base.json',
);
if (!TSCONFIG_PATH) throw new Error('tsconfig.base.json not found');
const TSCONFIG = readConfigFile(TSCONFIG_PATH, sys.readFile);
if (TSCONFIG.error) throw new Error('cannot read tsconfig.base.json');
const COMPILER_OPTIONS = parseJsonConfigFileContent(
  TSCONFIG.config,
  sys,
  WORKSPACE_ROOT,
).options;

/**
 * SHA-256 của danh sách deep-import edge đã sort trong từng integration fixture.
 * Snapshot ở edge-level: thêm/đổi/xoá một import đều buộc cập nhật debt có chủ đích.
 */
const LEGACY_INTEGRATION_BOUNDARY_SNAPSHOTS = new Map([
  [
    'admin/admin.integration.spec.ts',
    '685c809e62ee21c177fb9142026ab6f6217989c5692eb50c992d5057c2b301c4',
  ],
  [
    'avatar/avatar.integration.spec.ts',
    '625b105e20150f90a5939327347b5652f8423c9ea4d9286d04d9347d2a6652d9',
  ],
  [
    'calling/calling.integration.spec.ts',
    'c3c50f3bcc5733af0bb5b1f004765a274daa2f12c4fd5376332ccb5cb46d62cf',
  ],
  [
    'economy/economy.integration.spec.ts',
    '014df4344b3f90ba78220381aa29dfdef681b08a70c16a9105baf6ddb865a979',
  ],
  [
    'friend/friend.integration.spec.ts',
    'd0a3473fce26b9c8f10666f09c8dea582a8b3cb85755c3e3005dab164da1a74e',
  ],
  [
    'gift/gift.integration.spec.ts',
    '71336fc13da66158d47ab61f182b898b10aec957ae6ce6c5ab58c7b96e23d7fd',
  ],
  [
    'matching/matching.integration.spec.ts',
    '96affc9a3fe1b7362516d8a775460738e8ef9066d695136a3c60fd5d1c3403a4',
  ],
  [
    'mini-game/mini-game.integration.spec.ts',
    '51075f89cc4a022339d3d3db39bc83f053c0291db3c973844764a28f95dc46ea',
  ],
  [
    'mood/mood.integration.spec.ts',
    'b3641529f4f3576905037732f160cf6f136367a456ae4107a165f2ec1338c911',
  ],
  [
    'movie-match/movie-match.integration.spec.ts',
    '471a9254ab6d11a8877197dd2b605cb4b55be64c053ef4ee0d3bcea4c37a6e26',
  ],
  [
    'palm-match/palm-match.integration.spec.ts',
    '215a8dac19d1393826b123f02a765611c41df3ab1cf7457de2536cd914a68652',
  ],
  [
    'short-video/short-video.integration.spec.ts',
    'e352dd24a6bb3aa48327899ed7b906b0b222c75798a163f885c3c8df2631728c',
  ],
  [
    'soul-match/soul-match.integration.spec.ts',
    '53ead441f6220de6d923e3c673d03778033a226e66a1a2bc56b9863e2118c08b',
  ],
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function importSpecifiers(source: string): string[] {
  return preProcessFile(source, true, true).importedFiles.map(
    ({ fileName }) => fileName,
  );
}

function resolvedImport(
  file: string,
  specifier: string,
  compilerOptions: CompilerOptions = COMPILER_OPTIONS,
): string | undefined {
  const resolvedModule = resolveModuleName(
    specifier,
    file,
    compilerOptions,
    sys,
  ).resolvedModule?.resolvedFileName;
  if (resolvedModule) return resolve(resolvedModule);

  // Fallback keeps pure counterexample tests useful when the target fixture does not exist.
  if (specifier.startsWith('.')) return resolve(dirname(file), specifier);
  if (specifier.startsWith('apps/core-api/src/')) {
    return resolve(WORKSPACE_ROOT, specifier);
  }
  return undefined;
}

function isPublicModuleTarget(target: string, moduleRoot: string): boolean {
  return [
    moduleRoot,
    join(moduleRoot, 'index'),
    join(moduleRoot, 'index.js'),
    join(moduleRoot, 'index.ts'),
  ].includes(target);
}

function boundaryViolations(
  file: string,
  source: string,
  moduleName: string,
  moduleNames: string[],
  compilerOptions: CompilerOptions = COMPILER_OPTIONS,
): string[] {
  const violations: string[] = [];

  for (const specifier of importSpecifiers(source)) {
    const target = resolvedImport(file, specifier, compilerOptions);
    if (!target) continue;

    for (const other of moduleNames) {
      if (other === moduleName) continue;
      const otherRoot = join(MODULES_DIR, other);
      if (
        (target === otherRoot || target.startsWith(otherRoot + sep)) &&
        !isPublicModuleTarget(target, otherRoot)
      ) {
        violations.push(`${relative(MODULES_DIR, file)} → ${specifier}`);
      }
    }
  }

  return violations;
}

function edgeSnapshot(violations: string[]): string {
  return createHash('sha256')
    .update([...violations].sort().join('\n'))
    .digest('hex');
}

describe('module boundaries (docs/03 § 3.2)', () => {
  const moduleNames = readdirSync(MODULES_DIR).filter((n) =>
    statSync(join(MODULES_DIR, n)).isDirectory(),
  );

  it.each(moduleNames)(
    'module "%s" không import file nội bộ của module khác',
    (moduleName) => {
      const files = walk(join(MODULES_DIR, moduleName)).filter((file) =>
        file.endsWith('.ts'),
      );
      const violations = files.flatMap((file) => {
        const legacyPath = relative(MODULES_DIR, file);
        const fileViolations = boundaryViolations(
          file,
          readFileSync(file, 'utf8'),
          moduleName,
          moduleNames,
        );
        const expectedSnapshot =
          LEGACY_INTEGRATION_BOUNDARY_SNAPSHOTS.get(legacyPath);
        if (expectedSnapshot === undefined) return fileViolations;

        const actualSnapshot = edgeSnapshot(fileViolations);
        return actualSnapshot === expectedSnapshot
          ? []
          : [
              `${legacyPath}: legacy edge snapshot ${actualSnapshot}`,
              ...fileViolations,
            ];
      });

      expect(violations).toEqual([]);
    },
  );

  it('legacy integration exceptions là exact ratchet, không miễn trừ file mới', () => {
    const staleExceptions = [
      ...LEGACY_INTEGRATION_BOUNDARY_SNAPSHOTS.entries(),
    ].filter(([legacyPath, expectedSnapshot]) => {
      const file = join(MODULES_DIR, legacyPath);
      const moduleName = legacyPath.split('/')[0] ?? '';
      if (!sys.fileExists(file)) return true;
      const violations = boundaryViolations(
        file,
        readFileSync(file, 'utf8'),
        moduleName,
        moduleNames,
      );
      return (
        violations.length === 0 || edgeSnapshot(violations) !== expectedSnapshot
      );
    });

    expect(staleExceptions).toEqual([]);
  });

  it('chặn deep import tương đối, baseUrl và path alias', () => {
    const sourceFile = join(MODULES_DIR, 'matching', 'matching.service.ts');
    const aliasOptions: CompilerOptions = {
      ...COMPILER_OPTIONS,
      paths: {
        ...COMPILER_OPTIONS.paths,
        '@core/*': ['apps/core-api/src/*'],
      },
    };
    const violations = boundaryViolations(
      sourceFile,
      [
        "import '../user/entities/user.entity';",
        "import 'apps/core-api/src/modules/user/entities/user.entity';",
        "import '@core/modules/user/entities/user.entity';",
      ].join('\n'),
      'matching',
      moduleNames,
      aliasOptions,
    );

    expect(violations).toHaveLength(3);
  });

  it('counterexample: thêm một legacy edge làm đổi snapshot', () => {
    const current = ['fixture → ../user/entities/user.entity'];

    expect(
      edgeSnapshot([...current, 'fixture → ../auth/auth.service']),
    ).not.toBe(edgeSnapshot(current));
  });

  it('đọc đủ mọi cú pháp import TypeScript/JavaScript được hỗ trợ', () => {
    const source = [
      "import value from './static';",
      'export { value } from "./re-export";',
      "const lazy = import('./dynamic');",
      "const legacy = require('./require');",
      "import type { Contract } from './type-only';",
    ].join('\n');

    expect(
      preProcessFile(source, true, true).importedFiles.map(
        ({ fileName }) => fileName,
      ),
    ).toEqual([
      './static',
      './re-export',
      './dynamic',
      './require',
      './type-only',
    ]);
  });
});
