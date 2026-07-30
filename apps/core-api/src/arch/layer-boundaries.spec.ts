import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  findConfigFile,
  parseJsonConfigFileContent,
  preProcessFile,
  readConfigFile,
  resolveModuleName,
  sys,
} from 'typescript';

const WORKSPACE_ROOT = resolve(__dirname, '../../../..');
const CORE_DIR = resolve(__dirname, '..');
const COMMON_DIR = join(CORE_DIR, 'common');
const MODULES_DIR = join(CORE_DIR, 'modules');
const INBOUND_ADAPTER_ROLES = new Set(['controllers', 'jobs', 'webhooks']);
const INNER_ROLES = new Set([
  'clients',
  'dto',
  'entities',
  'ports',
  'redis',
  'repositories',
  'services',
]);
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

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function productionTypescriptFiles(directory: string): string[] {
  return walk(directory).filter(
    (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'),
  );
}

function importSpecifiers(source: string): string[] {
  return preProcessFile(source, true, true).importedFiles.map(
    ({ fileName }) => fileName,
  );
}

function importsOf(file: string): string[] {
  return importSpecifiers(readFileSync(file, 'utf8'));
}

function resolvedImport(file: string, specifier: string): string | undefined {
  const resolvedModule = resolveModuleName(
    specifier,
    file,
    COMPILER_OPTIONS,
    sys,
  ).resolvedModule?.resolvedFileName;
  if (resolvedModule) return resolve(resolvedModule);
  if (specifier.startsWith('.')) return resolve(dirname(file), specifier);
  if (specifier.startsWith('apps/core-api/src/')) {
    return resolve(WORKSPACE_ROOT, specifier);
  }
  return undefined;
}

function isInside(path: string, directory: string): boolean {
  return path === directory || path.startsWith(directory + sep);
}

function roleOf(path: string, moduleRoot: string): string {
  const parts = relative(moduleRoot, path).split(sep);
  return parts.length > 1 ? (parts[0] ?? 'root') : 'root';
}

function isEventHandler(path: string, moduleRoot: string): boolean {
  return (
    roleOf(path, moduleRoot) === 'events' &&
    /\.handler(?:\.[cm]?[jt]s)?$/.test(path)
  );
}

function isInboundAdapter(path: string, moduleRoot: string): boolean {
  return (
    INBOUND_ADAPTER_ROLES.has(roleOf(path, moduleRoot)) ||
    isEventHandler(path, moduleRoot)
  );
}

function isThinInboundAdapter(path: string, moduleRoot: string): boolean {
  return (
    ['controllers', 'webhooks'].includes(roleOf(path, moduleRoot)) ||
    path.endsWith('.controller.ts') ||
    isEventHandler(path, moduleRoot)
  );
}

function persistenceAccessViolations(
  file: string,
  source: string,
  moduleRoot: string,
): string[] {
  return importSpecifiers(source).flatMap((specifier) => {
    if (
      specifier === 'typeorm' ||
      specifier.startsWith('typeorm/') ||
      specifier === '@nestjs/typeorm' ||
      specifier.startsWith('@nestjs/typeorm/')
    ) {
      return [`${relative(MODULES_DIR, file)} -> ${specifier}`];
    }
    const target = resolvedImport(file, specifier);
    if (
      target &&
      isInside(target, moduleRoot) &&
      roleOf(target, moduleRoot) === 'repositories'
    ) {
      return [`${relative(MODULES_DIR, file)} -> ${specifier}`];
    }
    return [];
  });
}

function inboundDependencyViolations(
  file: string,
  source: string,
  moduleRoot: string,
): string[] {
  return importSpecifiers(source).flatMap((specifier) => {
    const target = resolvedImport(file, specifier);
    if (
      target &&
      isInside(target, moduleRoot) &&
      isInboundAdapter(target, moduleRoot)
    ) {
      return [`${relative(MODULES_DIR, file)} -> ${specifier}`];
    }
    return [];
  });
}

function findCycles(graph: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];
  const cycles: string[] = [];

  function visit(moduleName: string): void {
    if (active.has(moduleName)) {
      const start = stack.indexOf(moduleName);
      cycles.push([...stack.slice(start), moduleName].join(' -> '));
      return;
    }
    if (visited.has(moduleName)) return;

    active.add(moduleName);
    stack.push(moduleName);
    for (const dependency of graph.get(moduleName) ?? []) visit(dependency);
    stack.pop();
    active.delete(moduleName);
    visited.add(moduleName);
  }

  for (const moduleName of graph.keys()) visit(moduleName);
  return cycles;
}

describe('layer boundaries (ADR 0011, docs/16 § 16.3)', () => {
  const moduleNames = readdirSync(MODULES_DIR).filter((name) =>
    statSync(join(MODULES_DIR, name)).isDirectory(),
  );

  it('request/event inbound adapter không truy cập repository/ORM trực tiếp', () => {
    const violations: string[] = [];

    for (const moduleName of moduleNames) {
      const moduleRoot = join(MODULES_DIR, moduleName);
      for (const file of productionTypescriptFiles(moduleRoot).filter((path) =>
        isThinInboundAdapter(path, moduleRoot),
      )) {
        violations.push(
          ...persistenceAccessViolations(
            file,
            readFileSync(file, 'utf8'),
            moduleRoot,
          ),
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it('application/domain code không phụ thuộc ngược vào inbound adapter', () => {
    const violations: string[] = [];

    for (const moduleName of moduleNames) {
      const moduleRoot = join(MODULES_DIR, moduleName);
      for (const file of productionTypescriptFiles(moduleRoot)) {
        const sourceRole = roleOf(file, moduleRoot);
        const isRootFacade =
          sourceRole === 'root' && file.endsWith(`${moduleName}.service.ts`);
        if (!INNER_ROLES.has(sourceRole) && !isRootFacade) continue;

        violations.push(
          ...inboundDependencyViolations(
            file,
            readFileSync(file, 'utf8'),
            moduleRoot,
          ),
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it('persistence entity chỉ phụ thuộc entity hoặc constant cùng module', () => {
    const violations: string[] = [];

    for (const moduleName of moduleNames) {
      const moduleRoot = join(MODULES_DIR, moduleName);
      const entityRoot = join(moduleRoot, 'entities');
      if (!statSync(moduleRoot).isDirectory()) continue;

      for (const file of productionTypescriptFiles(moduleRoot).filter((path) =>
        isInside(path, entityRoot),
      )) {
        for (const specifier of importsOf(file)) {
          const target = resolvedImport(file, specifier);
          if (!target) continue;
          if (!isInside(target, moduleRoot)) continue;

          const targetRole = roleOf(target, moduleRoot);
          const isModuleConstant =
            targetRole === 'root' &&
            new RegExp(`${moduleName}\\.constants(?:\\.[cm]?[jt]s)?$`).test(
              target,
            );
          if (targetRole !== 'entities' && !isModuleConstant) {
            violations.push(`${relative(MODULES_DIR, file)} -> ${specifier}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('common infrastructure không import domain module', () => {
    const violations: string[] = [];

    for (const file of productionTypescriptFiles(COMMON_DIR)) {
      for (const specifier of importsOf(file)) {
        const target = resolvedImport(file, specifier);
        if (target && isInside(target, MODULES_DIR)) {
          violations.push(`${relative(CORE_DIR, file)} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('dependency graph giữa các domain module không có cycle', () => {
    const graph = new Map(
      moduleNames.map((moduleName) => [moduleName, new Set<string>()]),
    );

    for (const moduleName of moduleNames) {
      const moduleRoot = join(MODULES_DIR, moduleName);
      for (const file of productionTypescriptFiles(moduleRoot)) {
        for (const specifier of importsOf(file)) {
          const target = resolvedImport(file, specifier);
          if (!target) continue;
          for (const targetModule of moduleNames) {
            if (
              targetModule !== moduleName &&
              isInside(target, join(MODULES_DIR, targetModule))
            ) {
              graph.get(moduleName)?.add(targetModule);
            }
          }
        }
      }
    }

    expect(findCycles(graph)).toEqual([]);
  });

  it('counterexample: cycle hai module bị phát hiện', () => {
    expect(
      findCycles(
        new Map([
          ['a', new Set(['b'])],
          ['b', new Set(['a'])],
        ]),
      ),
    ).toEqual(['a -> b -> a']);
  });

  it('counterexample: thin inbound adapter không được chạm ORM/repository', () => {
    const moduleRoot = join(MODULES_DIR, 'matching');
    const controller = join(moduleRoot, 'controllers', 'sample.controller.ts');
    const eventHandler = join(moduleRoot, 'events', 'sample.handler.ts');

    expect(
      persistenceAccessViolations(
        controller,
        [
          "import { DataSource } from 'typeorm';",
          "import 'typeorm/data-source/DataSource';",
          "import '../repositories/sample.repository';",
        ].join('\n'),
        moduleRoot,
      ),
    ).toHaveLength(3);
    expect(
      persistenceAccessViolations(
        eventHandler,
        "import '../repositories/sample.repository';",
        moduleRoot,
      ),
    ).toHaveLength(1);
  });

  it('counterexample: application code không import job/event handler', () => {
    const moduleRoot = join(MODULES_DIR, 'matching');
    const service = join(moduleRoot, 'services', 'sample.service.ts');

    expect(
      inboundDependencyViolations(
        service,
        [
          "import '../jobs/sample.job';",
          "import '../events/sample.handler';",
        ].join('\n'),
        moduleRoot,
      ),
    ).toHaveLength(2);
  });
});
