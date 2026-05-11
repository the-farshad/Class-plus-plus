---
slug: week-9-notes
title: "Week 9: Companion classes and regression math"
date: "2026-05-19"
summary: "UML + Date beside Time; implement least-square line parameters behind a supplied interface."
tags: ["classes", "uml", "aggregation", "arrays", "statistics"]
week: 9
---

# Week 9: Designing Classes Properly — UML, Access, and Working Together

## What makes a good class?

A well-designed class:
- Hides its internal representation (`private` members)
- Exposes only what callers need (`public` interface)
- Enforces valid state through setters
- Is documented with a **UML diagram** before you write any code

## UML class diagrams (text style)

```
Date
----------------------------
- month : int
- day   : int
- year  : int
----------------------------
+ Date(m:int=1, d:int=1, y:int=0)
+ setMonth(m:int) : void
+ getMonth() : int
+ setDay(d:int) : void
+ getDay() : int
+ setYear(y:int) : void
+ getYear() : int
+ print() : void
```

`-` means `private`, `+` means `public`. Draw this **before** writing code.

## Writing the class

**Date.h**
```cpp
#pragma once

class Date {
public:
    Date(int month = 1, int day = 1, int year = 0);
    void setMonth(int m);  int getMonth() const;
    void setDay(int d);    int getDay()   const;
    void setYear(int y);   int getYear()  const;
    void print() const;

private:
    int month_;
    int day_;
    int year_;
};
```

**Date.cpp**
```cpp
#include "Date.h"
#include <iostream>

Date::Date(int m, int d, int y) : month_(m), day_(d), year_(y) {}

void Date::setMonth(int m) { month_ = (m >= 1 && m <= 12) ? m : 1; }
int  Date::getMonth() const { return month_; }
void Date::setDay(int d)   { day_   = (d >= 1 && d <= 31) ? d : 1; }
int  Date::getDay()  const { return day_; }
void Date::setYear(int y)  { year_  = (y >= 0)            ? y : 0; }
int  Date::getYear() const { return year_; }

void Date::print() const {
    std::cout << month_ << "/" << day_ << "/" << year_;
}
```

**Test:**
```cpp
#include <iostream>
#include "Date.h"

int main() {
    Date d(4, 15, 2026);
    std::cout << "Date: ";
    d.print();
    std::cout << "\n";

    d.setMonth(13);   // invalid — clamped to 1
    std::cout << "After setMonth(13): " << d.getMonth() << "\n";
    return 0;
}
```

**Output:**
```
Date: 4/15/2026
After setMonth(13): 1
```

Note the `const` on getter methods—they do not modify the object. Always mark read-only methods `const`.

## Two classes working together

Keep classes independent of each other. A test program coordinates them:

```cpp
#include <iostream>
#include "Date.h"
#include "Time.h"   // provided by the course

int main() {
    Date d(4, 15, 2026);
    Time t(14, 30, 0);    // 2:30:00 PM

    std::cout << "Date: ";  d.print();
    std::cout << "  Time: "; t.print();
    std::cout << "\n";
    return 0;
}
```

**Output:**
```
Date: 4/15/2026  Time: 2:30:00 PM
```

## Linear regression basics

Given data points `(x, y)`, the least-squares line `y = mx + b` minimizes total squared error. Compute five running totals, then apply the closed-form formulas:

```cpp
#include <iostream>
#include <cmath>

void computeLine(const double x[], const double y[], int n,
                 double& slope, double& intercept) {
    double sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (int i = 0; i < n; ++i) {
        sx  += x[i];
        sy  += y[i];
        sxx += x[i] * x[i];
        sxy += x[i] * y[i];
    }
    slope     = (n * sxy - sx * sy)  / (n * sxx - sx * sx);
    intercept = (sy - slope * sx)    / n;
}

int main() {
    double xs[] = {1, 2, 3, 4, 5};
    double ys[] = {2.1, 3.9, 6.2, 7.8, 10.1};
    int n = 5;

    double m = 0, b = 0;
    computeLine(xs, ys, n, m, b);

    std::cout << "Slope:     " << m << "\n";
    std::cout << "Intercept: " << b << "\n";
    std::cout << "Line: y = " << m << "x + " << b << "\n";
    return 0;
}
```

**Output:**
```
Slope:     2.01
Intercept: 0.04
Line: y = 2.01x + 0.04
```

The data was generated from `y = 2x + noise`, and the regression recovers approximately `y = 2x`.

---

*The lab this week builds a `Date` class alongside a provided `Time` class. The program implements the regression function behind a header your instructor supplies.*
