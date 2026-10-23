import path from 'node:path';
import ts from 'typescript';

// Resolve against the real project, including path aliases and imported functions.
// `options.extraConfigs`: tsconfig của app khác cần đưa vào cùng chương trình (vd gateway); `options.extraRoots`: thư mục nguồn của chúng.
export function createProjectIndex(
  repoDir,
  { extraConfigs = [], extraRoots = [] } = {},
) {
  const parse = (rel) => {
    const configFile = path.join(repoDir, rel);
    const config = ts.readConfigFile(configFile, ts.sys.readFile);
    return ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      path.dirname(configFile),
    );
  };
  const parsed = parse('apps/core-api/tsconfig.app.json');
  const rootFiles = [
    ...new Set([
      ...parsed.fileNames,
      ...extraConfigs.flatMap((rel) => parse(rel).fileNames),
    ]),
  ];
  const program = ts.createProgram(rootFiles, parsed.options);
  const checker = program.getTypeChecker();
  const functions = new Map();
  const classes = new Map();
  const implementations = new Map();
  const relative = (sf) =>
    path.relative(repoDir, sf.fileName).replaceAll('\\', '/');
  const projectRoots = new RegExp(
    `^(apps/core-api/src|libs/[^/]+/src${extraRoots.map((r) => `|${r}`).join('')})/`,
  );
  const project = (sf) =>
    !sf.isDeclarationFile && projectRoots.test(relative(sf));
  const key = (n) => `${relative(n.getSourceFile())}:${n.getStart()}`;
  const classOf = (n) =>
    ts.isClassLike(n.parent)
      ? n.parent
      : ts.isPropertyDeclaration(n.parent) && ts.isClassLike(n.parent.parent)
        ? n.parent.parent
        : null;
  const heritageName = (t) => {
    let symbol = checker.getSymbolAtLocation(t.expression);
    if (symbol?.flags & ts.SymbolFlags.Alias)
      symbol = checker.getAliasedSymbol(symbol);
    return (
      symbol?.declarations?.find((d) => d.name)?.name.getText() ??
      t.expression.getText()
    );
  };
  const callable = (n) =>
    (ts.isMethodDeclaration(n) ||
      ts.isFunctionDeclaration(n) ||
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n)) &&
    n.body;
  const descriptor = (fn) => {
    const cls = classOf(fn);
    const node = ts.isVariableDeclaration(fn.parent)
      ? fn.parent.parent.parent
      : ts.isPropertyDeclaration(fn.parent)
        ? fn.parent
        : fn;
    const name =
      fn.name?.getText() ??
      (ts.isVariableDeclaration(fn.parent) ||
      ts.isPropertyDeclaration(fn.parent)
        ? fn.parent.name.getText()
        : null);
    if (!name || (cls && /(Dto|Metrics)$/.test(cls.name?.text ?? '')))
      return null;
    const sf = fn.getSourceFile();
    return {
      file: relative(sf),
      f: {
        node,
        fn,
        name,
        cls,
        className: cls?.name?.text ?? null,
        start: sf.getLineAndCharacterOfPosition(node.getStart()).line,
        end: sf.getLineAndCharacterOfPosition(node.getEnd()).line,
      },
      name,
      className: cls?.name?.text ?? null,
    };
  };
  for (const sf of program.getSourceFiles().filter(project)) {
    const visit = (n) => {
      if (
        (ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n)) &&
        n.name
      ) {
        classes.set(n.name.text, { file: relative(sf), cls: n });
        for (const h of n.heritageClauses ?? [])
          for (const t of h.types) {
            const base = heritageName(t);
            implementations.set(base, [
              ...(implementations.get(base) ?? []),
              n,
            ]);
          }
      }
      if (callable(n)) {
        const d = descriptor(n);
        if (d) functions.set(key(n), d);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const method = (cls, name, seen = new Set()) => {
    if (seen.has(cls)) return [];
    seen.add(cls);
    const own = cls.members.find(
      (m) => m.name?.getText() === name && callable(m),
    );
    if (own) return [functions.get(key(own))].filter(Boolean);
    return (cls.heritageClauses ?? []).flatMap((h) =>
      h.types.flatMap((t) => {
        const base = classes.get(heritageName(t))?.cls;
        return base ? method(base, name, seen) : [];
      }),
    );
  };
  const fromDeclaration = (decl) => {
    if (!decl || !project(decl.getSourceFile())) return [];
    const direct = functions.get(key(decl));
    if (direct) return [direct];
    if (
      (ts.isVariableDeclaration(decl) || ts.isPropertyDeclaration(decl)) &&
      decl.initializer &&
      callable(decl.initializer)
    )
      return [functions.get(key(decl.initializer))].filter(Boolean);
    if (
      (ts.isMethodSignature(decl) || ts.isMethodDeclaration(decl)) &&
      !decl.body
    ) {
      const base = decl.parent.name?.getText();
      const descend = (name, seen = new Set()) => {
        if (seen.has(name)) return [];
        seen.add(name);
        return (implementations.get(name) ?? []).flatMap((cls) => [
          ...method(cls, decl.name.getText()),
          ...descend(cls.name.text, seen),
        ]);
      };
      return descend(base);
    }
    return [];
  };
  const resolveCall = (n) => {
    const expr = n.expression;
    let targets = fromDeclaration(checker.getResolvedSignature(n)?.declaration);
    if (!targets.length) {
      let symbol = checker.getSymbolAtLocation(
        ts.isPropertyAccessExpression(expr) ? expr.name : expr,
      );
      if (symbol?.flags & ts.SymbolFlags.Alias)
        symbol = checker.getAliasedSymbol(symbol);
      targets = (symbol?.declarations ?? []).flatMap(fromDeclaration);
    }
    return {
      expression: expr.getText().replace(/\s+/g, ''),
      name: ts.isPropertyAccessExpression(expr)
        ? expr.name.text
        : expr.getText(),
      targets: [...new Map(targets.map((x) => [key(x.f.fn), x])).values()],
    };
  };
  const callsCache = new Map();
  const calls = (d) => {
    const cacheKey = `${d.file}:${d.className ?? ''}:${d.name}`;
    if (callsCache.has(cacheKey)) return callsCache.get(cacheKey);
    const own = [...functions.values()].find(
      (x) =>
        x.file === d.file && x.name === d.name && x.className === d.className,
    );
    if (!own) return [];
    const result = [];
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const call = resolveCall(n);
        call.targets = call.targets.filter((x) => !isInside(x.f.fn, own.f.fn));
        result.push(call);
      }
      ts.forEachChild(n, visit);
    };
    visit(own.f.fn.body);
    callsCache.set(cacheKey, result);
    return result;
  };
  const callsIn = (file, start, end) => {
    const sf = program.getSourceFiles().find((s) => relative(s) === file);
    const result = [];
    if (!sf) return result;
    const visit = (n) => {
      if (
        ts.isCallExpression(n) &&
        sf.getLineAndCharacterOfPosition(n.getStart()).line + 1 >= start &&
        sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1 <= end
      )
        result.push(resolveCall(n));
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return result;
  };
  return {
    functions: [...functions.values()],
    classes,
    calls,
    callsIn,
    method: (className, name) => {
      const cls = classes.get(className)?.cls;
      return cls ? method(cls, name) : [];
    },
    isProjectType: (name) => classes.has(name) || implementations.has(name),
    isProjectDependency: (file, className, name) => {
      const sf = program.getSourceFiles().find((s) => relative(s) === file);
      const cls = sf?.statements.find(
        (n) => ts.isClassDeclaration(n) && n.name?.text === className,
      );
      const ctor = cls?.members.find(ts.isConstructorDeclaration);
      const parameter = ctor?.parameters.find((p) => p.name.getText() === name);
      if (!parameter) return false;
      const projectType = (type) => {
        if (type.isUnionOrIntersection()) return type.types.some(projectType);
        return (type.getSymbol()?.declarations ?? []).some(
          (d) =>
            (ts.isClassDeclaration(d) || ts.isInterfaceDeclaration(d)) &&
            project(d.getSourceFile()),
        );
      };
      return projectType(checker.getTypeAtLocation(parameter));
    },
  };
}

function isInside(node, ancestor) {
  for (let p = node.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}
