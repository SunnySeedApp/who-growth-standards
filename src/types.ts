/** Sex as defined by the WHO Child Growth Standards. */
export type Sex = "male" | "female";

/** Growth indicator published by the WHO. */
export type Indicator =
  /** Weight-for-age, 0–5 years */
  | "wfa"
  /** Length/height-for-age, 0–5 years */
  | "lhfa"
  /** Head-circumference-for-age, 0–5 years */
  | "hcfa"
  /** BMI-for-age, 0–5 years */
  | "bfa"
  /** Weight-for-length, 45–110 cm (recumbent, under 2 years) */
  | "wfl"
  /** Weight-for-height, 65–120 cm (standing, 2 years and over) */
  | "wfh";

/** What the table is indexed by. */
export type XAxis = "day" | "length" | "height";

/**
 * One WHO reference table: LMS parameters on an evenly spaced grid.
 *
 * `lms[i]` corresponds to `x = start + i * step` and holds `[L, M, S]`.
 */
export interface LmsTable {
  indicator: Indicator;
  sex: Sex;
  xAxis: XAxis;
  /** First x value in the table. */
  start: number;
  /** Distance between consecutive x values. */
  step: number;
  lms: ReadonlyArray<readonly [number, number, number]>;
}

/** Result of evaluating a measurement against a WHO standard. */
export interface GrowthResult {
  indicator: Indicator;
  sex: Sex;
  /** Standard deviations from the median. */
  zScore: number;
  /** Percentile, 0–100. */
  percentile: number;
  /** Median (M) for this x — the "50th percentile" value. */
  median: number;
  /** The x the measurement was evaluated at (days, or cm). */
  x: number;
  /** True when x fell outside the published range and was clamped. */
  clamped: boolean;
}

export class OutOfRangeError extends Error {
  constructor(
    readonly indicator: Indicator,
    readonly x: number,
    readonly min: number,
    readonly max: number,
  ) {
    super(
      `${indicator}: x=${x} is outside the WHO range [${min}, ${max}]. ` +
        `Pass { clamp: true } to clamp to the nearest bound instead.`,
    );
    this.name = "OutOfRangeError";
  }
}
