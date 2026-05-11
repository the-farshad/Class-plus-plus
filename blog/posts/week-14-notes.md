---
slug: week-14-notes
title: "Week 14: Debugging mixed I/O and vector statistics"
date: "2026-05-24"
summary: "Repair getline/cin interactions; load ints from file; mean and median with STL vector."
tags: ["debugging","getline","vector","median","exceptions-readiness"]
week: 14
---
# Week 14: Debugging careless I/O, iterator awareness, STL statistics

**Lab 14** is a forensic exercise: buggy medical label generator scrambles **`getline`** vs **`>>`** sequences when names carry spaces—you patch until nurse/patient fields stay aligned.**Program 14** requests filename retry loops, guarded readers populating **`std::vector<int>`**, median/mean calculators split into standalone functions — classic capstone stressing robustness plus STL familiarity.

Echo topics from Lecture 23–24 materials (exceptions, iterators) as optional enrichment even if assignments stay elementary.

Median outline using sort + parity check (adapt to harness requirements):

```cpp
#include <vector>
#include <algorithm>
#include <stdexcept>

double median(std::vector<int> values) {
  if (values.empty()) throw std::invalid_argument("empty");
  auto mid = values.begin() + values.size() / 2;
  std::nth_element(values.begin(), mid, values.end());
  if (values.size() % 2 == 1) {
    return *mid;
  }
  auto right = mid;
  auto left = std::max_element(values.begin(), mid);
  return (*left + *right) / 2.0;
}
```

(Re-read your official PDF: some specs call for sorting fully or forbidding mutations—adapt accordingly.)

## Pitfalls checklist

- **Median with duplicates / even counts**—define tie-breaking exactly as rubric language.
- **Empty files / read failures**—propagate return codes from `ReadData` before computing stats.
- **Iterator invalidation**—if you resize while looping, reacquire iterators or index by subscript thoughtfully.

## Bridge to Lab 14 & Program 14

- **Lab 14**: Document what symptoms each bug produced before your fix—the narrative belongs in instructor-facing notes if requested.
- **Program 14**: Demonstrate unreachable filename, successful parse, and statistical edge cases in the transcript.

---

You now have the full Spring term arc in note form—use search & sort on the Notes index to jump back by tag or week number.
