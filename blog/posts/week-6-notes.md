---
slug: week-6-notes
title: "Week 6: Robust integer reads and multi-file layouts"
date: "2026-05-16"
summary: "istream failure recovery; sentinel averages; separate header/cpp driver for geometric formulas."
tags: ["istream", "failbit", "ignore", "headers", "multi-file"]
week: 6
---

# Week 6: When Input Goes Wrong — and Splitting Code Into Files

## The problem with `cin >>`

When you write `std::cin >> n` expecting an integer and the user types `abc`, the extraction **fails**. The value of `n` is unchanged, the stream enters a fail state, and every subsequent read is also silently ignored—your program loops forever or crashes.

You need to:
1. Detect the failure
2. Clear the error flag
3. Discard the bad input from the buffer
4. Try again

## Detecting failure

`std::cin` can be tested as a boolean—it is `true` when healthy, `false` after a failed read:

```cpp
int n = 0;
if (std::cin >> n) {
    std::cout << "Read: " << n << "\n";
} else {
    std::cout << "That was not an integer.\n";
}
```

## Clearing and ignoring

```cpp
#include <iostream>
#include <limits>

int main() {
    int n = 0;

    while (true) {
        std::cout << "Enter an integer: ";

        if (std::cin >> n) {
            break;                      // success
        }

        std::cin.clear();               // reset fail flag
        std::cin.ignore(               // discard garbage up to newline
            std::numeric_limits<std::streamsize>::max(), '\n');

        std::cout << "  Not an integer — try again.\n";
    }

    std::cout << "You entered: " << n << "\n";
    return 0;
}
```

**Sample run:**
```
Enter an integer: hello
  Not an integer — try again.
Enter an integer: 3.14
  Not an integer — try again.
Enter an integer: 42
You entered: 42
```

`std::numeric_limits<std::streamsize>::max()` is the largest possible stream size—passing it to `ignore` means "throw away everything up to (and including) the next newline."

## Combining validation with a range check

```cpp
#include <iostream>
#include <limits>
#include <string>

int readNonNegInt(const std::string& prompt) {
    int val = 0;
    while (true) {
        std::cout << prompt;
        if (std::cin >> val) {
            if (val >= 0) return val;
            std::cout << "  Negative not allowed.\n";
        } else {
            std::cin.clear();
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
            std::cout << "  Not an integer — try again.\n";
        }
    }
}

int main() {
    int score = readNonNegInt("Enter score: ");
    std::cout << "Score accepted: " << score << "\n";
    return 0;
}
```

**Sample run:**
```
Enter score: -10
  Negative not allowed.
Enter score: abc
  Not an integer — try again.
Enter score: 85
Score accepted: 85
```

## Multi-file programs: why split?

As programs grow, a single file becomes unmanageable. Reusable code should live in its own files.

| File | Contains |
|------|----------|
| `MyLib.hpp` | Function declarations (prototypes) |
| `MyLib.cpp` | Function definitions (implementations) |
| `Main.cpp` | `main()` — uses `#include "MyLib.hpp"` |

## A minimal three-file example

**`Converter.hpp`**
```cpp
#pragma once
double celsiusToFahrenheit(double c);
double fahrenheitToCelsius(double f);
```

**`Converter.cpp`**
```cpp
#include "Converter.hpp"

double celsiusToFahrenheit(double c) {
    return c * 9.0 / 5.0 + 32.0;
}
double fahrenheitToCelsius(double f) {
    return (f - 32.0) * 5.0 / 9.0;
}
```

**`Main.cpp`**
```cpp
#include <iostream>
#include "Converter.hpp"

int main() {
    std::cout << "100 C = " << celsiusToFahrenheit(100.0) << " F\n";
    std::cout << "32  F = " << fahrenheitToCelsius(32.0)  << " C\n";
    return 0;
}
```

**Output:**
```
100 C = 212 F
32  F = 0 C
```

`#pragma once` prevents the header from being included more than once in the same translation unit—always put it at the top of every `.hpp` file.

## Compile-time vs link-time errors

If your prototype in the `.hpp` and your definition in the `.cpp` don't match exactly, you get a **linker error**—not a compiler error—which is harder to trace. Always copy-paste the prototype from the header into the `.cpp` definition to avoid typos.

---

*The lab this week builds the input-recovery pattern from scratch. The program structures a formula computation across three files following the pattern above.*
