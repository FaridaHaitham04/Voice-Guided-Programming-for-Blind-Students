const KEYWORDS = new Set([
  "for",
  "in",
  "while",
  "if",
  "else",
  "elif",
  "def",
  "return",
  "and",
  "or",
  "not",
  "True",
  "False",
  "None",
]);

const BUILTINS = new Set(["print", "range", "len", "int", "str", "input"]);

export function highlightPython(code) {
  return code.split("\n").map((line) => highlightLine(line));
}

function highlightLine(line) {
  const commentIndex = findCommentIndex(line);
  const codePart = commentIndex === -1 ? line : line.slice(0, commentIndex);
  const comment = commentIndex === -1 ? "" : line.slice(commentIndex);
  const tokens = [];
  const pattern =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)|([^\sA-Za-z0-9_]+)|(\s+)/g;

  let match;
  while ((match = pattern.exec(codePart))) {
    const [value, string, number, ident, punct, space] = match;
    if (space) tokens.push({ type: "plain", value: space });
    else if (string) tokens.push({ type: "string", value: string });
    else if (number) tokens.push({ type: "number", value: number });
    else if (ident && KEYWORDS.has(ident)) tokens.push({ type: "keyword", value: ident });
    else if (ident && BUILTINS.has(ident)) tokens.push({ type: "builtin", value: ident });
    else if (ident) tokens.push({ type: "ident", value: ident });
    else tokens.push({ type: "plain", value: punct || value });
  }

  if (comment) tokens.push({ type: "comment", value: comment });
  if (tokens.length === 0) tokens.push({ type: "plain", value: " " });
  return tokens;
}

function findCommentIndex(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === '"' && !inSingle) inDouble = !inDouble;
    else if (char === "#" && !inSingle && !inDouble) return i;
  }
  return -1;
}
