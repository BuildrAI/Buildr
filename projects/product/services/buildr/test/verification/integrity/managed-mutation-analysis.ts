import { stripTypeScriptTypes } from 'node:module';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

type Token = { kind: SyntaxKind; text: string; value: string; start: number; end: number };
type Owner = { name: string; start: number; end: number };
const mutations = new Set(['rmSync', 'writeFileSync', 'appendFileSync', 'copyFileSync', 'cpSync', 'renameSync']);
const controls = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);

function closesStatementBlock(tokens: Token[], pairs: Map<number, number>, close: number): boolean {
  const open = pairs.get(close);
  if (open === undefined) return false;
  const previous = tokens[open - 1];
  if (!previous || [';', '{', '}', 'else', 'try', 'finally', 'do'].includes(previous.text)) return true;
  if (previous.text !== ')') return false;
  const parameters = pairs.get(open - 1);
  if (parameters === undefined) return false;
  if (controls.has(tokens[parameters - 1]?.text)) return true;
  let keyword = parameters - 1;
  if (tokens[keyword]?.kind !== SyntaxKind.FunctionKeyword) keyword--;
  if (tokens[keyword]?.text === '*') keyword--;
  if (tokens[keyword]?.kind !== SyntaxKind.FunctionKeyword) return false;
  let before = keyword - 1;
  if (tokens[before]?.text === 'async') before--;
  return before < 0 || [';', '{', '}', 'export', 'default'].includes(tokens[before].text);
}

/** The locked TypeScript scanner distinguishes executable calls from comments and literals. */
function scan(source: string): { tokens: Token[]; pairs: Map<number, number> } {
  const text = stripTypeScriptTypes(source), scanner = createScanner(true);
  scanner.setText(text);
  const tokens: Token[] = [], pairs = new Map<number, number>(), delimiters: number[] = [], templates: number[] = [];
  let braces = 0;
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    const previous = tokens.at(-1);
    if (kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken) {
      const open = pairs.get(tokens.length - 1), control = previous?.text === ')' && open !== undefined && controls.has(tokens[open - 1]?.text);
      // A closing object/function expression may be followed by division. If
      // the brace context is uncertain, keep scanning instead of consuming a
      // possible filesystem call as regular-expression text.
      const expressionEnd = previous && (previous.kind === SyntaxKind.Identifier || previous.kind === SyntaxKind.NumericLiteral || previous.kind === SyntaxKind.StringLiteral || previous.kind === SyntaxKind.RegularExpressionLiteral || previous.kind === SyntaxKind.NoSubstitutionTemplateLiteral || previous.kind === SyntaxKind.TemplateTail || [')', ']', '++', '--', 'this', 'super', 'true', 'false', 'null'].includes(previous.text)
        || previous.text === '}' && !closesStatementBlock(tokens, pairs, tokens.length - 1));
      if (!expressionEnd || control) kind = scanner.reScanSlashToken();
    }
    if (kind === SyntaxKind.CloseBraceToken && templates.at(-1) === braces) {
      kind = scanner.reScanTemplateToken(false);
      if (kind === SyntaxKind.TemplateTail) templates.pop();
    } else if (kind === SyntaxKind.OpenBraceToken) braces++;
    else if (kind === SyntaxKind.CloseBraceToken) braces--;
    if (kind === SyntaxKind.TemplateHead) templates.push(braces);
    const token = { kind, text: scanner.getTokenText(), value: scanner.getTokenValue(), start: scanner.getTokenStart(), end: scanner.getTokenEnd() }, index = tokens.length;
    tokens.push(token);
    if (['(', '[', '{'].includes(token.text)) delimiters.push(index);
    else if ([')', ']', '}'].includes(token.text)) {
      const open = delimiters.pop();
      if (open !== undefined) { pairs.set(open, index); pairs.set(index, open); }
    }
  }
  return { tokens, pairs };
}

function functionOwners(tokens: Token[], pairs: Map<number, number>): Owner[] {
  const classBodies = new Set<number>(), objectBodies = new Set<number>(), blocks: number[] = [], owners: Owner[] = [];
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].kind !== SyntaxKind.ClassKeyword) continue;
    const nextKind = tokens[index + 1]?.kind;
    if (nextKind !== SyntaxKind.Identifier && nextKind !== SyntaxKind.ExtendsKeyword && nextKind !== SyntaxKind.OpenBraceToken) continue;
    for (let next = index + 1; next < tokens.length; next++) {
      if (tokens[next].text === '(' || tokens[next].text === '[') next = pairs.get(next) ?? next;
      else if (tokens[next].text === '{') { classBodies.add(next); break; }
    }
  }
  for (const [index, token] of tokens.entries()) {
    if (token.text === '}') { blocks.pop(); continue; }
    if (token.text !== '{') continue;
    const parent = blocks.at(-1), previous = tokens[index - 1], end = pairs.get(index);
    if (previous?.text === ')') {
      const parameters = pairs.get(index - 1), name = parameters === undefined ? undefined : tokens[parameters - 1];
      const beforeName = parameters === undefined ? undefined : tokens[parameters - 2];
      const declaration = beforeName?.kind === SyntaxKind.FunctionKeyword || beforeName?.text === '*' && tokens[parameters! - 3]?.kind === SyntaxKind.FunctionKeyword;
      const method = parent !== undefined && (classBodies.has(parent) || objectBodies.has(parent));
      if (name && end !== undefined && !controls.has(name.text) && name.kind !== SyntaxKind.FunctionKeyword && (declaration || method)) {
        owners.push({ name: name.text, start: name.start, end: tokens[end].end });
      }
    }
    if (!classBodies.has(index) && previous && ['=', ':', 'return', '(', '[', ',', '?', 'yield'].includes(previous.text)) objectBodies.add(index);
    blocks.push(index);
  }
  return owners;
}

/** File and named function/method must both be reviewed; anonymous callbacks retain their named owner. */
export function findManagedMutationViolations(source: string, relativeFile: string, allowedOwners: ReadonlySet<string> = new Set()): string[] {
  const { tokens, pairs } = scan(source), owners = functionOwners(tokens, pairs), violations: string[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.text !== 'fs') continue;
    let property = index + 1, call = -1;
    if (tokens[property]?.text === '?.' && tokens[property + 1]?.text === '[') property++;
    if (['.', '?.'].includes(tokens[property]?.text) && mutations.has(tokens[property + 1]?.text)) call = property + 2;
    else if (tokens[property]?.text === '[' && tokens[property + 1]?.kind === SyntaxKind.StringLiteral
      && mutations.has(tokens[property + 1]?.value) && tokens[property + 2]?.text === ']') call = property + 3;
    if (call < 0) continue;
    if (tokens[call]?.text === '?.') call++;
    if (tokens[call]?.text !== '(') continue;
    const owner = owners.filter(candidate => token.start >= candidate.start && token.end <= candidate.end).sort((left, right) => right.start - left.start)[0]?.name ?? '<top-level>';
    if (allowedOwners.has(owner)) continue;
    const line = source.slice(0, token.start).split(/\r?\n/).length;
    violations.push(`${relativeFile}:${line}: direct mutation in ${owner}`);
  }
  return violations;
}
