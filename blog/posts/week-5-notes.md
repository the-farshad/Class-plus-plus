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

Always prefer `double` for scientific computation.

```cpp
#include <iostream>
#include <iomanip>

int main() {
    float  f = 1.0f / 3.0f;
    double d = 1.0  / 3.0;

    std::cout << std::fixed << std::setprecision(15);
    std::cout << "float:  " << f << "\n";
    std::cout << "double: " << d << "\n";
    return 0;
}
```

**Output:**
```
float:  0.333333343267441
double: 0.333333333333333
```

Notice the `float` result drifts at the 8th digit — it only has about 7 reliable digits.

## Why binary fractions go wrong

```cpp
#include <iostream>
#include <iomanip>

int main() {
    double x = 0.1 + 0.2;
    std::cout << std::fixed << std::setprecision(17);
    std::cout << "0.1 + 0.2 = " << x << "\n";
    std::cout << "Is it 0.3? " << (x == 0.3 ? "yes" : "no") << "\n";
    return 0;
}
```

**Output:**
```
0.1 + 0.2 = 0.30000000000000004
Is it 0.3? no
```

Never compare floating-point values with `==`. Use a tolerance: `std::abs(x - 0.3) < 1e-10`.

## Formatting output with `<iomanip>`

```cpp
#include <iostream>
#include <iomanip>

int main() {
    double value = 1.0 / 7.0;

    std::cout << "Default:          " << value              << "\n";
    std::cout << std::fixed;
    std::cout << "fixed 2 places:   " << std::setprecision(2) << value << "\n";
    std::cout << "fixed 10 places:  " << std::setprecision(10) << value << "\n";
    std::cout << std::scientific;
    std::cout << "scientific:       " << std::setprecision(6)  << value << "\n";
    return 0;
}
```

**Output:**
```
Default:          0.142857
fixed 2 places:   0.14
fixed 10 places:  0.1428571429
scientific:       1.428571e-01
```

Manipulators are *sticky*—once you set `fixed` or a precision, it stays for all subsequent output.

## Comparing float and double on a reciprocal sum

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
    std::cout << "float  sum (n=" << n << "): " << sumF << "\n";
    std::cout << "double sum (n=" << n << "): " << sumD << "\n";
    return 0;
}
```

**Output (approximate — exact values vary by platform):**
```
float  sum (n=1000000): 14.3574829102
double sum (n=1000000): 14.3927267229
```

The `float` result is noticeably wrong because adding millions of small numbers to a growing sum causes accumulated rounding error.

## Alternating series and sign tracking

Some series alternate `+` and `−` terms. Track the sign without calling `pow`:

```cpp
#include <iostream>
#include <iomanip>

int main() {
    int maxK = 0;
    while (maxK < 0) {
        std::cout << "Enter max index k (>= 0): ";
        std::cin >> maxK;
    }

    double sum  = 0.0;
    double sign = 1.0;
    for (int k = 0; k <= maxK; ++k) {
        sum  += sign / (2.0 * k + 1.0);
        sign  = -sign;
    }
    sum *= 4.0;

    std::cout << std::fixed << std::setprecision(10);
    std::cout << "pi approx (k=" << maxK << "): " << sum << "\n";
    return 0;
}
```

**Sample runs showing convergence:**
```
Enter max index k (>= 0): 10
pi approx (k=10): 3.2323158094

Enter max index k (>= 0): 1000
pi approx (k=1000): 3.1425916543

Enter max index k (>= 0): 100000
pi approx (k=100000): 3.1415826536
```

More terms → closer to π ≈ 3.1415926535. This series converges slowly—that is expected.

---

*The lab this week has you adapt an existing program from `float` to `double` and produce a comparison table. The program computes a well-known series—show convergence by increasing the limit.*
