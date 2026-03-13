/**
 * expression.ts -- Safe expression evaluator for the Spokbee parametric pipeline.
 *
 * Implements a recursive-descent parser that supports:
 *   - Numbers (integers, decimals, negatives)
 *   - Variable references: $paramId -> looks up config[paramId]
 *   - Arithmetic: +, -, *, /
 *   - Comparisons: <, <=, >, >=, ==, !=
 *   - Parenthesised sub-expressions
 *
 * No eval() or Function constructor is used.
 */

import type { Expression, ParametricConfig } from "../types/assembly-schema";

// ---------- Token types ------------------------------------------------------

type TokenKind =
  | "NUMBER"
  | "VARIABLE"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "LPAREN"
  | "RPAREN"
  | "LTE"
  | "GTE"
  | "LT"
  | "GT"
  | "EQ"
  | "NEQ"
  | "EOF";

interface Token {
  kind: TokenKind;
  value: string;
}

// ---------- Tokeniser --------------------------------------------------------

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    // Numbers: 42, 3.14
    if (ch >= "0" && ch <= "9") {
      let num = "";
      while (
        i < input.length &&
        ((input[i] >= "0" && input[i] <= "9") || input[i] === ".")
      ) {
        num += input[i];
        i++;
      }
      tokens.push({ kind: "NUMBER", value: num });
      continue;
    }

    // Variable references: $paramId (alphanumeric + underscore)
    if (ch === "$") {
      i++; // skip $
      let name = "";
      while (
        i < input.length &&
        ((input[i] >= "a" && input[i] <= "z") ||
          (input[i] >= "A" && input[i] <= "Z") ||
          (input[i] >= "0" && input[i] <= "9") ||
          input[i] === "_")
      ) {
        name += input[i];
        i++;
      }
      if (name.length === 0) {
        throw new Error(
          `Invalid variable reference at position ${i - 1}: '$' must be followed by a parameter name`,
        );
      }
      tokens.push({ kind: "VARIABLE", value: name });
      continue;
    }

    // Two-character operators (must be checked before single-char)
    if (i + 1 < input.length) {
      const two = input[i] + input[i + 1];
      if (two === "<=") {
        tokens.push({ kind: "LTE", value: "<=" });
        i += 2;
        continue;
      }
      if (two === ">=") {
        tokens.push({ kind: "GTE", value: ">=" });
        i += 2;
        continue;
      }
      if (two === "==") {
        tokens.push({ kind: "EQ", value: "==" });
        i += 2;
        continue;
      }
      if (two === "!=") {
        tokens.push({ kind: "NEQ", value: "!=" });
        i += 2;
        continue;
      }
    }

    // Single-character operators and punctuation
    if (ch === "<") {
      tokens.push({ kind: "LT", value: "<" });
      i++;
      continue;
    }
    if (ch === ">") {
      tokens.push({ kind: "GT", value: ">" });
      i++;
      continue;
    }
    if (ch === "+") {
      tokens.push({ kind: "PLUS", value: "+" });
      i++;
      continue;
    }
    if (ch === "-") {
      tokens.push({ kind: "MINUS", value: "-" });
      i++;
      continue;
    }
    if (ch === "*") {
      tokens.push({ kind: "STAR", value: "*" });
      i++;
      continue;
    }
    if (ch === "/") {
      tokens.push({ kind: "SLASH", value: "/" });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "LPAREN", value: "(" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "RPAREN", value: ")" });
      i++;
      continue;
    }

    throw new Error(
      `Unexpected character '${ch}' at position ${i} in expression: "${input}"`,
    );
  }

  tokens.push({ kind: "EOF", value: "" });
  return tokens;
}

// ---------- Recursive-descent parser / evaluator -----------------------------
//
// Grammar (lowest to highest precedence):
//   comparison     -> additive ( ("<=" | ">=" | "<" | ">" | "==" | "!=") additive )?
//   additive       -> multiplicative ( ("+" | "-") multiplicative )*
//   multiplicative -> unary ( ("*" | "/") unary )*
//   unary          -> "-" unary | primary
//   primary        -> NUMBER | VARIABLE | "(" comparison ")"

class Parser {
  private pos = 0;

  constructor(
    private tokens: Token[],
    private config: ParametricConfig,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t;
  }

  private expect(kind: TokenKind): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new Error(
        `Expected ${kind} but got ${t.kind} ("${t.value}")`,
      );
    }
    return this.advance();
  }

  /** Entry point -- parse the full expression and return its numeric value. */
  parse(): number {
    const value = this.comparison();
    if (this.peek().kind !== "EOF") {
      throw new Error(
        `Unexpected token "${this.peek().value}" after end of expression`,
      );
    }
    return value;
  }

  private comparison(): number {
    let left = this.additive();
    const t = this.peek();

    if (
      t.kind === "LT" ||
      t.kind === "LTE" ||
      t.kind === "GT" ||
      t.kind === "GTE" ||
      t.kind === "EQ" ||
      t.kind === "NEQ"
    ) {
      this.advance();
      const right = this.additive();
      switch (t.kind) {
        case "LT":
          return left < right ? 1 : 0;
        case "LTE":
          return left <= right ? 1 : 0;
        case "GT":
          return left > right ? 1 : 0;
        case "GTE":
          return left >= right ? 1 : 0;
        case "EQ":
          return left === right ? 1 : 0;
        case "NEQ":
          return left !== right ? 1 : 0;
      }
    }

    return left;
  }

  private additive(): number {
    let left = this.multiplicative();
    while (
      this.peek().kind === "PLUS" ||
      this.peek().kind === "MINUS"
    ) {
      const op = this.advance();
      const right = this.multiplicative();
      left = op.kind === "PLUS" ? left + right : left - right;
    }
    return left;
  }

  private multiplicative(): number {
    let left = this.unary();
    while (
      this.peek().kind === "STAR" ||
      this.peek().kind === "SLASH"
    ) {
      const op = this.advance();
      const right = this.unary();
      if (op.kind === "SLASH" && right === 0) {
        throw new Error("Division by zero");
      }
      left = op.kind === "STAR" ? left * right : left / right;
    }
    return left;
  }

  private unary(): number {
    if (this.peek().kind === "MINUS") {
      this.advance();
      return -this.unary();
    }
    return this.primary();
  }

  private primary(): number {
    const t = this.peek();

    if (t.kind === "NUMBER") {
      this.advance();
      const n = parseFloat(t.value);
      if (isNaN(n)) {
        throw new Error(`Invalid number: "${t.value}"`);
      }
      return n;
    }

    if (t.kind === "VARIABLE") {
      this.advance();
      const name = t.value;
      if (!(name in this.config)) {
        console.warn(`Unknown parameter "$${name}" -- not found in config, using 1`);
        return 1;
      }
      return this.config[name];
    }

    if (t.kind === "LPAREN") {
      this.advance();
      const value = this.comparison();
      this.expect("RPAREN");
      return value;
    }

    throw new Error(
      `Unexpected token ${t.kind} ("${t.value}")`,
    );
  }
}

// ---------- Public API -------------------------------------------------------

/**
 * Evaluate an expression (number or string) against a parameter config.
 * If the expression is already a number, returns it directly.
 * If the expression is a simple "$paramId" reference, resolves it.
 * Otherwise parses and evaluates the full expression string.
 */
export function evaluateExpression(
  expr: Expression,
  config: ParametricConfig,
): number {
  if (typeof expr === "number") {
    return expr;
  }

  // Fast path: simple variable reference like "$width"
  const simpleRef = /^\$([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(expr);
  if (simpleRef) {
    const name = simpleRef[1];
    if (!(name in config)) {
      console.warn(`Unknown parameter "$${name}" -- not found in config, using 1`);
      return 1;
    }
    return config[name];
  }

  const tokens = tokenize(expr);
  const parser = new Parser(tokens, config);
  return parser.parse();
}

/**
 * Evaluate a comparison expression and return a boolean.
 * The expression must contain a comparison operator (<=, >=, <, >, ==, !=).
 * Returns true if the comparison holds, false otherwise.
 */
export function evaluateComparison(
  expr: string,
  config: ParametricConfig,
): boolean {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens, config);
  const result = parser.parse();
  return result !== 0;
}
