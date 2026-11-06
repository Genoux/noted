// Inline calculator for lines ending in "=". A small recursive-descent parser:
// no eval(), so note text can never run as code.
//
//   12 × 4.5 + 20 =      → 74
//   20% of 150 =         → 30
//   $12 × 3 =            → $36
//   5 km in mi =         → 3.106856 mi
//   (2 + 3)^2 / 5 =      → 5

type Unit = { dim: string; factor: number; offset?: number };

const UNITS: Record<string, Unit> = {
  mm: { dim: "len", factor: 0.001 },
  cm: { dim: "len", factor: 0.01 },
  m: { dim: "len", factor: 1 },
  km: { dim: "len", factor: 1000 },
  in: { dim: "len", factor: 0.0254 },
  ft: { dim: "len", factor: 0.3048 },
  yd: { dim: "len", factor: 0.9144 },
  mi: { dim: "len", factor: 1609.344 },
  g: { dim: "mass", factor: 1 },
  kg: { dim: "mass", factor: 1000 },
  oz: { dim: "mass", factor: 28.349523125 },
  lb: { dim: "mass", factor: 453.59237 },
  ml: { dim: "vol", factor: 0.001 },
  l: { dim: "vol", factor: 1 },
  gal: { dim: "vol", factor: 3.785411784 },
  s: { dim: "time", factor: 1 },
  sec: { dim: "time", factor: 1 },
  min: { dim: "time", factor: 60 },
  h: { dim: "time", factor: 3600 },
  hr: { dim: "time", factor: 3600 },
  day: { dim: "time", factor: 86400 },
  days: { dim: "time", factor: 86400 },
  c: { dim: "temp", factor: 1, offset: 0 },
  f: { dim: "temp", factor: 5 / 9, offset: -32 },
  k: { dim: "temp", factor: 1, offset: -273.15 },
};

const CURRENCY = /^[$€£¥]/;

class Parser {
  private pos = 0;
  constructor(private readonly src: string) {}

  parse(): number | null {
    const value = this.expr();
    this.ws();
    return this.pos === this.src.length && Number.isFinite(value) ? value : null;
  }

  private ws(): void {
    while (this.src[this.pos] === " ") this.pos++;
  }

  private eat(...tokens: string[]): string | null {
    this.ws();
    for (const t of tokens) {
      if (this.src.startsWith(t, this.pos)) {
        this.pos += t.length;
        return t;
      }
    }
    return null;
  }

  /** True when the last term was a bare "N%", so "+ 10%" can mean ten percent of the total. */
  private percentTerm = false;

  private expr(): number {
    let value = this.term();
    for (;;) {
      const op = this.eat("+", "-", "−");
      if (!op) return value;
      this.percentTerm = false;
      const rhs = this.term();
      const amount = this.percentTerm ? value * rhs : rhs;
      value = op === "+" ? value + amount : value - amount;
    }
  }

  private term(): number {
    let value = this.power();
    for (;;) {
      const op = this.eat("*", "×", "x", "/", "÷");
      if (!op) return value;
      const rhs = this.power();
      this.percentTerm = false;
      value = op === "/" || op === "÷" ? value / rhs : value * rhs;
    }
  }

  private power(): number {
    const base = this.unary();
    return this.eat("^") ? base ** this.power() : base;
  }

  private unary(): number {
    if (this.eat("-", "−")) return -this.unary();
    this.eat("+");
    return this.percent();
  }

  /** "20% of 150", or a bare "20%" meaning 0.2. */
  private percent(): number {
    const value = this.atom();
    if (!this.eat("%")) return value;
    if (this.eat("of ")) return (value / 100) * this.unary();
    this.percentTerm = true;
    return value / 100;
  }

  private atom(): number {
    this.ws();
    if (this.eat("(")) {
      const value = this.expr();
      if (!this.eat(")")) return Number.NaN;
      return value;
    }
    const m = /^\d[\d,]*(\.\d+)?|^\.\d+/.exec(this.src.slice(this.pos));
    if (!m) return Number.NaN;
    this.pos += m[0].length;
    return Number(m[0].replace(/,/g, ""));
  }
}

function format(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const rounded = Number(n.toPrecision(10));
  return Math.abs(rounded) >= 1e15 || (rounded !== 0 && Math.abs(rounded) < 1e-6)
    ? rounded.toExponential(4)
    : String(rounded);
}

function convert(src: string): string | null {
  const m = /^(.+?)\s*([a-z]+)\s+(?:in|to)\s+([a-z]+)$/i.exec(src);
  if (!m) return null;
  const from = UNITS[m[2].toLowerCase()];
  const to = UNITS[m[3].toLowerCase()];
  const value = new Parser(m[1]).parse();
  if (!from || !to || from.dim !== to.dim || value === null) return null;
  const base = (value + (from.offset ?? 0)) * from.factor;
  const out = base / to.factor - (to.offset ?? 0);
  return `${format(out)} ${m[3]}`;
}

/** Evaluates the text before a trailing "=", or null if it isn't maths. */
export function evaluate(line: string): string | null {
  const m = /^(.*\S)\s*=\s*$/.exec(line);
  if (!m) return null;
  let src = m[1].replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, "").trim();
  // Must contain a digit and an operator, unit or %, so "a = " or "2026 =" stay quiet.
  if (!/\d/.test(src)) return null;

  const currency = CURRENCY.exec(src)?.[0] ?? "";
  if (currency) src = src.replace(/[$€£¥]/g, "");

  if (/[a-z]/i.test(src.replace(/\bof\b|\bx\b/gi, ""))) return convert(src);
  if (!/[+\-−*×x/÷^%(]/.test(src)) return null;

  const value = new Parser(src).parse();
  if (value === null) return null;
  return currency ? `${currency}${format(Math.round(value * 100) / 100)}` : format(value);
}
