---
slug: week-4-notes
title: "Week 4: Stub functions, validation, and heart-rate math"
date: "2026-05-14"
summary: "Minimal main + stubs; positive-only inputs; sentinel-driven program with fixed-prototype helpers."
tags: ["functions","stubs","validation","casting","sentinel"]
week: 4
---
# Week 4: Verification, stubs, and long-running dialogs

Spring 2026 **Lab 04** computes **target heart-rate** statistics from validated positives, following the “minimal `main`, stubbed helpers” scaffold from lecture. **Program 04** moves into a sentinel-driven interaction with **frozen function prototypes**—you implement bodies that sum, factorial, or reject invalid negativity inside a reusable prompt routine.

Conceptual spine: textbook functions material (Ch. 3 & 6) plus numeric casting (Ch. 4 emphasis on safe conversions).

## Concepts

- **Stubs compile before they are clever**: Returning `0`, `{}`, or comments lets you incremental-test `main` wiring.
- **Validation guard clauses**: Reject non-physical inputs up front with clear messages—don’t divide or subtract afterwards.
- **Floating formula, integer display**: When the rubric wants integer beats, apply `static_cast<int>(…)` *after* the precise `double` math, not before.
- **Sentinel loops**: Treat the sentinel as a first-class return from the prompt helper so `main` can exit cleanly without duplicating read logic.

Original stub sketch (names changed, not the official prototypes):

```cpp
#include <iostream>

double fluidPressure(double depthMeters, double density) {
  // TODO: replace with real physics; keeps build green today
  (void)depthMeters;
  (void)density;
  return 0.0;
}

int main() {
  double depth = 0.0;
  double rho = 1000.0;
  std::cout << "Depth (m) and density (kg/m^3): ";
  std::cin >> depth >> rho;
  if (depth <= 0.0 || rho <= 0.0) {
    std::cout << "Need positive inputs.\n";
    return 1;
  }
  double p = fluidPressure(depth, rho);
  std::cout << "Approximate pressure head: " << p << " Pa\n";
  return 0;
}
```

## Pitfalls checklist

- **Mixing integer division** into physics formulas—keep literals like `0.685` as doubles.
- **Shadowing parameters** inside helper functions—name return temporaries distinctly.
- **Forgetting factorial base cases**: `0!` and `1!` conventions matter for the grading script’s smoke tests.

## Bridge to Lab 04 & Program 04

- **Lab 04**: Implement each helper from the ApproxE-inspired template until the calculator prints all three numeric targets.
- **Program 04**: Respect exact `int myPrompt(void);`, `int mySum(int);`, `int myFact(int);` declarations—behavior changes by numeric range in the assignment text.
