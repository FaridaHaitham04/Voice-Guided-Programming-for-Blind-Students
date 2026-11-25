const MAX_WHILE_ITERATIONS = 100;

export function runSimplePython(code) {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  const vars = {};

  execLines(lines, 0, 0, vars, output);
  return output;
}

function getIndent(line) {
  let count = 0;
  for (const ch of line) {
    if (ch === " ") count += 1;
    else if (ch === "\t") count += 4;
    else break;
  }
  return count;
}

function collectBlock(lines, startIndex, parentIndent) {
  const block = [];
  let i = startIndex;
  let blockIndent = null;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i += 1;
      continue;
    }
    const indent = getIndent(raw);
    if (indent <= parentIndent) {
      break;
    }
    if (blockIndent === null) {
      blockIndent = indent;
    }
    block.push(raw);
    i += 1;
  }

  return { block, nextIndex: i, blockIndent: blockIndent ?? parentIndent + 4 };
}

function execLines(lines, startIndex, minIndent, vars, output) {
  let i = startIndex;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i += 1;
      continue;
    }

    const indent = getIndent(raw);
    if (indent < minIndent) {
      break;
    }

    if (trimmed === "break") {
      return "break";
    }

    if (trimmed === "continue") {
      return "continue";
    }

    const ifMatch = trimmed.match(/^if\s+(.+):$/);
    if (ifMatch) {
      const [, condStr] = ifMatch;
      const { block, nextIndex, blockIndent } = collectBlock(lines, i + 1, indent);
      if (evalCondition(condStr, vars)) {
        const signal = execLines(block, 0, blockIndent, vars, output);
        if (signal) return signal;
      }
      i = nextIndex;
      continue;
    }

    const forRangeMatch = trimmed.match(/^for\s+([A-Za-z_]\w*)\s+in\s+range\((.+)\):$/);
    if (forRangeMatch) {
      const [, varName, rangeArgsRaw] = forRangeMatch;
      const { block, nextIndex, blockIndent } = collectBlock(lines, i + 1, indent);
      const args = splitArgs(rangeArgsRaw).map((a) => Number(evalExpr(a, vars)));
      let start = 0;
      let stop = 0;
      let step = 1;
      if (args.length === 1) {
        stop = Number.isFinite(args[0]) ? args[0] : 0;
      } else if (args.length >= 2) {
        start = Number.isFinite(args[0]) ? args[0] : 0;
        stop = Number.isFinite(args[1]) ? args[1] : 0;
        if (args.length >= 3 && Number.isFinite(args[2]) && args[2] !== 0) {
          step = args[2];
        }
      }

      let guard = 0;
      for (let n = start; step > 0 ? n < stop : n > stop; n += step) {
        if (guard >= MAX_WHILE_ITERATIONS) {
          output.push(`(stopped after ${MAX_WHILE_ITERATIONS} loop iterations)`);
          break;
        }
        vars[varName] = n;
        const signal = execLines(block, 0, blockIndent, vars, output);
        guard += 1;
        if (signal === "break") break;
      }
      i = nextIndex;
      continue;
    }

    const forIterMatch = trimmed.match(/^for\s+([A-Za-z_]\w*)\s+in\s+(.+):$/);
    if (forIterMatch) {
      const [, varName, iterExpr] = forIterMatch;
      const { block, nextIndex, blockIndent } = collectBlock(lines, i + 1, indent);
      const iterable = evalExpr(iterExpr, vars);
      if (Array.isArray(iterable) || typeof iterable === "string") {
        let guard = 0;
        for (const item of iterable) {
          if (guard >= MAX_WHILE_ITERATIONS) {
            output.push(`(stopped after ${MAX_WHILE_ITERATIONS} loop iterations)`);
            break;
          }
          vars[varName] = item;
          const signal = execLines(block, 0, blockIndent, vars, output);
          guard += 1;
          if (signal === "break") break;
        }
      }
      i = nextIndex;
      continue;
    }

    const whileMatch = trimmed.match(/^while\s+(.+):$/);
    if (whileMatch) {
      const [, condStr] = whileMatch;
      const { block, nextIndex, blockIndent } = collectBlock(lines, i + 1, indent);
      let iterations = 0;
      while (evalCondition(condStr, vars)) {
        if (iterations >= MAX_WHILE_ITERATIONS) {
          output.push(`(stopped after ${MAX_WHILE_ITERATIONS} loop iterations)`);
          break;
        }
        const signal = execLines(block, 0, blockIndent, vars, output);
        iterations += 1;
        if (signal === "break") break;
      }
      i = nextIndex;
      continue;
    }

    execStatement(trimmed, vars, output);
    i += 1;
  }

  return null;
}

function execStatement(statement, vars, output) {
  const printMatch = statement.match(/^print\((.*)\)$/);
  if (printMatch) {
    const inner = printMatch[1].trim();
    if (!inner) {
      output.push("");
      return;
    }
    const args = splitArgs(inner);
    const rendered = args.map((arg) => String(evalExpr(arg, vars)));
    output.push(rendered.join(" "));
    return;
  }

  const compoundMatch = statement.match(/^([A-Za-z_]\w*)\s*(\+=|-=|\*=)\s*(.+)$/);
  if (compoundMatch) {
    const [, name, op, rhs] = compoundMatch;
    const current = Number(vars[name] ?? 0);
    const delta = Number(evalExpr(rhs, vars));
    if (Number.isFinite(current) && Number.isFinite(delta)) {
      if (op === "+=") vars[name] = current + delta;
      else if (op === "-=") vars[name] = current - delta;
      else if (op === "*=") vars[name] = current * delta;
    }
    return;
  }

  const assignMatch = statement.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
  if (assignMatch) {
    const [, name, rhs] = assignMatch;
    vars[name] = evalExpr(rhs, vars);
  }
}

function splitArgs(raw) {
  const args = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quote) {
      current += ch;
      if (ch === quote && raw[i - 1] !== "\\") {
        quote = null;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      if (current.trim()) args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function evalExpr(expr, vars) {
  const trimmed = expr.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return splitArgs(inner).map((item) => evalExpr(item, vars));
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (Object.hasOwn(vars, trimmed)) {
    return vars[trimmed];
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // Replace known numeric variables inside simple arithmetic expressions
  const substituted = trimmed.replace(/\b([A-Za-z_]\w*)\b/g, (ident) => {
    if (Object.hasOwn(vars, ident) && typeof vars[ident] === "number") {
      return String(vars[ident]);
    }
    return ident;
  });

  if (/^[-+*/%()\d.\s]+$/.test(substituted)) {
    try {
      const value = Function(`"use strict"; return (${substituted});`)();
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function evalCondition(condStr, vars) {
  const match = condStr.trim().match(/^(.+?)\s*(>=|<=|==|!=|>|<)\s*(.+)$/);
  if (!match) return false;
  const [, leftRaw, op, rightRaw] = match;
  const left = evalExpr(leftRaw, vars);
  const right = evalExpr(rightRaw, vars);

  switch (op) {
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case "==":
      return left == right;
    case "!=":
      return left != right;
    default:
      return false;
  }
}
