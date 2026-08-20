/**
 * Run with: npx tsx examples/basic.ts
 */
import {
  ageInDays,
  bmi,
  bmiForAge,
  classify,
  correctedAgeInDays,
  headCircumferenceForAge,
  heightForAge,
  valueAtZScore,
  weightForAge,
  weightForLength,
} from "../src/index";

// ── 1. A single measurement ──────────────────────────────────────────────────

const birth = new Date("2025-11-14");
const age = ageInDays(birth, new Date("2026-08-20"));

const weight = weightForAge(8.9, { sex: "female", ageDays: age });
console.log(`Age ${age} days`);
console.log(`  weight 8.9 kg → z ${weight.zScore.toFixed(2)}, ` +
  `${weight.percentile.toFixed(1)}th percentile (${classify(weight.zScore)})`);
console.log(`  median for this age: ${weight.median.toFixed(2)} kg`);

// ── 2. Every indicator at once ───────────────────────────────────────────────

const height = heightForAge(71.5, { sex: "female", ageDays: age });
const head = headCircumferenceForAge(44.2, { sex: "female", ageDays: age });
const bmiValue = bmi(8.9, 71.5);
const bmiResult = bmiForAge(bmiValue, { sex: "female", ageDays: age });

console.log("\nFull picture:");
for (const [label, r] of [["weight", weight], ["height", height], ["head", head], ["BMI", bmiResult]] as const) {
  console.log(`  ${label.padEnd(7)} z ${r.zScore.toFixed(2).padStart(6)}  ` +
    `p${r.percentile.toFixed(1).padStart(5)}  ${classify(r.zScore)}`);
}

// ── 3. Weight relative to length, not age ────────────────────────────────────
// The indicator paediatricians reach for when a child is short or tall for age:
// it asks "is this weight right for this body", independent of how old they are.

const proportion = weightForLength(8.9, 71.5, "female");
console.log(`\nWeight-for-length: z ${proportion.zScore.toFixed(2)} (${classify(proportion.zScore)})`);

// ── 4. Preterm correction ────────────────────────────────────────────────────
// WHO standards describe term infants. Applying them to a baby born at 32
// weeks without correcting overstates every deficit.

const chronological = 120;
const corrected = correctedAgeInDays(chronological, 32);
const uncorrected = weightForAge(5.2, { sex: "male", ageDays: chronological });
const withCorrection = weightForAge(5.2, { sex: "male", ageDays: corrected });

console.log(`\nPreterm, born at 32 weeks, ${chronological} days old:`);
console.log(`  without correction: z ${uncorrected.zScore.toFixed(2)} (${classify(uncorrected.zScore)})`);
console.log(`  corrected age ${corrected} days: z ${withCorrection.zScore.toFixed(2)} (${classify(withCorrection.zScore)})`);

// ── 5. Drawing a chart ───────────────────────────────────────────────────────
// WHO charts are drawn at whole standard deviations, not percentiles.

console.log("\nWeight-for-age reference curves, girls, first 12 months:");
console.log("  month   -2SD  median   +2SD");
for (let month = 0; month <= 12; month += 3) {
  const days = Math.round(month * 30.4375);
  const low = valueAtZScore("wfa", "female", -2, days);
  const mid = valueAtZScore("wfa", "female", 0, days);
  const high = valueAtZScore("wfa", "female", 2, days);
  console.log(`  ${String(month).padStart(5)}   ${low.toFixed(1).padStart(4)}   ` +
    `${mid.toFixed(1).padStart(5)}   ${high.toFixed(1).padStart(4)}`);
}
