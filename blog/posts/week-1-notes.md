---
slug: week-1-notes
title: "Week 1: First project, I/O, and Program 01 workflow"
date: "2026-05-11"
summary: "Visual Studio empty project, headers, four-integer sum\u2014pseudocode + .cpp + transcript deliverables."
tags: ["visual-studio","iostream","cin","cout","variables","deliverables"]
week: 1
---
# Week 1: First project, console I/O, and deliverable discipline

These notes line up with **COSC 1030 Spring 2026** early calendar items: your first Visual Studio project (**Lab 01**) and a small interactive program (**Program 01**). Reading hints on the course calendar point at Gaddis chapters 1–3 (plus appendix material on tools as assigned).

## Concepts

- **Translation model**: Editor → compiler → linker → executable. Until the build succeeds there is nothing meaningful to run.
- **`#include` & `main`**: Every console program needs an entry point (`int main()` or equivalent) and typically `<iostream>` when you use standard streams.
- **Streams**: `std::cin` pulls formatted text from the user; `std::cout` publishes results. Keep `using` directives narrow (`using std::cin;`) instead of blanket `using namespace std;` once projects grow.
- **Variables with intent-revealing names**: Prefer `firstPortion` over `a` when the domain is known—future graders (and you, in two weeks) read the names first.
- **Three-file habit for graded programs**: Pseudocode on paper or `.txt`, `.cpp` implementation, and an honest **transcript** of runtime behavior you choose yourself (never copy sample dialogs verbatim).

## Mini-example (original scenario)

Suppose you are totaling **liters of rain** collected on three consecutive days—different from any class template, but same skills (prompt, read integers, print a sentence).

```cpp
#include <iostream>

int main() {
  int dayEast = 0;
  int dayCentral = 0;
  int dayWest = 0;
  std::cout << "Enter three whole-number rainfall amounts (mm): ";
  std::cin >> dayEast >> dayCentral >> dayWest;
  int total = dayEast + dayCentral + dayWest;
  std::cout << "Combined catchment reading: " << total << " mm\n";
  return 0;
}
```

## Pitfalls checklist

- Choosing a **C#** or **CLR** project template—always land on a native **Empty project** (or equivalent) with C++ toolchain.
- Leaving the working directory on a lab temp drive without copying the **entire** `.vcxproj` tree to durable storage.
- Forgetting the **comment header block** on **each** submitted text or source file—most rubrics treat that as an automatic deduction.

## Bridge to Lab 01 & Program 01

- **Lab 01** walks the Visual Studio click-path; success is a clean build of a tiny starter file with your identity in the header comments.
- **Program 01** adds numeric input, arithmetic, formatted output, plus the three-document workflow (plan, code, transcript). Match the course’s required filenames and header format exactly even if this note used a different story.

**Good luck this week—establish the rhythm of plan → code → verify.**
