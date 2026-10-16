import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');

const files = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));

for (const owner of [
  'services/optiscaler',
  'services/optibalancer',
  'packages/platform',
  'packages/event-contracts',
]) {
  const sourceRoot = path.join(root, owner, 'src');

  for (const file of files(sourceRoot)) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const inspect = (node) => {
      const spec =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0]
            : undefined;

      if (spec && ts.isStringLiteral(spec)) {
        const value = spec.text;

        if (
          value.startsWith('.') &&
          path.relative(sourceRoot, path.resolve(path.dirname(file), value)).startsWith('..')
        ) {
          throw new Error(`Relative source boundary violated: ${file}: ${value}`);
        }

        if (
          value.startsWith('@stornx/') &&
          !/^@stornx\/(platform|event-contracts)(\/|$)/.test(value)
        ) {
          throw new Error(`Service source boundary violated: ${file}: ${value}`);
        }
      }

      ts.forEachChild(node, inspect);
    };

    inspect(source);
  }
}

console.log('Service import boundaries passed');
