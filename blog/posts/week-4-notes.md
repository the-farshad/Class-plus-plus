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

Consider computing the area of a circle. You could write it inline every time:

```cpp
double area1 = 3.14159 * r1 * r1;
double area2 = 3.14159 * r2 * r2;
```

Or define it once:

```cpp
double circleArea(double radius) {
    return 3.14159265358979 * radius * radius;
}

double area1 = circleArea(r1);
double area2 = circleArea(r2);
```

The function version is harder to get wrong (the constant is typed once), easier to test, and self-documenting.

## Anatomy of a function

```cpp
// prototype (declaration) — tells the compiler what exists
double circleArea(double radius);

// definition — the actual code
double circleArea(double radius) {
    return 3.14159265358979 * radius * radius;
}
```

The **return type** comes first, then the **name**, then **parameters** in parentheses. A `void` return type means the function does not return a value.

## Stubs: compile first, implement later

A **stub** is a function whose signature is complete but whose body does nothing useful yet—it just returns a dummy value so the project compiles.

```cpp
double computeMaxHeartRate(int age) {
    // TODO: implement
    return 0.0;
}

double computeTargetHeartRate(double maxHR, double restHR) {
    // TODO: implement
    return 0.0;
}

int main() {
    // main wires everything together—it compiles and runs even with stubs
    int age = 30;
    double resting = 65.0;
    double maxHR  = computeMaxHeartRate(age);
    double target = computeTargetHeartRate(maxHR, resting);
    std::cout << "Target HR: " << target << "\n";
    return 0;
}
```

You build `main` with stubs, confirm the plumbing is right, then fill in each function one at a time—testing after each step.

## Input validation

Many functions only make sense for certain inputs. A heart rate calculation requires positive numbers; a square-root function requires a non-negative argument. *Validation* means checking inputs and refusing to proceed if they are bad.

```cpp
double computeMaxHeartRate(int age) {
    if (age <= 0) {
        std::cout << "Error: age must be positive.\n";
        return -1.0;   // signal that something went wrong
    }
    return 205.8 - 0.685 * age;
}
```

A better pattern for interactive programs is to keep prompting until the user gives valid input:

```cpp
int getPositiveInt(const std::string& prompt) {
    int value = 0;
    do {
        std::cout << prompt;
        std::cin >> value;
        if (value <= 0) {
            std::cout << "  Please enter a positive integer.\n";
        }
    } while (value <= 0);
    return value;
}
```

Call it like:

```cpp
int age     = getPositiveInt("Enter age (years): ");
int resting = getPositiveInt("Enter resting heart rate (bpm): ");
```

## Sentinel-driven loops

A **sentinel** is a special value that signals "stop"—not real data, just an exit marker. The sentinel value `-9999` is common in assignments this semester.

```cpp
int value = 0;
long long sum = 0;
int count = 0;

while (true) {
    std::cout << "Enter a non-negative integer (-9999 to quit): ";
    std::cin >> value;

    if (value == -9999) break;    // sentinel: exit

    if (value < 0) {
        std::cout << "  Skipping negative value.\n";
        continue;                 // not the sentinel, but invalid—skip
    }

    sum += value;
    ++count;
}

if (count > 0) {
    std::cout << "Count: " << count << ", Sum: " << sum << "\n";
}
```

## Integer arithmetic vs floating-point

When the result needs decimal precision, make sure the division uses floating-point arithmetic. The safest way is to cast one operand:

```cpp
int totalBeats = 4520;
int minutes = 60;

// integer division — result is 75, remainder discarded
int avgInt = totalBeats / minutes;

// floating-point division — result is 75.333...
double avgDbl = static_cast<double>(totalBeats) / minutes;
```

The `static_cast<double>(...)` converts the value at that point; the other operand is automatically promoted to `double` for the division.

---

*This week's lab gives you a stub-based template for heart-rate formulas—your job is to fill in the bodies. The program uses exact function prototypes you must match.*
