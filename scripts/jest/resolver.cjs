const path = require('node:path');
const ts = require('typescript');

const workspaceRoot = path.resolve(__dirname, '../..');
const tsconfigPath = path.join(workspaceRoot, 'tsconfig.base.json');
const tsconfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
const parsedTsconfig = ts.parseJsonConfigFileContent(
  tsconfig.config,
  ts.sys,
  path.dirname(tsconfigPath),
);
const compilerHost = ts.createCompilerHost(parsedTsconfig.options, true);

module.exports = (request, options) => {
  try {
    return require.resolve(request, {
      paths: [options.basedir, options.rootDir || workspaceRoot],
    });
  } catch (nodeError) {
    const containingFile = path.join(options.basedir, '__jest_resolve__.ts');
    const resolved = ts.resolveModuleName(
      request,
      containingFile,
      parsedTsconfig.options,
      compilerHost,
    ).resolvedModule;

    if (resolved?.resolvedFileName) {
      return resolved.resolvedFileName;
    }

    throw nodeError;
  }
};
