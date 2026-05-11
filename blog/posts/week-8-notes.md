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

C++ allows multiple functions with the **same name** as long as their parameter lists differ. The compiler picks the right one from the arguments you pass.

```cpp
#include <iostream>
#include <string>

void printValue(int n) {
    std::cout << "int: " << n << "\n";
}
void printValue(double d) {
    std::cout << "double: " << d << "\n";
}
void printValue(const std::string& s) {
    std::cout << "string: " << s << "\n";
}

int main() {
    printValue(42);
    printValue(3.14);
    printValue("hello");
    return 0;
}
```

**Output:**
```
int: 42
double: 3.14
string: hello
```

The return type **alone** cannot distinguish overloads. Two functions differing only in return type will not compile.

## Reference parameters

By default, function parameters are **copies**. Changes inside the function do not affect the caller:

```cpp
#include <iostream>

void addTen(int x) { x += 10; }   // modifies local copy only

int main() {
    int val = 5;
    addTen(val);
    std::cout << val << "\n";    // still 5
    return 0;
}
```

**Output:**
```
5
```

A **reference parameter** (`&`) gives the function a direct alias to the caller's variable:

```cpp
#include <iostream>

void addTen(int& x) { x += 10; }   // modifies the caller's variable

int main() {
    int val = 5;
    addTen(val);
    std::cout << val << "\n";    // now 15
    return 0;
}
```

**Output:**
```
15
```

This is how a function can return more than one value—pass output variables by reference:

```cpp
#include <iostream>

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

int main() {
    int lo, hi;
    double avg;
    computeStats(4, 9, 2, lo, hi, avg);
    std::cout << "Min: " << lo  << "\n";
    std::cout << "Max: " << hi  << "\n";
    std::cout << "Avg: " << avg << "\n";
    return 0;
}
```

**Output:**
```
Min: 2
Max: 9
Avg: 5
```

## The `switch` statement

`switch` is cleaner than long `if/else if` chains when branching on a single integer or character:

```cpp
#include <iostream>

int main() {
    char type = 0;
    std::cout << "Enter I (inpatient) or O (outpatient): ";
    std::cin >> type;

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
    return 0;
}
```

**Sample run — 'i':**
```
Enter I (inpatient) or O (outpatient): i
Inpatient selected.
```

**Sample run — invalid:**
```
Enter I (inpatient) or O (outpatient): X
Invalid type.
```

Always include `break` at the end of each case; without it, execution *falls through* to the next case.

## Measuring execution time with `<chrono>`

```cpp
#include <chrono>
#include <iostream>

int main() {
    using Clock = std::chrono::steady_clock;

    auto start = Clock::now();

    long long sum = 0;
    for (int i = 0; i < 10'000'000; ++i) sum += i;

    auto end = Clock::now();
    std::chrono::duration<double, std::micro> elapsed = end - start;

    std::cout << "Sum: " << sum << "\n";
    std::cout << "Elapsed: " << elapsed.count() << " microseconds\n";
    return 0;
}
```

**Sample output (values vary by machine):**
```
Sum: 49999995000000
Elapsed: 18432.7 microseconds
```

### Running multiple trials and reporting min/max

```cpp
#include <chrono>
#include <iostream>

long long doWork() {
    long long s = 0;
    for (int i = 0; i < 1'000'000; ++i) s += i;
    return s;
}

int main() {
    using Clock = std::chrono::steady_clock;
    double minTime = 1e18, maxTime = 0.0;

    for (int trial = 0; trial < 6; ++trial) {
        auto t0 = Clock::now();
        doWork();
        auto t1 = Clock::now();
        double us = std::chrono::duration<double, std::micro>(t1 - t0).count();
        if (us < minTime) minTime = us;
        if (us > maxTime) maxTime = us;
        std::cout << "Trial " << trial + 1 << ": " << us << " µs\n";
    }
    std::cout << "Min: " << minTime << " µs\n";
    std::cout << "Max: " << maxTime << " µs\n";
    return 0;
}
```

**Sample output:**
```
Trial 1: 1843.2 µs
Trial 2: 1701.4 µs
Trial 3: 1698.8 µs
Trial 4: 1712.3 µs
Trial 5: 1695.1 µs
Trial 6: 1703.6 µs
Min: 1695.1 µs
Max: 1843.2 µs
```

The first trial is often slowest (cold cache). The min/max spread shows how noisy your system is.

---

*The lab this week uses overloaded functions and reference parameters for hospital billing. The program repeats timing measurements of a Fibonacci routine and reports min/max.*
