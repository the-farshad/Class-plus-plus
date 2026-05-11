---
slug: week-13-notes
title: "Week 13: Virtual dispatch puzzles and 3D vector algebra"
date: "2026-05-23"
summary: "Abstract bases, access control gotchas; ThreeDVec with dot/cross/magnitude operators."
tags: ["virtual","abstract-class","operators","math","classes"]
week: 13
---
# Week 13: Virtual bases, diagnostics, and 3-vector algebra classes

**Lab 13** is Q&A oriented: provoke compiler errors deliberately, annotate fixes about **abstract bases**, overloaded `virtual` accessors, **`protected`** visibility trade-offs. **Program 13** implements **`ThreeDVec`** per an immutable public interface — addition, unary scaling, magnitude, dot, cross—with storage entirely `double`. **STL `vector` is explicitly banned** inside this class shell.

Reading tie-in: textbook operator-overloading sections (≈Ch. 13–14) plus appendix notes on linkage if you refactor.

Algebra refresher snippets (implement exactly as dictated by provided header):

```text
||V||₂ = √(x² + y² + z²)
V · W   = x₁x₂ + y₁y₂ + z₁z₂
V × W   = ( y₁z₂ − z₁y₂ , z₁x₂ − x₁z₂ , x₁y₂ − y₁x₂ )
```

## Pitfalls checklist

- **Marking finals `override`** only when bases truly virtual—respect provided signatures literally.
- **Mixing radians vs degrees accidentally**—these ops are algebraic, not trig heavy except `sqrt`.
- **Returning references to temporaries** from operator overloads—match return types dictated by spec.

## Bridge to Lab 13 & Program 13

- **Lab 13**: `Lab13Test.txt` records compiler excerpts and conceptual answers—nothing to compile beyond what instructions ask temporarily.
- **Program 13**: Exactly three uploads—declaration, definition, untouched main from staff.
