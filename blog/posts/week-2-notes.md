---
slug: week-2-notes
title: "Week 2: Planning, selection, and bounded products"
date: "2026-05-12"
summary: "Pseudocode discipline; if/else menus; program multiplies every integer in an interval (order flexible)."
tags: ["pseudocode","if-else","planning","loops","arithmetics"]
week: 2
---
# Week 2: Pseudocode, branching, and multiplying ranges

This week pairs **Lab 02** with **Program 02** in Spring 2026. The lab stresses **planning** plus a single `if` ladder; the program introduces a bounded **product** accumulated with a loop—closely related to material on decisions and iteration in the text (calendar references through Ch. 4–5 territory).

## Concepts

- **Planning first**: Pseudocode is an agreement with your future self—no angle brackets, only clear steps and branching.
- **`if` / `else if` / `else` chains**: Each branch should be mutually exclusive where the assignment demands it. Decide what happens for out-of-range inputs *before* touching the keyboard.
- **Looping products**: Multiplying consecutive integers is the same structural pattern as summing, except the neutral element is `1`, not `0`.
- **Symmetric bounds**: When the user swaps “low” and “high,” the mathematical interval should not change. Capture both values, then normalize with two extra variables or `std::min` / `std::max` once you are allowed—early weeks often stick to straight comparisons.

```cpp
#include <iostream>

int main() {
  int start = 0;
  int finish = 0;
  std::cout << "Enter two berries picked per hour at start and end of shift: ";
  std::cin >> start >> finish;
  if (start > finish) {
    int tmp = start;
    start = finish;
    finish = tmp;
  }
  long long basket = 1; // grows quickly; widen type if needed by spec
  for (int bush = start; bush <= finish; ++bush) {
    basket *= bush;
  }
  std::cout << "Throughput index (demo): " << basket << '\n';
  return 0;
}
```

## Pitfalls checklist

- **Off-by-one** loops after swapping bounds—test when `start == finish` separately; the degenerate interval should collapse to one factor.
- **Overflow**: Products explode faster than sums; when instructions allow, move to wider integer types sooner rather than debugging mysterious negatives.
- **Echoing dialogs**: Write your transcript from experiments you personally ran—not from PDF boilerplate wording.

## Bridge to Lab 02 & Program 02

- **Lab 02**: Discrete menu keyed off one integer (`1 … 4` in the handout) plus out-of-range handling—no sentinel loop requested.
- **Program 02**: Computes the product across every integer inside the inclusive interval dictated by user entry, tolerant of swapped ordering.
