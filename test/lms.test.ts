import { describe, expect, it } from "vitest";
import {
  ageInDays,
  bmi,
  classify,
  correctedAgeInDays,
  evaluate,
  getTable,
  headCircumferenceForAge,
  heightForAge,
  lmsToZScore,
  OutOfRangeError,
  percentileToZScore,
  valueAtZScore,
  weightForAge,
  weightForLength,
  zScoreToPercentile,
} from "../src/index";

describe("LMS maths", () => {
  it("returns z = 0 at the median", () => {
    expect(lmsToZScore(10, 0.5, 10, 0.1)).toBeCloseTo(0, 12);
  });

  it("uses the logarithmic form when L = 0", () => {
    // The power form is undefined at L = 0; the limit is ln(X/M)/S.
    expect(lmsToZScore(12, 0, 10, 0.12)).toBeCloseTo(Math.log(1.2) / 0.12, 12);
  });

  it("approaches the logarithmic form as L → 0", () => {
    // Continuity check. Note this cannot be pushed arbitrarily close to zero:
    // (X/M)^L − 1 loses significant digits catastrophically for tiny L, so the
    // agreement gets *worse* below ~1e-8. That's floating point, not the maths.
    const atZero = lmsToZScore(12, 0, 10, 0.12);
    expect(lmsToZScore(12, 1e-6, 10, 0.12)).toBeCloseTo(atZero, 4);
    expect(lmsToZScore(12, 1e-8, 10, 0.12)).toBeCloseTo(atZero, 4);
  });

  it("round-trips z ↔ percentile", () => {
    for (const z of [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3]) {
      expect(percentileToZScore(zScoreToPercentile(z))).toBeCloseTo(z, 4);
    }
  });

  it("matches known normal-distribution values", () => {
    expect(zScoreToPercentile(0)).toBeCloseTo(50, 6);
    expect(zScoreToPercentile(1)).toBeCloseTo(84.13, 1);
    expect(zScoreToPercentile(-2)).toBeCloseTo(2.275, 2);
  });
});

describe("WHO tables", () => {
  it("reproduces the published median at birth", () => {
    // WHO WFA boys, day 0: M = 3.3464 kg — a value at the median must give z = 0.
    const r = weightForAge(3.3464, { sex: "male", ageDays: 0 });
    expect(r.zScore).toBeCloseTo(0, 6);
    expect(r.percentile).toBeCloseTo(50, 4);
  });

  it("reproduces published SD cut-offs", () => {
    // WHO WFA boys day 0: −2 SD = 2.459 kg, +2 SD = 4.419 kg (published table).
    expect(valueAtZScore("wfa", "male", -2, 0)).toBeCloseTo(2.459, 2);
    const minusTwo = weightForAge(2.459, { sex: "male", ageDays: 0 });
    expect(minusTwo.zScore).toBeCloseTo(-2, 2);
  });

  it("covers the full 0–5 years range for age-based indicators", () => {
    for (const indicator of ["wfa", "lhfa", "hcfa", "bfa"] as const) {
      const table = getTable(indicator, "male");
      expect(table.start).toBe(0);
      expect(table.lms.length).toBe(1857); // days 0…1856
    }
  });

  it("length and height tables cover their published ranges", () => {
    const wfl = getTable("wfl", "female");
    expect(wfl.start).toBe(45);
    const wfh = getTable("wfh", "female");
    expect(wfh.start).toBe(65);
  });

  it("differentiates sexes", () => {
    const boy = weightForAge(3.3, { sex: "male", ageDays: 0 });
    const girl = weightForAge(3.3, { sex: "female", ageDays: 0 });
    expect(boy.zScore).not.toBeCloseTo(girl.zScore, 3);
  });
});

describe("interpolation", () => {
  it("interpolates between grid points", () => {
    const a = weightForAge(7, { sex: "male", ageDays: 100 });
    const b = weightForAge(7, { sex: "male", ageDays: 101 });
    const mid = weightForAge(7, { sex: "male", ageDays: 100.5 });
    expect(mid.zScore).toBeGreaterThan(Math.min(a.zScore, b.zScore));
    expect(mid.zScore).toBeLessThan(Math.max(a.zScore, b.zScore));
  });
});

describe("out of range", () => {
  it("throws past the published range by default", () => {
    expect(() => weightForAge(20, { sex: "male", ageDays: 2000 })).toThrow(OutOfRangeError);
  });

  it("clamps when asked, and says so", () => {
    const r = weightForAge(20, { sex: "male", ageDays: 2000, clamp: true });
    expect(r.clamped).toBe(true);
    expect(r.x).toBe(1856);
  });

  it("rejects non-positive measurements", () => {
    expect(() => weightForAge(0, { sex: "male", ageDays: 30 })).toThrow(RangeError);
  });
});

describe("helpers", () => {
  it("computes BMI", () => {
    expect(bmi(10, 75)).toBeCloseTo(17.78, 2);
  });

  it("counts whole days across a DST boundary", () => {
    expect(ageInDays(new Date(2026, 2, 1), new Date(2026, 2, 31))).toBe(30);
  });

  it("corrects age for prematurity", () => {
    // Born at 32 weeks = 8 weeks early = 56 days.
    expect(correctedAgeInDays(100, 32)).toBe(44);
    // Never goes negative.
    expect(correctedAgeInDays(10, 28)).toBe(0);
  });

  it("leaves term births alone, including early term", () => {
    // 37 weeks is the preterm boundary — at and above it, nothing is corrected.
    // Correcting a 38-weeker would shave 14 days off and inflate its percentile.
    for (const weeks of [37, 38, 39, 40, 41, 42]) {
      expect(correctedAgeInDays(100, weeks)).toBe(100);
    }
    // One week earlier is preterm and does get corrected.
    expect(correctedAgeInDays(100, 36)).toBe(72);
  });

  it("classifies by WHO cut-offs", () => {
    expect(classify(0)).toBe("normal");
    expect(classify(-2.5)).toBe("low");
    expect(classify(-3.5)).toBe("severely low");
    expect(classify(2.5)).toBe("high");
    expect(classify(3.5)).toBe("severely high");
  });
});

describe("all indicators are wired up", () => {
  it("evaluates every indicator without throwing", () => {
    expect(heightForAge(75, { sex: "female", ageDays: 365 }).percentile).toBeGreaterThan(0);
    expect(headCircumferenceForAge(45, { sex: "male", ageDays: 180 }).percentile).toBeGreaterThan(0);
    expect(evaluate("bfa", "female", 16, 500).percentile).toBeGreaterThan(0);
    expect(weightForLength(9.5, 74, "male").percentile).toBeGreaterThan(0);
  });
});
