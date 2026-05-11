---
slug: week-9-notes
title: "Week 9: Companion classes and regression math"
date: "2026-05-19"
summary: "UML + Date beside Time; implement least-square line parameters behind a supplied interface."
tags: ["classes","uml","aggregation","arrays","statistics"]
week: 9
---
# Week 9: Designing `Date`, UML, and numeric regression helpers

**Lab 09** asks for a handwritten **UML sketch** (`Lab09UML.txt`), a `Date` translation unit pairing with lecture `Time`, and combined tests emphasizing dual calendar formats. **Program 09** fills in **`LLParams`** behind a prescribed header — compute least-square slope `m` and intercept `b` for paired samples using only summations (no Solver button).

Conceptual pillars: encapsulation boundaries (accessors/setters), file bundling `.h`/`.cpp`, and careful floating aggregation.

## Concepts

- **UML as contract**: Attributes start with `-` private, or whatever convention your lecture uses—connectors clarify associations vs inheritance.
- **Cross-component testing**: Compose `Lab09.cpp` exercising both temporal types to catch boundary mistakes (minimum month/day/year).
- **Summation formulas**: Maintain running totals for `Σx`, `Σy`, `Σx²`, `Σxy`; divide only after verifying `n` matches dataset size.
- **Arrays / vectors**: The provided harness may dictate fixed buffers—avoid dynamic allocation unless instructed.

Symbolic accumulation sketch (symbols abstracted—you still implement the algebra from the assignment sheet):

```cpp
struct Moments {
  double sx = 0, sy = 0, sxx = 0, sxy = 0;
  int n = 0;
};

void ingestPair(Moments& m, double x, double y) {
  ++m.n;
  m.sx += x;
  m.sy += y;
  m.sxx += x * x;
  m.sxy += x * y;
}
```

## Pitfalls checklist

- **Integer division inside regression** unless every intermediate is widened deliberately.
- **Time zone confusion**: Lab output strings distinguish “universal ordering” vs U.S.—mirror spacing and punctuation mechanically.
- **Editing provided headers**: Some files must ship untouched—triple-check README bullets before committing.

## Bridge to Lab 09 & Program 09

- **Lab 09**: Four uploads only—reuse lecture `Time` sources locally but don’t re-submit them.
- **Program 09**: Exactly one new `.cpp` implementing the prototypes—everything else stays as handed out.
