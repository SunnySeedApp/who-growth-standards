import type { LmsTable } from "./types";
import { OutOfRangeError } from "./types";

/**
 * Convert a measurement to a z-score using the LMS (Box-Cox) method.
 *
 * ```
 * L ≠ 0:  z = ((X / M)^L − 1) / (L × S)
 * L = 0:  z = ln(X / M) / S
 * ```
 *
 * The `L = 0` branch matters: several WHO tables (length-for-age,
 * head-circumference-for-age) publish L values that are exactly 1, but
 * skinfold and BMI tables can approach zero, where the power form is
 * undefined and the logarithmic limit applies.
 */
export function lmsToZScore(x: number, l: number, m: number, s: number): number {
  if (x <= 0) throw new RangeError(`measurement must be positive, got ${x}`);
  if (m <= 0) throw new RangeError(`invalid median M=${m}`);
  if (s <= 0) throw new RangeError(`invalid coefficient of variation S=${s}`);
  return l === 0 ? Math.log(x / m) / s : (Math.pow(x / m, l) - 1) / (l * s);
}

/** Inverse of {@link lmsToZScore}: the measurement at a given z-score. */
export function zScoreToValue(z: number, l: number, m: number, s: number): number {
  return l === 0 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}

/**
 * Standard normal CDF, expressed through a high-accuracy erf approximation
 * (Abramowitz & Stegun 7.1.26, |ε| < 1.5e-7). Returns a percentile in 0–100.
 */
export function zScoreToPercentile(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const a = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-a * a);
  return 50 * (1 + sign * y);
}

/** Inverse normal CDF (percentile 0–100 → z), Acklam's rational approximation. */
export function percentileToZScore(percentile: number): number {
  if (percentile <= 0 || percentile >= 100) {
    throw new RangeError(`percentile must be strictly between 0 and 100, got ${percentile}`);
  }
  const p = percentile / 100;
  const [a0, a1, a2, a3, a4, a5] = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const [b0, b1, b2, b3, b4] = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const [c0, c1, c2, c3, c4, c5] = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const [d0, d1, d2, d3] = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5) /
      ((((d0 * q + d1) * q + d2) * q + d3) * q + 1);
  }
  if (p > 1 - pLow) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5) /
      ((((d0 * q + d1) * q + d2) * q + d3) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a0 * r + a1) * r + a2) * r + a3) * r + a4) * r + a5) * q /
    (((((b0 * r + b1) * r + b2) * r + b3) * r + b4) * r + 1);
}

export interface LookupOptions {
  /** Clamp x to the table bounds instead of throwing. Default: false. */
  clamp?: boolean;
}

export interface LookupResult {
  l: number;
  m: number;
  s: number;
  x: number;
  clamped: boolean;
}

/**
 * Find LMS parameters for an arbitrary x, interpolating linearly between the
 * two nearest grid points.
 *
 * WHO tables are dense (daily for age, 0.1 cm for length/height), so linear
 * interpolation introduces error far below measurement precision — but it does
 * matter for fractional days and half-centimetres, which is exactly what real
 * apps pass in.
 */
export function lookupLms(
  table: LmsTable,
  x: number,
  options: LookupOptions = {},
): LookupResult {
  const min = table.start;
  const max = table.start + table.step * (table.lms.length - 1);

  let clamped = false;
  let value = x;
  if (x < min || x > max) {
    if (!options.clamp) throw new OutOfRangeError(table.indicator, x, min, max);
    value = x < min ? min : max;
    clamped = true;
  }

  const position = (value - min) / table.step;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, table.lms.length - 1);
  const fraction = position - lower;

  const low = table.lms[lower];
  const high = table.lms[upper];
  if (low === undefined || high === undefined) {
    throw new RangeError(`${table.indicator}: no LMS row for x=${value}`);
  }

  const [l1, m1, s1] = low;
  if (fraction === 0 || lower === upper) {
    return { l: l1, m: m1, s: s1, x: value, clamped };
  }
  const [l2, m2, s2] = high;
  return {
    l: l1 + (l2 - l1) * fraction,
    m: m1 + (m2 - m1) * fraction,
    s: s1 + (s2 - s1) * fraction,
    x: value,
    clamped,
  };
}
