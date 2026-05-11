---
slug: week-3-notes
title: "Week 3: Structs, classes, and three loop flavors"
date: "2026-05-13"
summary: "Extend Person struct/class with dates; program exercises for, while, and do-while on different tasks."
tags: ["struct","class","methods","for-loop","while-loop","do-while"]
week: 3
---
# Week 3: Structures, classes, and three loop idioms

**Lab 03** extends instructor `struct` / `class` examples with nested **Date** fields (measurement day vs. birthday). **Program 03** is a tour of loops: a guarded `for`, a `while` that walks an interval, and a `do-while` segment—each solving a different micro-problem. Calendar readings lean on early OOP chapters (11 & 13) plus control-flow review.

## Concepts

- **Structs vs. classes**: Default member visibility differs, but in practice both bundle data and (optionally) behavior. Choose based on course style guidelines.
- **Composition**: A `Person` “has-a” `Date` rather than storing parallel loose integers everywhere—fewer parameter lists, clearer invariants.
- **`for` when the count path is predictable**: Accumulate sums from `1 … n`, but insist on **`n ≥ 1`** through re-prompting if the specification demands it.
- **`while` for open-ended pacing**: Walking between two fences (exclusive endpoint behavior) mimics pacing a warehouse aisle—peek ahead, guard termination when values cross.
- **`do-while` when at least one pass always happens**: Useful when the sentinel or termination depends on arithmetic you only discover mid-loop.

Original micro-pattern—countdown fuel ticks with `do-while` instead of the assignment’s math:

```cpp
#include <iostream>

int main() {
  int reserve = 0;
  do {
    std::cout << "Reserve tanks (non-negative): ";
    std::cin >> reserve;
  } while (reserve < 0);

  int ticks = 0;
  int remaining = reserve;
  do {
    remaining /= 2; // illustrative halving—not the program spec
    ++ticks;
  } while (remaining > 1);

  std::cout << "Halving iterations: " << ticks << '\n';
  return 0;
}
```

## Pitfalls checklist

- Editing **both** `.h`/`.cpp` sides when splitting interfaces— linker errors usually mean mismatched prototypes.
- **Loop choice commentary**: graders often want rationale in pseudocode/comments; cite why `while` fit the stepping pattern even if another loop could brute-force it.
- **Half-open vs. inclusive intervals**: The program text uses phrases like “length between” without counting endpoints—mirror that carefully in increments and compares.

## Bridge to Lab 03 & Program 03

- **Lab 03**: Two builds—renamed copies of structure vs class starters—printing aligned prompts for nested dates.
- **Program 03**: Sequential sections; reuse no loop improperly—each subsection should showcase the mandated construct.
