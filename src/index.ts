/**
 * WHO Child Growth Standards — z-scores and percentiles, computed locally.
 *
 * No network calls, no API keys. The official WHO LMS tables are bundled and
 * every calculation happens in-process, which is what you want when the input
 * is a child's weight.
 *
 * @packageDocumentation
 */

import { WFA_BOYS, WFA_GIRLS } from "./data/wfa";
import { LHFA_BOYS, LHFA_GIRLS } from "./data/lhfa";
import { HCFA_BOYS, HCFA_GIRLS } from "./data/hcfa";
import { BFA_BOYS, BFA_GIRLS } from "./data/bfa";
import { WFL_BOYS, WFL_GIRLS } from "./data/wfl";
import { WFH_BOYS, WFH_GIRLS } from "./data/wfh";
import {
  lmsToZScore,
  lookupLms,
  percentileToZScore,
  zScoreToPercentile,
  zScoreToValue,
} from "./lms";
import type { GrowthResult, Indicator, LmsTable, Sex } from "./types";

export { OutOfRangeError } from "./types";
export type { GrowthResult, Indicator, LmsTable, Sex, XAxis } from "./types";
export {
  lmsToZScore,
  zScoreToValue,
  zScoreToPercentile,
  percentileToZScore,
  lookupLms,
} from "./lms";

const TABLES: Record<Indicator, Record<Sex, LmsTable>> = {
  wfa: { male: WFA_BOYS, female: WFA_GIRLS },
  lhfa: { male: LHFA_BOYS, female: LHFA_GIRLS },
  hcfa: { male: HCFA_BOYS, female: HCFA_GIRLS },
  bfa: { male: BFA_BOYS, female: BFA_GIRLS },
  wfl: { male: WFL_BOYS, female: WFL_GIRLS },
  wfh: { male: WFH_BOYS, female: WFH_GIRLS },
};

/** Get the raw WHO table for an indicator and sex. */
export function getTable(indicator: Indicator, sex: Sex): LmsTable {
  return TABLES[indicator][sex];
}

export interface EvaluateOptions {
  /**
   * Clamp out-of-range input to the nearest published bound instead of
   * throwing. Useful for charts; risky for clinical read-outs, so it's off
   * by default.
   */
  clamp?: boolean;
}

export interface AgeBasedInput {
  sex: Sex;
  /** Age in days. Use {@link ageInDays} if you have dates. */
  ageDays: number;
  clamp?: boolean;
}

/**
 * Evaluate a measurement against a WHO standard.
 *
 * @param indicator which standard to use
 * @param value the measurement (kg for weight, cm for length/height/head, kg/m² for BMI)
 * @param x age in days, or length/height in cm for `wfl`/`wfh`
 */
export function evaluate(
  indicator: Indicator,
  sex: Sex,
  value: number,
  x: number,
  options: EvaluateOptions = {},
): GrowthResult {
  const table = getTable(indicator, sex);
  const { l, m, s, x: usedX, clamped } = lookupLms(table, x, options);
  const zScore = lmsToZScore(value, l, m, s);
  return {
    indicator,
    sex,
    zScore,
    percentile: zScoreToPercentile(zScore),
    median: m,
    x: usedX,
    clamped,
  };
}

/** Weight-for-age. `weightKg` in kilograms. */
export function weightForAge(weightKg: number, input: AgeBasedInput): GrowthResult {
  return evaluate("wfa", input.sex, weightKg, input.ageDays, { clamp: input.clamp });
}

/** Length/height-for-age. `heightCm` in centimetres. */
export function heightForAge(heightCm: number, input: AgeBasedInput): GrowthResult {
  return evaluate("lhfa", input.sex, heightCm, input.ageDays, { clamp: input.clamp });
}

/** Head-circumference-for-age. `headCm` in centimetres. */
export function headCircumferenceForAge(headCm: number, input: AgeBasedInput): GrowthResult {
  return evaluate("hcfa", input.sex, headCm, input.ageDays, { clamp: input.clamp });
}

/** BMI-for-age. Pass BMI in kg/m², or use {@link bmi} to compute it. */
export function bmiForAge(bmiValue: number, input: AgeBasedInput): GrowthResult {
  return evaluate("bfa", input.sex, bmiValue, input.ageDays, { clamp: input.clamp });
}

/**
 * Weight-for-length (recumbent, WHO publishes 45–110 cm).
 * Intended for children under 2 years, who are measured lying down.
 */
export function weightForLength(
  weightKg: number,
  lengthCm: number,
  sex: Sex,
  options: EvaluateOptions = {},
): GrowthResult {
  return evaluate("wfl", sex, weightKg, lengthCm, options);
}

/**
 * Weight-for-height (standing, WHO publishes 65–120 cm).
 * Intended for children 2 years and over, who are measured standing.
 */
export function weightForHeight(
  weightKg: number,
  heightCm: number,
  sex: Sex,
  options: EvaluateOptions = {},
): GrowthResult {
  return evaluate("wfh", sex, weightKg, heightCm, options);
}

/** BMI in kg/m² from weight in kg and height in cm. */
export function bmi(weightKg: number, heightCm: number): number {
  const metres = heightCm / 100;
  return weightKg / (metres * metres);
}

/**
 * Whole days between two dates, using UTC midnights so daylight-saving
 * transitions can't shift a birthday by one day.
 */
export function ageInDays(birthDate: Date, on: Date = new Date()): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((utc(on) - utc(birthDate)) / 86_400_000);
}

/** Below this gestational age a birth is preterm and the age gets corrected. */
const PRETERM_THRESHOLD_WEEKS = 37;

/**
 * Corrected age for preterm infants: chronological age minus the weeks
 * missing from a 40-week term.
 *
 * WHO growth standards are built on term infants, so applying them to a
 * preterm baby without correction overstates every deficit. Correction is
 * conventionally applied until 2 years (24 months), or 3 years for extreme
 * prematurity — the cut-off is a clinical decision, so this function leaves it
 * to the caller and simply returns the corrected value.
 *
 * Only births before 37 weeks are corrected. 37–39 weeks is term (WHO calls
 * 37–38 "early term"), and no guideline corrects those: shaving days off a
 * term baby's age would silently inflate its percentile.
 *
 * Note: correction applies to growth and development, **not** to vaccination
 * schedules, which follow chronological age.
 */
export function correctedAgeInDays(ageDays: number, gestationalAgeWeeks: number): number {
  if (gestationalAgeWeeks >= PRETERM_THRESHOLD_WEEKS) return ageDays;
  return Math.max(0, ageDays - (40 - gestationalAgeWeeks) * 7);
}

/**
 * The measurement that sits exactly on a given percentile — the inverse
 * question, used to draw reference curves.
 */
export function valueAtPercentile(
  indicator: Indicator,
  sex: Sex,
  percentile: number,
  x: number,
  options: EvaluateOptions = {},
): number {
  const table = getTable(indicator, sex);
  const { l, m, s } = lookupLms(table, x, options);
  return zScoreToValue(percentileToZScore(percentile), l, m, s);
}

/**
 * The measurement at a given z-score. WHO charts are drawn at whole
 * standard deviations (−3, −2, −1, 0, +1, +2, +3), not at percentiles.
 */
export function valueAtZScore(
  indicator: Indicator,
  sex: Sex,
  zScore: number,
  x: number,
  options: EvaluateOptions = {},
): number {
  const table = getTable(indicator, sex);
  const { l, m, s } = lookupLms(table, x, options);
  return zScoreToValue(zScore, l, m, s);
}

/**
 * Interpretation of a z-score following WHO cut-offs.
 *
 * These are the thresholds used in WHO growth monitoring; they describe where
 * a value sits in the reference population and are **not** a diagnosis.
 */
export function classify(zScore: number): "severely low" | "low" | "normal" | "high" | "severely high" {
  if (zScore < -3) return "severely low";
  if (zScore < -2) return "low";
  if (zScore > 3) return "severely high";
  if (zScore > 2) return "high";
  return "normal";
}
