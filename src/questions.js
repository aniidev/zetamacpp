import { enabledOperators } from './config.js';

// Inclusive random integer in [min, max]. Range endpoints are normalized so a
// reversed range (min > max) entered in the config still behaves sensibly.
function randInt(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate a single question given the config.
// Returns { operand1, operand2, operator, answer } where operand1/operand2 are
// the numbers actually SHOWN on screen (important for operator-confusion detection).
export function generateQuestion(cfg) {
  const ops = enabledOperators(cfg);
  const operator = pick(ops);

  switch (operator) {
    case '+': {
      const x = randInt(cfg.addition.a, cfg.addition.b);
      const y = randInt(cfg.addition.c, cfg.addition.d);
      return { operand1: x, operand2: y, operator: '+', answer: x + y };
    }
    case '-': {
      // "Addition problems in reverse": build an addition problem, then present
      // its sum minus one operand, so the result is a non-negative integer.
      const x = randInt(cfg.addition.a, cfg.addition.b);
      const y = randInt(cfg.addition.c, cfg.addition.d);
      const sum = x + y;
      // subtract y -> answer x  (equivalently could subtract x -> answer y)
      return { operand1: sum, operand2: y, operator: '-', answer: x };
    }
    case '*': {
      const x = randInt(cfg.multiplication.a, cfg.multiplication.b);
      const y = randInt(cfg.multiplication.c, cfg.multiplication.d);
      return { operand1: x, operand2: y, operator: '*', answer: x * y };
    }
    case '/': {
      // "Multiplication problems in reverse": build a product of two factors,
      // then present product / divisor = quotient. As in standard Zetamac, the
      // DIVISOR is always the first-range factor (2..12 by default) — i.e. the
      // number you divide by is never larger than the first range's max — and
      // the quotient is the second-range factor (2..100). Because the divisor
      // is an exact factor of the product, the quotient is ALWAYS an integer.
      const divisor = randInt(cfg.multiplication.a, cfg.multiplication.b); // ≤ 12 by default
      const quotient = randInt(cfg.multiplication.c, cfg.multiplication.d);
      if (divisor <= 0) {
        // Only reachable if the first range is set to 0; avoid divide-by-zero.
        return { operand1: 0, operand2: 1, operator: '/', answer: 0 };
      }
      return { operand1: divisor * quotient, operand2: divisor, operator: '/', answer: quotient };
    }
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

export const OP_SYMBOL = {
  '+': '+',
  '-': '−', // minus sign
  '*': '×', // multiplication sign
  '/': '÷', // division sign
};

export function formatQuestion(q) {
  return `${q.operand1} ${OP_SYMBOL[q.operator]} ${q.operand2}`;
}
