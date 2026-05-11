---
slug: week-10-notes
title: "Week 10: STL vector analysis and Polynomial ADT"
date: "2026-05-20"
summary: "File \u2192 vector pipeline with range-for helpers; encapsulate coeffs/degree behaviors in a class."
tags: ["vector","range-for","file-io","classes","adts"]
week: 10
---
# Week 10: `std::vector` pipelines and polynomial classes

**Lab 10** reads whitespace-separated integers from a user-selected file into a **`std::vector<int>`**, closes the stream, **then** scans for min/max/average helpers implemented with **range-based `for`** loops. **Program 10** completes a **`Polynomial`** ADT—the degree governs coefficient storage layouts; tests must evolve beyond the stock harness.

Reading emphasis: STL `vector`, iterators intro in lecture slides, polynomial terminology in Chapter 13’s spirit.

## Concepts

- **Separation of concerns**: Input function takes `vector&` plus `ifstream&`, but statistics wait until `main` owns a fully-loaded container.
- **Range-for readability**: Prefer `for (int v : data)` inside min/max scanners once non-destructive passes are acceptable.
- **Polynomial representation**: Decide whether index `k` maps to exponent `k` coefficient; sparse vs dense trade-offs seldom matter early—consistency matters.
- **Defensive testers**: Duplicate zero-padding cases, unary-degree polynomials, negative coefficients—all fair game beyond stock output.

Demonstration filler function with range-for semantics:

```cpp
#include <vector>
#include <iostream>

double mean(const std::vector<int>& values) {
  if (values.empty()) return 0.0;
  long long acc = 0;
  for (int v : values) {
    acc += v;
  }
  return static_cast<double>(acc) / values.size();
}
```

## Pitfalls checklist

- **Calculating aggregates while reading**—explicitly forbidden in the lab brief; load first.
- **`vector::operator[]` out of bounds** when evaluating polynomials—guard degree or resize intentionally.
- **Forgetting `.close()` or scope-end flush** though destructors usually handle it—document intentional ordering in pseudocode anyway.

## Bridge to Lab 10 & Program 10

- **Lab 10**: Bundle `Lab10Input.txt`, transcript, pcode, `.cpp`.
- **Program 10**: Four files—the augmented tests should narrate rationale in `Prog10Test.txt`.
