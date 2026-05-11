---
slug: week-11-notes
title: "Week 11: Raw C-strings vs a handcrafted string class"
date: "2026-05-21"
summary: "strlen_s-style safety where available; cin.getline drains; dynamic storage for char buffers."
tags: ["cstring","char-array","cin","class-design","memory"]
week: 11
---
# Week 11: Raw buffers, mixed extraction, and a home-grown string ADT

**Lab 11** cycles through **`cin >>` buffers**, draining leftover characters before **`cin.getline`**, inspecting `strlen`-style lengths and `gcount` diagnostics, then trims sentences per user-entered offsets—classic stream mixing pitfalls.**Program 11** forbids **`std::string`** internally: follow the **course-supplied class interface** (often named like `String1030` in grading materials) with dynamic **`char*`-backed storage** and safe length probes (`strnlen_s` where Visual Studio insists; fall back gracefully on Clang/GCC per PDF guidance).

Conceptual anchors: C-string sentinels, deep copies, rule-of-three-lite discipline as soon as allocations appear.

```cpp
#include <cstring>

// Portable sketch: VS may map strnlen_s; elsewhere use strnlen where available.

size_t boundedLength(const char* text, size_t cap) {
  if (!text) return 0;
#if defined(_WIN32)
  return strnlen_s(text, cap);
#else
  return std::strnlen(text, cap);
#endif
}
```

## Pitfalls checklist

- **Residual `cin` newline** wiping your first `getline`—prime the pipe with an extra swallow line as instructed.
- **Off-by-null**: Allocate `capacity + 1` bytes for terminator storage.
- **Self-assignment** in `operator=` when juggling heap buffers—check identity before freeing old storage.

## Bridge to Lab 11 & Program 11

- **Lab 11**: Echo characters with `cout <<` strictly one char at a time in the mandated segment.
- **Program 11**: Wrap pointer lifetimes neatly—avoid leaking on reassignment routes.
