import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/** One import or re-export found in a source file. Paths are repo-relative with `/` separators. */
export interface ImportEdge {
  readonly from: string;
  readonly specifier: string;
  /** Repo-relative target, for relative specifiers only. */
  readonly resolved?: string;
  readonly typeOnly: boolean;
}

const toPosix = (value: string): string => value.split(path.sep).join("/");

/** Every `.ts` file under `rootDir`, repo-relative. */
export const listSourceFiles = (rootDir: string): readonly string[] =>
  readdirSync(rootDir, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => toPosix(path.join(rootDir, entry)))
    .sort();

const edgeFor = (from: string, specifier: string, typeOnly: boolean): ImportEdge => {
  if (!specifier.startsWith(".")) return { from, specifier, typeOnly };
  return {
    from,
    specifier,
    resolved: path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier)),
    typeOnly,
  };
};

const isModuleCall = (node: ts.CallExpression): boolean =>
  node.expression.kind === ts.SyntaxKind.ImportKeyword ||
  (ts.isIdentifier(node.expression) && node.expression.text === "require");

/**
 * Collects static imports, re-exports, `import()` and `require()` calls, `import x = require()` and
 * `import("x")` types of every file under `rootDir`.
 */
export const collectImports = (rootDir: string): readonly ImportEdge[] => {
  const edges: ImportEdge[] = [];
  for (const file of listSourceFiles(rootDir)) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        edges.push(edgeFor(file, node.moduleSpecifier.text, node.importClause?.isTypeOnly ?? false));
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        edges.push(edgeFor(file, node.moduleSpecifier.text, node.isTypeOnly));
      } else if (
        ts.isCallExpression(node) &&
        isModuleCall(node) &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        edges.push(edgeFor(file, node.arguments[0].text, false));
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        edges.push(edgeFor(file, node.moduleReference.expression.text, node.isTypeOnly));
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        edges.push(edgeFor(file, node.argument.literal.text, true));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return edges;
};
