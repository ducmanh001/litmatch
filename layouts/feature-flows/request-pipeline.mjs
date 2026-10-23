import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const cache = new Map();
const aliases = JSON.parse(
  readFileSync(path.join(repo, 'tsconfig.base.json'), 'utf8'),
).compilerOptions.paths;
const mainFile = 'apps/core-api/src/main.ts';
const moduleFile = 'apps/core-api/src/app/app.module.ts';
const hooks = new Map([
  ['UseGuards', 'canActivate'],
  ['UseInterceptors', 'intercept'],
  ['UsePipes', 'transform'],
  ['UseFilters', 'catch'],
]);

function source(file) {
  if (!cache.has(file)) {
    const absolute = path.join(repo, file);
    if (statSync(absolute).size > 100_000)
      throw new Error(`Pipeline source exceeds 100 KB: ${file}`);
    const text = readFileSync(absolute, 'utf8').replaceAll('\r\n', '\n');
    cache.set(
      file,
      ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true),
    );
  }
  return cache.get(file);
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function modulePath(from, specifier) {
  const bases = specifier.startsWith('.')
    ? [path.posix.join(path.posix.dirname(from), specifier)]
    : (aliases[specifier] ?? []);
  for (const base of bases) {
    for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
      if (
        existsSync(path.join(repo, candidate)) &&
        statSync(path.join(repo, candidate)).isFile()
      ) {
        return candidate.replaceAll('\\', '/').replace(/^\.\//, '');
      }
    }
  }
  return null;
}

function declaration(file, name, seen = new Set()) {
  const key = `${file}:${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const sf = source(file);
  for (const statement of sf.statements) {
    if (
      (ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement)) &&
      statement.name?.text === name
    ) {
      return { file, node: statement, name };
    }
    if (ts.isVariableStatement(statement)) {
      const variable = statement.declarationList.declarations.find(
        (item) => item.name.getText(sf) === name,
      );
      if (variable) return { file, node: statement, name };
    }
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        const binding = bindings.elements.find(
          (item) => item.name.text === name,
        );
        const target =
          binding && modulePath(file, statement.moduleSpecifier.text);
        if (target)
          return declaration(target, binding.propertyName?.text ?? name, seen);
      }
    }
  }
  for (const statement of sf.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const target = modulePath(file, statement.moduleSpecifier.text);
    if (!target) continue;
    if (!statement.exportClause) {
      const found = declaration(target, name, seen);
      if (found) return found;
    } else if (ts.isNamedExports(statement.exportClause)) {
      const binding = statement.exportClause.elements.find(
        (item) => item.name.text === name,
      );
      if (binding)
        return declaration(target, binding.propertyName?.text ?? name, seen);
    }
  }
  return null;
}

function withoutComments(text) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );
  const stack = [];
  const out = [];
  for (
    let kind = scanner.scan();
    kind !== ts.SyntaxKind.EndOfFileToken;
    kind = scanner.scan()
  ) {
    if (kind === ts.SyntaxKind.OpenBraceToken) stack.push('brace');
    if (kind === ts.SyntaxKind.TemplateHead) stack.push('template');
    if (kind === ts.SyntaxKind.CloseBraceToken && stack.pop() === 'template') {
      kind = scanner.reScanTemplateToken(false);
      if (kind === ts.SyntaxKind.TemplateMiddle) stack.push('template');
    }
    const token = scanner.getTokenText();
    out.push(
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
        kind === ts.SyntaxKind.MultiLineCommentTrivia
        ? token.replace(/[^\n]/g, ' ')
        : token,
    );
  }
  return out
    .join('')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
}

function snippet(file, node, label, placement = '@global') {
  const sf = source(file);
  const start = node.getStart(sf);
  const end = node.getEnd();
  return {
    file,
    label,
    tag: 'CONTROLLER',
    placement,
    sourceStart: sf.getLineAndCharacterOfPosition(start).line + 1,
    sourceEnd: sf.getLineAndCharacterOfPosition(end - 1).line + 1,
    lines: withoutComments(sf.text.slice(start, end)).split('\n'),
  };
}

function implementation(from, name, method, placement = '@global') {
  const found = declaration(from, name);
  if (!found) return [];
  const { file, node } = found;
  if (ts.isClassDeclaration(node)) {
    const member = node.members.find(
      (item) => item.name?.getText(source(file)) === method,
    );
    if (!member) return [];
    const item = snippet(file, member, `${found.name}.${method}`, placement);
    delete item.lines;
    return [
      {
        ...item,
        functionName: method,
        className: found.name,
        anchor: `${method}(`,
      },
    ];
  }
  const item = snippet(file, node, found.name, placement);
  if (ts.isFunctionDeclaration(node)) {
    delete item.lines;
    return [
      { ...item, functionName: found.name, anchor: `function ${found.name}(` },
    ];
  }
  return [item];
}

function decorators(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorName(decorator) {
  const expr = decorator.expression;
  return (ts.isCallExpression(expr) ? expr.expression : expr).getText();
}

function globalPipeline() {
  const out = [];
  const sf = source(mainFile);
  const bootstrap = sf.statements.find(
    (item) => ts.isFunctionDeclaration(item) && item.name?.text === 'bootstrap',
  );
  if (!bootstrap?.body) throw new Error('Cannot resolve core-api bootstrap');
  for (const statement of bootstrap.body.statements) {
    if (ts.isVariableStatement(statement)) {
      if (
        statement.declarationList.declarations.some((item) =>
          ['app', 'corsOrigins'].includes(item.name.getText(sf)),
        )
      ) {
        out.push(
          snippet(mainFile, statement, 'Bootstrap request configuration'),
        );
      }
      continue;
    }
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isCallExpression(statement.expression)
    )
      continue;
    const call = statement.expression;
    if (
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.expression.getText(sf) !== 'app'
    )
      continue;
    const name = call.expression.name.text;
    if (
      ![
        'use',
        'useBodyParser',
        'enableCors',
        'useGlobalPipes',
        'useGlobalInterceptors',
        'set',
      ].includes(name)
    )
      continue;
    out.push(snippet(mainFile, statement, `app.${name}`));
    if (name === 'use') {
      walk(call, (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          out.push(
            ...implementation(mainFile, node.expression.text, undefined),
          );
        }
      });
    }
  }
  out.push(...implementation(mainFile, 'parseCorsOrigins', undefined));

  const app = source(moduleFile);
  walk(app, (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(app) === 'ThrottlerModule.forRootAsync'
    ) {
      out.push(snippet(moduleFile, node, 'ThrottlerModule configuration'));
      walk(node, (configuration) => {
        if (
          !ts.isPropertyAssignment(configuration) ||
          configuration.name.getText(app) !== 'storage'
        )
          return;
        const storage = configuration.initializer;
        if (
          ts.isNewExpression(storage) &&
          ts.isIdentifier(storage.expression)
        ) {
          out.push(
            ...implementation(moduleFile, storage.expression.text, 'increment'),
          );
        }
      });
    }
    if (!ts.isObjectLiteralExpression(node)) return;
    const properties = new Map(
      node.properties
        .filter(ts.isPropertyAssignment)
        .map((item) => [item.name.getText(app), item.initializer]),
    );
    const token = properties.get('provide')?.getText(app);
    const method = {
      APP_GUARD: 'canActivate',
      APP_INTERCEPTOR: 'intercept',
      APP_FILTER: 'catch',
    }[token];
    const useClass = properties.get('useClass');
    if (!method || !useClass || !ts.isIdentifier(useClass)) return;
    out.push(snippet(moduleFile, node, `${token}: ${useClass.text}`));
    out.push(...implementation(moduleFile, useClass.text, method));
  });
  return out;
}

/** Source-only request hooks. External packages contribute their real registration/configuration. */
export function requestPipeline({ file, className, name }) {
  const sf = source(file);
  const cls = sf.statements.find(
    (node) =>
      ts.isClassDeclaration(node) &&
      (!className || node.name?.text === className),
  );
  const method = cls?.members.find(
    (node) => ts.isMethodDeclaration(node) && node.name.getText(sf) === name,
  );
  if (!cls || !method)
    throw new Error(
      `Cannot resolve request endpoint ${file}:${className ?? ''}.${name}`,
    );
  const out = globalPipeline();
  for (const owner of [cls, method, ...method.parameters]) {
    for (const decorator of decorators(owner)) {
      const name = decoratorName(decorator);
      if (
        /^Api/.test(name) ||
        [
          'Controller',
          'Get',
          'Post',
          'Put',
          'Patch',
          'Delete',
          'Head',
          'Options',
          'HttpCode',
          'Header',
          'Redirect',
          'Render',
        ].includes(name)
      )
        continue;
      const placement = owner === cls ? '@global' : `@${name}`;
      const expr = decorator.expression;
      if (owner === cls || hooks.has(name))
        out.push(snippet(file, decorator, `@${name}`, placement));
      if (hooks.has(name) && ts.isCallExpression(expr)) {
        for (const arg of expr.arguments) {
          const target = ts.isNewExpression(arg) ? arg.expression : arg;
          if (ts.isIdentifier(target))
            out.push(
              ...implementation(file, target.text, hooks.get(name), placement),
            );
        }
      } else {
        out.push(...implementation(file, name, undefined, placement));
        if (name === 'IdempotencyKey') {
          const found = declaration(file, name);
          if (found)
            out.push(
              ...implementation(
                found.file,
                'extractIdempotencyKey',
                undefined,
                placement,
              ),
            );
        }
        if (ts.isCallExpression(expr)) {
          for (const arg of expr.arguments) {
            const target = ts.isNewExpression(arg) ? arg.expression : arg;
            if (!ts.isIdentifier(target)) continue;
            const local = implementation(
              file,
              target.text,
              'transform',
              placement,
            );
            if (local.length) out.push(...local);
            else if (target.text.endsWith('Pipe'))
              out.push(
                snippet(
                  file,
                  decorator,
                  `${target.text} configuration`,
                  placement,
                ),
              );
          }
        }
      }
    }
  }
  const seen = new Set();
  return out.filter((item) => {
    const key = `${item.file}:${item.sourceStart}:${item.sourceEnd}:${item.placement}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
