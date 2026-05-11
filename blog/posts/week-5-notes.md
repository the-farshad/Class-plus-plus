---
slug: week-5-notes
title: "Week 5: Float vs double precision and \u03c0 series"
date: "2026-05-15"
summary: "Formatting with iomanip; reciprocal sums; alternating series for \u03c0 without pow/atan in the series step."
tags: ["double","float","iomanip","series","numeric-error"]
week: 5
---
# Week 5: Precision tables and alternating series for π

**Lab 05** compares **float vs. double** behavior on a reciprocal table similar to lecture’s `DoTable` demo—expect to adjust `iomanip` widths and `DBL_DIG`. **Program 05** evaluates a truncated **Madhava–Leibniz** style sum for π with user-chosen index limits, tight formatting, and no `pow` / `atan` shortcuts for the series term itself.

## Concepts

- **Decimal vs. binary fractions**: `0.1` repeats in binary; summing millions of unlike magnitudes teaches you why `double` matters.
- **`std::setprecision` + `fixed`**: Control significant figures for graders and for visual comparison between float/double runs.
- **Alternating signs**: Track `(-1)^k` with a dedicated `sign` integer that flips each iteration—clearer than calling expensive helpers.
- **Non-negative guard**: Reprompt until the limit meets the rubric—don’t silently clamp user error.

Illustrative term generator (not the full assignment loop):

```cpp
double leibnizTerm(unsigned k) {
  double sign = (k % 2u == 0u) ? 1.0 : -1.0;
  double denom = static_cast<double>(2 * k + 1);
  return 4.0 * sign / denom;
}
```

## Pitfalls checklist

- **Printing more precision than the type holds**—align column widths with `DBL_DIG` commentary in your lab transcript.
- **Using prohibited library helpers** in the series core when the PDF forbids them—read the bullet list literally.
- **K vs. iteration count**: Know whether the loop inclusive upper bound matches the PDF variable name (off-by-one bugs love this assignment).

## Bridge to Lab 05 & Program 05

- **Lab 05**: Side-by-side narrative in `Lab05Test.txt` explaining how float rounding diverged from double at the same recipe.
- **Program 05**: Show convergence numerically in the transcript—larger admissible `k`, closer to catalog π on your platform.
