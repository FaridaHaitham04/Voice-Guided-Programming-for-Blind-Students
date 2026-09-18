export function runSimplePython(code) {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i += 1;
      continue;
    }

    const forMatch = trimmed.match(/^for\s+(\w+)\s+in\s+range\((\d+)\s*,\s*(\d+)\s*\):$/);
    if (forMatch) {
      const [, name, start, end] = forMatch;
      i += 1;
      const body = [];
      while (i < lines.length && isIndented(lines[i])) {
        if (lines[i].trim()) body.push(lines[i].trim());
        i += 1;
      }
      for (let n = Number(start); n < Number(end); n += 1) {
        for (const statement of body) {
          const printed = evalPrint(statement, { [name]: n });
          if (printed !== null) output.push(printed);
        }
      }
      continue;
    }

    const printed = evalPrint(trimmed, {});
    if (printed !== null) output.push(printed);
    i += 1;
  }

  return output;
}

function isIndented(line) {
  return line.startsWith("    ") || line.startsWith("\t") || line.trim() === "";
}

function evalPrint(statement, vars) {
  const match = statement.match(/^print\((.*)\)$/);
  if (!match) return null;
  const expr = match[1].trim();
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }
  if (Object.hasOwn(vars, expr)) return String(vars[expr]);
  if (/^-?\d+(\s*[+\-*/]\s*-?\d+)*$/.test(expr)) {
    try {
      return String(Function(`"use strict"; return (${expr});`)());
    } catch {
      return expr;
    }
  }
  return expr;
}
