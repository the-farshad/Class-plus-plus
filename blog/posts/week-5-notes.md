---
slug: week-5-notes
title: "Week 5: Float vs double precision and π series"
date: "2026-05-15"
summary: "Formatting with iomanip; reciprocal sums; alternating series for π without pow/atan in the series step."
tags: ["double", "float", "iomanip", "series", "numeric-error"]
week: 5
---

# Week 5: Floating-Point Numbers and Why They Misbehave

Floating-point arithmetic is fast and flexible, but it is *not* exact. Understanding why, and knowing how to format output to expose the error, is an essential skill.

## `float` vs `double`

Both store approximate decimal numbers in binary. The difference is how many significant digits they carry:

| Type | Approximate digits | Memory |
|------|-------------------|--------|
| `float` | ~7 | 4 bytes |
| `double` | ~15–16 | 8 bytes |

Always prefer `double` for scientific computation. `float` is only appropriate when memory is genuinely scarce (e.g., large arrays on embedded hardware).

```cpp
float  f = 1.0f / 3.0f;  // ~0.333333343267...  (7 sig digits, then noise)
double d = 1.0  / 3.0;   // ~0.333333333333333  (15 sig digits, then noise)
```

## Why binary fractions go wrong

Decimal `0.1` cannot be represented exactly in binary (just as `1/3` cannot be represented exactly in decimal). This means even simple additions can drift:

```cpp
double x = 0.1 + 0.2;
// x is 0.30000000000000004, not 0.3
```

This matters when you accumulate many operations—each step may introduce a tiny rounding error, and those errors pile up.

## Formatting output with `<iomanip>`

To see the full precision of a double, use stream manipulators:

```cpp
#include <iostream>
#include <iomanip>

int main() {
    double value = 1.0 / 3.0;
    std::cout << value << "\n";                           // 0.333333   (default 6 sig figs)
    std::cout << std::fixed << std::setprecision(15)
              << value << "\n";                           // 0.333333333333333
    return 0;
}
```

Common manipulators:

| Manipulator | Effect |
|-------------|--------|
| `std::fixed` | decimal notation (not scientific) |
| `std::scientific` | scientific notation `1.23e+04` |
| `std::setprecision(n)` | `n` digits after decimal (with `fixed`) or `n` sig figs |
| `std::setw(n)` | minimum field width (right-aligned) |
| `std::left` / `std::right` | alignment within field |

These manipulators are *sticky*—once set, they stay in effect for all subsequent output until changed.

## Comparing float and double on a reciprocal sum

Here is an experiment showing the drift difference. The sum `1 + 1/2 + 1/3 + ... + 1/n` has a known mathematical value that grows slowly. Computing it in `float` vs `double` reveals accumulated rounding error:

```cpp
#include <iostream>
#include <iomanip>

int main() {
    int n = 1000000;
    float  sumF = 0.0f;
    double sumD = 0.0;

    for (int i = 1; i <= n; ++i) {
        sumF += 1.0f / static_cast<float>(i);
        sumD += 1.0  / static_cast<double>(i);
    }

    std::cout << std::fixed << std::setprecision(10);
    std::cout << "float  sum: " << sumF << "\n";
    std::cout << "double sum: " << sumD << "\n";
    // The float result diverges noticeably from the double
    return 0;
}
```

## Alternating series and sign tracking

Some series alternate between adding and subtracting terms. A clean way to track the sign without calling `pow`:

```cpp
double sign = 1.0;
for (int k = 0; k <= maxK; ++k) {
    double term = sign / (2.0 * k + 1.0);
    sum += term;
    sign = -sign;     // flip for next iteration
}
```

This pattern is useful whenever a formula has `(-1)^k` in it.

## Prompting until a valid value

When an assignment says "the index must be non-negative," implement that literally:

```cpp
int maxK = -1;
while (maxK < 0) {
    std::cout << "Enter max index k (>= 0): ";
    std::cin >> maxK;
    if (maxK < 0) std::cout << "  Must be non-negative.\n";
}
```

---

*The lab this week has you adapt an existing program from `float` to `double` and produce a comparison table. The program computes a well-known series—show convergence by increasing the limit.*
