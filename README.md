# who-growth-standards

WHO Child Growth Standards — z-scores and percentiles, computed locally.

The official WHO LMS tables are bundled in the package. Every calculation runs in-process: no network calls, no API keys, no data leaving the device. Zero runtime dependencies.

```bash
npm install who-growth-standards
```

## Why this exists

Working out a child's percentile is a small piece of maths on top of a large table of constants. Most implementations solve it one of two ways: ship a rough approximation of the curves, or send the child's measurements to a server.

Neither is great when the input is a baby's weight. So this package takes the third path — bundle the real tables, compute locally, and be explicit about what the numbers mean.

## Quick start

```ts
import { weightForAge, ageInDays, classify } from "who-growth-standards";

const age = ageInDays(new Date("2025-11-14"));   // days since that birthday
const result = weightForAge(8.9, { sex: "female", ageDays: 279 });

result.zScore;      // 0.5993…
result.percentile;  // 72.55…
result.median;      // 8.27  — the 50th-percentile weight at this age
classify(result.zScore);  // "normal"
```

Every indicator follows the same shape:

```ts
import {
  weightForAge,
  heightForAge,
  headCircumferenceForAge,
  bmiForAge,
  weightForLength,
  weightForHeight,
  bmi,
} from "who-growth-standards";

const input = { sex: "male", ageDays: 400 } as const;

heightForAge(78.5, input);
headCircumferenceForAge(47.1, input);
bmiForAge(bmi(10.2, 78.5), input);

// Weight relative to body size rather than age — the question
// "is this weight right for this child", independent of how old they are.
weightForLength(10.2, 78.5, "male");   // under 2 years, measured lying down
weightForHeight(14.0, 95.0, "male");   // 2 years and over, measured standing
```

## What's included

| Indicator | Function | Range | x-axis |
|---|---|---|---|
| Weight-for-age | `weightForAge` | 0–1856 days (0–5 y) | age in days |
| Length/height-for-age | `heightForAge` | 0–1856 days | age in days |
| Head-circumference-for-age | `headCircumferenceForAge` | 0–1856 days | age in days |
| BMI-for-age | `bmiForAge` | 0–1856 days | age in days |
| Weight-for-length | `weightForLength` | 45–110 cm | length in cm |
| Weight-for-height | `weightForHeight` | 65–120 cm | height in cm |

Both sexes, daily resolution for age-based indicators, 0.1 cm for the rest. That's 12 tables and roughly 17 000 published LMS triples.

## Preterm infants

WHO standards describe infants born at term. Applied to a preterm baby without correction, they overstate every deficit — often dramatically:

```ts
import { correctedAgeInDays, weightForAge, classify } from "who-growth-standards";

const chronological = 120;                              // days since birth
const corrected = correctedAgeInDays(chronological, 32); // born at 32 weeks → 64

weightForAge(5.2, { sex: "male", ageDays: chronological }).zScore;  // −2.53 → "low"
weightForAge(5.2, { sex: "male", ageDays: corrected }).zScore;      // −0.69 → "normal"
```

Same baby, same weight, opposite conclusions. Correction is conventionally applied until 2 years, or 3 for extreme prematurity — that cut-off is a clinical judgement, so this library computes the corrected age and leaves the decision to you.

Only births before **37 weeks** are corrected. 37–39 weeks is term, and correcting a term baby would quietly inflate its percentile, so `correctedAgeInDays` returns the chronological age unchanged from 37 weeks up.

One thing correction does **not** apply to: vaccination schedules, which follow chronological age.

## Drawing charts

WHO growth charts are drawn at whole standard deviations, not at percentiles:

```ts
import { valueAtZScore, valueAtPercentile } from "who-growth-standards";

valueAtZScore("wfa", "female", -2, 365);   // 7.0  kg — the −2 SD line at 12 months
valueAtZScore("wfa", "female", 0, 365);    // 8.9  kg
valueAtZScore("wfa", "female", 2, 365);    // 11.5 kg

valueAtPercentile("lhfa", "male", 97, 365); // height at the 97th percentile
```

## Out-of-range input

By default, values outside the published range throw rather than silently returning nonsense:

```ts
weightForAge(20, { sex: "male", ageDays: 2000 });
// OutOfRangeError: wfa: x=2000 is outside the WHO range [0, 1856].

weightForAge(20, { sex: "male", ageDays: 2000, clamp: true });
// → { zScore: …, x: 1856, clamped: true }
```

Clamping is useful for charts, risky for anything clinical — hence opt-in, with `clamped: true` on the result so you can tell.

## The maths

Z-scores use the LMS (Box–Cox) method:

```
L ≠ 0:  z = ((X / M)^L − 1) / (L × S)
L = 0:  z = ln(X / M) / S
```

The `L = 0` branch is not decorative — several WHO tables publish L values that cross or approach zero, where the power form is undefined.

Percentiles come from the standard normal CDF via an Abramowitz & Stegun erf approximation (|ε| < 1.5 × 10⁻⁷); the inverse uses Acklam's rational approximation.

Between grid points, LMS parameters are interpolated linearly. The tables are dense — daily for age, 0.1 cm for length — so the interpolation error sits far below measurement precision, but it does matter for the fractional days and half-centimetres that real applications pass in.

Low-level pieces are exported if you'd rather assemble your own:

```ts
import { lmsToZScore, zScoreToValue, zScoreToPercentile, lookupLms, getTable } from "who-growth-standards";
```

## Data provenance

Tables come from the [WHO Child Growth Standards](https://www.who.int/tools/child-growth-standards) expanded tables, published by the World Health Organization. Files under `src/data/` are generated, never edited by hand:

```bash
npm run generate-data   # downloads from cdn.who.int and regenerates src/data/*.ts
```

The generator (`scripts/generate-data.py`, requires `openpyxl`) keeps the source URLs in one place, so refreshing against a future WHO revision is one command rather than an archaeology project.

## Scope and limits

**This library computes numbers. It does not interpret them.** `classify()` reports where a value falls against WHO cut-offs — that is a description of a reference population, not a diagnosis. Growth outside the usual range can be perfectly normal for a given child, and growth inside it does not rule anything out. Those judgements belong to a clinician who has seen the child.

Also worth knowing:

- WHO standards cover **0–5 years**. Beyond that, different references apply (WHO 2007 growth reference for 5–19 years is not included here).
- Length and height are not interchangeable. Under 2 years children are measured lying down (length), from 2 years standing (height) — a difference of roughly 0.7 cm. Use `weightForLength` and `weightForHeight` accordingly.
- The library takes measurements at face value. Unit mistakes — pounds for kilograms, inches for centimetres — will produce confident, wrong answers.

## Contributing

Issues and pull requests welcome. Useful directions:

- WHO 2007 reference for children and adolescents 5–19 years
- Arm circumference and skinfold indicators (published by WHO, not yet bundled)
- Velocity standards (growth over intervals, not single points)
- Smaller bundle: the tables compress well, but tree-shaking per indicator could be better

## License

MIT — see [LICENSE](LICENSE).

The bundled WHO data is published by the World Health Organization and reproduced here for computational use; see [NOTICE](NOTICE). This project is not affiliated with or endorsed by the WHO.

---

Built while working on [Sunny Seed](https://sunnyseed.app), a baby journal that computes these percentiles on the device.
