---
slug: week-12-notes
title: "Week 12: Inheritance fleets and polymorphic shapes"
date: "2026-05-22"
summary: "Derive specialized Auto types; extend abstract 2D hierarchy and sort by a geometric key."
tags: ["inheritance","virtual","polymorphism","stl","algorithms"]
week: 12
---
# Week 12: Concrete inheritance and polymorphic shape collections

**Lab 12** seeds from `Auto`—you author **two distinct derived vehicles** each with bespoke state, explicit base constructors, accessors, yet **no noisy constructors** / `iostream` chatter inside ctor bodies. **Program 12** extends an abstract planar hierarchy with **`EqTriangle`**, leverages **`std::vector` + STL algorithms**, and clones the demonstration driver while swapping comparison keys (area earlier → perimeter emphasis in `Prog12`).

## Concepts

- **Substitution**: Treat base references/pointers as slots for derivatives only when slicing is prevented (pass by reference/pointer consistently).
- **Constructor forwarding**: Mentioned initialization lists that route arguments into `Auto(…)`.
- **Specialization deltas**: SUVs vs vans diverge meaningfully—not just rebranded clones.
- **Predicate sorts**: Algorithms like `std::sort` need comparators aligning with perimeter rather than area when swapping assignment goals—rename lambdas/functions for clarity.

Vector of pointers sketch (lesson-only):

```cpp
#include <vector>
#include <algorithm>
#include <memory>

struct Widget {
  virtual ~Widget() = default;
  virtual double metric() const = 0;
};

void sortWidgets(std::vector<std::unique_ptr<Widget>>& items) {
  std::sort(items.begin(), items.end(), [](const auto& a, const auto& b) {
    return a->metric() < b->metric();
  });
}
```

## Pitfalls checklist

- **Public inheritance for “is-a”**—avoid accidental private inheritance shutting off polymorphism.
- **Copying polymorphic collections by value** — store smart pointers instead if you refactor beyond starter code.
- **Exact match output** spelled in the assignment’s last-page script—tiny spacing differences fail autograders.

## Bridge to Lab 12 & Program 12

- **Lab 12**: Separate `.hpp/.cpp` pairs per derived automobile + driver proving distinct behavior.
- **Program 12**: Three-file solution with transcript mirroring mandated ordering—not identical numeric literals.
