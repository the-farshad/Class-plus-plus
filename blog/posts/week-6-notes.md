---
slug: week-6-notes
title: "Week 6: Robust integer reads and multi-file layouts"
date: "2026-05-16"
summary: "istream failure recovery; sentinel averages; separate header/cpp driver for geometric formulas."
tags: ["istream","failbit","ignore","headers","multi-file"]
week: 6
---
# Week 6: Stream recovery and modular geometry

**Lab 06** focuses on **istream failure states**: when users type commas, stray letters, or decimal noise, `operator>>` into an `int` may fail—you `clear()`, `ignore()`, and retry. **Program 06** is a **three-file** factoring exercise: prototypes in a `.hpp`, implementations in `.cpp`, driver `main` elsewhere, computing wall volume between coaxial cylinders with constraints spelled out in the PDF.

## Concepts

- **`fail()` / `failbit`**: Failed extraction leaves garbage in the stream; always reset state *and* skip the offending characters with a bounded `ignore`.
- **Sentinel-driven aggregation**: Count only values meeting the “keep” predicate; averages should use **floating** numerators even if inputs are integers.
- **Multi-file consistency**: Include guards (`#pragma once` or include guards), match declarations/definitions, and compile all translation units in the same configuration (Debug vs Release).

Original stream recovery toy (domain changed from course PDF):

```cpp
#include <iostream>
#include <limits>

bool readNonNegativeCount(int& out) {
  while (true) {
    std::cout << "Shipments today (int): ";
    if (std::cin >> out) {
      if (out >= 0) return true;
      std::cout << "Need non-negative inventory.\n";
    } else {
      std::cin.clear();
      std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
      std::cout << "That was not an integer—try again.\n";
    }
  }
}
```

## Pitfalls checklist

- **Ignoring without limits** in a loop that should stay responsive—prefer `numeric_limits<streamsize>::max()` with a delimiter.
- **Double-negative logic**: Skipping “negative inputs” while still allowing the sentinel requires careful ordering—draw a flowchart.
- **Geometry edge cases**: Wall thickness vs. radius/height caps in **Program 06**—verify inequalities before using π-based formulas.

## Bridge to Lab 06 & Program 06

- **Lab 06**: Demonstrate transcript cases that highlight recovery, not only the happy path.
- **Program 06**: Enforce non-negativity and geometric feasibility before printing a volume.
