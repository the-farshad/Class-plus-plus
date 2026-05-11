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

When you write `std::cin >> n` expecting an integer and the user types `abc`, the extraction fails. The value of `n` is unchanged, the stream enters a **fail state**, and every subsequent read is also silently ignored—your program loops forever or crashes in mysterious ways.

You need to:
1. Detect the failure
2. Clear the error flag
3. Discard the bad input from the buffer
4. Try again

## Detecting failure

`std::cin` (and any stream) can be tested as a boolean:

```cpp
int n = 0;
if (std::cin >> n) {
    // extraction succeeded — n is valid
} else {
    // extraction failed — n is unchanged, stream is broken
}
```

The stream is in a fail state after the bad read. It stays broken until you call `clear()`.

## Clearing and ignoring

```cpp
#include <iostream>
#include <limits>

int main() {
    int n = 0;

    while (true) {
        std::cout << "Enter an integer: ";

        if (std::cin >> n) {
            break;                          // success — exit loop
        }

        // failed read: reset the stream
        std::cin.clear();                   // clear error flags
        std::cin.ignore(                    // discard garbage up to newline
            std::numeric_limits<std::streamsize>::max(), '\n');

        std::cout << "  That wasn't an integer. Try again.\n";
    }

    std::cout << "You entered: " << n << "\n";
    return 0;
}
```

`std::numeric_limits<std::streamsize>::max()` is the largest number of characters the stream can hold—passing it as the limit to `ignore` means "throw away everything up to (and including) the newline." Always use this instead of a hardcoded number.

## Combining validation with range checks

You often want *both* type checking *and* a range check in one function:

```cpp
#include <iostream>
#include <limits>

// Returns a non-negative integer, rejecting bad input and negatives.
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
```

## Multi-file programs: why split?

As programs grow, a single file becomes unmanageable. More importantly, **reusable code** (a library of math functions, a class) should live in its own files so multiple programs can share it without copy-pasting.

The convention:

| File | Contains |
|------|---------|
| `MyLib.hpp` | Class/function declarations (prototypes) |
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
    double celsius = 100.0;
    std::cout << celsius << "°C = "
              << celsiusToFahrenheit(celsius) << "°F\n";
    return 0;
}
```

`#pragma once` prevents the header from being included more than once in the same translation unit—always put it at the top of every `.hpp` file.

## Compile-time vs link-time errors

If your prototype in the `.hpp` and your definition in the `.cpp` don't match exactly (different parameter types, different return type), you get a **linker error**—not a compiler error—which is harder to trace. Always copy-paste the prototype from the header into the `.cpp` definition to avoid typos.

---

*The lab this week builds the input-recovery pattern from scratch. The program structures a formula computation across three files following the pattern above.*
