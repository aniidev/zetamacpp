// Default configuration — matches real Zetamac defaults.
// Addition:       2..100 + 2..100
// Subtraction:    "addition problems in reverse" (derived from addition range)
// Multiplication: 2..12  x 2..100
// Division:       "multiplication problems in reverse" (derived from mult range)

export const DURATIONS = [30, 60, 120, 300, 600];
export const DEFAULT_DURATION = 120;

export function defaultConfig() {
  return {
    duration: DEFAULT_DURATION,
    addition: {
      enabled: true,
      a: 2, b: 100, // first operand range
      c: 2, d: 100, // second operand range
    },
    subtraction: {
      enabled: true, // "addition problems in reverse" — uses the addition range
    },
    multiplication: {
      enabled: true,
      a: 2, b: 12,
      c: 2, d: 100,
    },
    division: {
      enabled: true, // "multiplication problems in reverse" — uses the mult range
    },
  };
}

// Which operations are actually active (have >=1 enabled).
export function enabledOperators(cfg) {
  const ops = [];
  if (cfg.addition.enabled) ops.push('+');
  if (cfg.subtraction.enabled) ops.push('-');
  if (cfg.multiplication.enabled) ops.push('*');
  if (cfg.division.enabled) ops.push('/');
  return ops;
}
