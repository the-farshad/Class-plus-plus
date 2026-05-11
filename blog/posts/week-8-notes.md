---
slug: week-8-notes
title: "Week 8: Overloads, switches, and timing code"
date: "2026-05-18"
summary: "Hospital charge overloads + reference outs; Fibonacci timings with steady_clock statistics."
tags: ["overloading", "switch", "reference-parameters", "chrono"]
week: 8
---

# Week 8: Overloaded Functions, Reference Parameters, and Measuring Time

## Function overloading

C++ allows multiple functions with the **same name** as long as their parameter lists differ in type or number. The compiler picks the right one based on the arguments you pass—this is called **overload resolution**.

```cpp
void printValue(int n) {
    std::cout << "int: " << n << "\n";
}

void printValue(double d) {
    std::cout << "double: " << d << "\n";
}

void printValue(const std::string& s) {
    std::cout << "string: " << s << "\n";
}

// The compiler calls the correct version:
printValue(42);        // int version
printValue(3.14);      // double version
printValue("hello");   // string version
```

Rules the compiler uses:
- Exact match wins
- If no exact match, implicit conversion is tried (e.g. `int` → `double`)
- If two conversions are equally good, it is an error (ambiguous call)

The return type **alone** cannot distinguish overloads. Two functions that differ only in return type will not compile.

## Reference parameters

By default, function parameters are **copies**. Changes inside the function do not affect the caller:

```cpp
void addTen(int x) {
    x += 10;   // modifies local copy only
}

int val = 5;
addTen(val);
// val is still 5
```

A **reference parameter** (`&`) gives the function a direct alias to the caller's variable:

```cpp
void addTen(int& x) {
    x += 10;   // modifies the caller's variable
}

int val = 5;
addTen(val);
// val is now 15
```

This is how a function can return more than one value without using a struct: pass output variables by reference.

```cpp
void computeStats(int a, int b, int c,
                  int& outMin, int& outMax, double& outAvg) {
    outMin = a;
    if (b < outMin) outMin = b;
    if (c < outMin) outMin = c;

    outMax = a;
    if (b > outMax) outMax = b;
    if (c > outMax) outMax = c;

    outAvg = (a + b + c) / 3.0;
}

int lo, hi;
double avg;
computeStats(4, 9, 2, lo, hi, avg);
// lo = 2, hi = 9, avg = 5.0
```

## The `switch` statement

`switch` is cleaner than a long chain of `if/else if` when you are branching on a single integer or character value:

```cpp
char type = 'I';
switch (type) {
    case 'I':
    case 'i':
        std::cout << "Inpatient selected.\n";
        break;
    case 'O':
    case 'o':
        std::cout << "Outpatient selected.\n";
        break;
    default:
        std::cout << "Invalid type.\n";
        break;
}
```

**Always include `break`** at the end of each case, otherwise execution *falls through* to the next case—almost never what you want. The `default` case catches anything not matched by a specific `case`.

`switch` only works with integer types and `char`—not with strings or floats.

## Measuring execution time with `<chrono>`

`std::chrono::steady_clock` is a monotonic clock—it always moves forward, unaffected by system clock adjustments. Use it for benchmarking:

```cpp
#include <chrono>
#include <iostream>

int main() {
    using Clock = std::chrono::steady_clock;

    auto start = Clock::now();

    // --- code you want to measure ---
    long long sum = 0;
    for (int i = 0; i < 10000000; ++i) sum += i;
    // --------------------------------

    auto end = Clock::now();

    std::chrono::duration<double, std::micro> elapsed = end - start;
    std::cout << "Elapsed: " << elapsed.count() << " microseconds\n";
    std::cout << "Sum: " << sum << "\n";  // use the result so optimizer keeps it
    return 0;
}
```

### Running multiple trials

A single measurement is noisy—the OS may interrupt your process. Take several measurements and report the range:

```cpp
double minTime = 1e18, maxTime = 0.0;

for (int trial = 0; trial < 6; ++trial) {
    auto t0 = Clock::now();
    doWork();
    auto t1 = Clock::now();
    double us = std::chrono::duration<double, std::micro>(t1 - t0).count();
    if (us < minTime) minTime = us;
    if (us > maxTime) maxTime = us;
}

std::cout << "Min: " << minTime << " µs, Max: " << maxTime << " µs\n";
```

---

*The lab this week uses overloaded functions and reference parameters for hospital billing. The program repeats timing measurements of a Fibonacci routine and reports min/max.*
