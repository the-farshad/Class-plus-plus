---
slug: week-4-notes
title: "Week 4: Stub functions, validation, and heart-rate math"
date: "2026-05-14"
summary: "Minimal main + stubs; positive-only inputs; sentinel-driven program with fixed-prototype helpers."
tags: ["functions", "stubs", "validation", "casting", "sentinel"]
week: 4
---

# Week 4: Functions — Writing Code in Pieces

The single biggest improvement you can make to any program is breaking it into well-named functions. This week you write functions from scratch, learn why *stubs* make development safer, and deal with the recurring problem of users entering bad data.

## Why functions?

```cpp
#include <iostream>
const double PI = 3.14159265358979;

double circleArea(double radius) {
    return PI * radius * radius;
}

int main() {
    std::cout << "Area of r=5: " << circleArea(5.0) << "\n";
    std::cout << "Area of r=3: " << circleArea(3.0) << "\n";
    return 0;
}
```

**Output:**
```
Area of r=5: 78.5398
Area of r=3: 28.2743
```

The constant `PI` is typed once. If you needed to change precision, there is one place to fix—not ten.

## Anatomy of a function

```cpp
// prototype — above main, so the compiler knows it exists
double circleArea(double radius);

// definition — the actual code (can be below main)
double circleArea(double radius) {
    return 3.14159265358979 * radius * radius;
}
```

The **return type** comes first, then the **name**, then **parameters** in parentheses. A `void` return type means the function does not return a value.

## Stubs: compile first, implement later

A **stub** is a function whose signature is complete but whose body returns a dummy value so the project compiles while you build the rest.

```cpp
#include <iostream>

double computeMaxHR(int age) {
    // TODO: implement
    return 0.0;
}

double computeTargetHR(double maxHR, double restHR) {
    // TODO: implement
    return 0.0;
}

int main() {
    int age = 30;
    double resting = 65.0;
    double maxHR  = computeMaxHR(age);
    double target = computeTargetHR(maxHR, resting);
    std::cout << "Max HR: "    << maxHR  << "\n";
    std::cout << "Target HR: " << target << "\n";
    return 0;
}
```

**Output with stubs (before implementing):**
```
Max HR: 0
Target HR: 0
```

Now implement one function at a time and watch the output improve:

```cpp
double computeMaxHR(int age) {
    return 205.8 - 0.685 * age;
}
```

**Output after implementing `computeMaxHR`:**
```
Max HR: 185.25
Target HR: 0
```

Fill in `computeTargetHR` next, test again—this is the stub workflow.

## Input validation

Keep prompting until the user enters valid data:

```cpp
#include <iostream>
#include <string>

int getPositiveInt(const std::string& prompt) {
    int value = 0;
    do {
        std::cout << prompt;
        std::cin >> value;
        if (value <= 0)
            std::cout << "  Please enter a positive integer.\n";
    } while (value <= 0);
    return value;
}

int main() {
    int age     = getPositiveInt("Enter age (years): ");
    int resting = getPositiveInt("Enter resting heart rate (bpm): ");
    std::cout << "Age: " << age << ", Resting HR: " << resting << "\n";
    return 0;
}
```

**Sample run:**
```
Enter age (years): -5
  Please enter a positive integer.
Enter age (years): 0
  Please enter a positive integer.
Enter age (years): 25
Enter resting heart rate (bpm): 68
Age: 25, Resting HR: 68
```

## Sentinel-driven loops

A **sentinel** is a special value that signals "stop"—not real data, just an exit marker. `-9999` is common this semester.

```cpp
#include <iostream>

int main() {
    int value = 0;
    long long sum = 0;
    int count = 0;

    while (true) {
        std::cout << "Enter a non-negative integer (-9999 to quit): ";
        std::cin >> value;

        if (value == -9999) break;

        if (value < 0) {
            std::cout << "  Skipping negative value.\n";
            continue;
        }

        sum += value;
        ++count;
    }

    if (count > 0)
        std::cout << "Count: " << count << ", Sum: " << sum << "\n";
    else
        std::cout << "No values entered.\n";

    return 0;
}
```

**Sample run:**
```
Enter a non-negative integer (-9999 to quit): 10
Enter a non-negative integer (-9999 to quit): -3
  Skipping negative value.
Enter a non-negative integer (-9999 to quit): 20
Enter a non-negative integer (-9999 to quit): 5
Enter a non-negative integer (-9999 to quit): -9999
Count: 3, Sum: 35
```

## Integer arithmetic vs floating-point

```cpp
#include <iostream>

int main() {
    int totalBeats = 4520;
    int minutes    = 60;

    int    avgInt = totalBeats / minutes;
    double avgDbl = static_cast<double>(totalBeats) / minutes;

    std::cout << "Integer division: " << avgInt << "\n";
    std::cout << "Double  division: " << avgDbl << "\n";
    return 0;
}
```

**Output:**
```
Integer division: 75
Double  division: 75.3333
```

The `static_cast<double>(...)` converts before the division happens; the other operand is automatically promoted to `double`.

---

*This week's lab gives you a stub-based template for heart-rate formulas—your job is to fill in the bodies. The program uses exact function prototypes you must match.*
