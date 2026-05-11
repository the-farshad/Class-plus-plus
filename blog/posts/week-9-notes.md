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

A class is not just a `struct` with functions bolted on. A well-designed class:
- Hides its internal representation (`private` members)
- Exposes only what callers need (`public` interface)
- Enforces valid state (never lets the object get into an impossible condition)
- Is documented with a **UML diagram** so teammates understand it without reading the code

## UML class diagrams (text style)

UML shows the name, attributes, and operations of a class. In text form (as the course asks):

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

Conventions:
- `-` means `private`
- `+` means `public`
- Parameters are `name:type`, default values shown with `=`
- Return type comes after the colon at the end

Draw (or type) this **before** writing code. It is your blueprint.

## Writing the class

```cpp
// Date.h
#pragma once

class Date {
public:
    Date(int month = 1, int day = 1, int year = 0);
    void setMonth(int m);
    int  getMonth() const;
    void setDay(int d);
    int  getDay() const;
    void setYear(int y);
    int  getYear() const;
    void print() const;

private:
    int month_;
    int day_;
    int year_;
};
```

```cpp
// Date.cpp
#include "Date.h"
#include <iostream>

Date::Date(int month, int day, int year)
    : month_(month), day_(day), year_(year) {}

void Date::setMonth(int m) { month_ = (m >= 1 && m <= 12) ? m : 1; }
int  Date::getMonth() const { return month_; }

void Date::setDay(int d)   { day_   = (d >= 1 && d <= 31) ? d : 1; }
int  Date::getDay()  const { return day_; }

void Date::setYear(int y)  { year_  = (y >= 0) ? y : 0; }
int  Date::getYear() const { return year_; }

void Date::print() const {
    // US format MM/DD/YYYY
    std::cout << month_ << "/" << day_ << "/" << year_;
}
```

Note the `const` on getter methods—it means "this method does not modify the object." Mark every method that only reads data as `const`.

## Two classes working together

When a `Time` object and a `Date` object describe the same moment, you can hold both in a test program without either class knowing about the other:

```cpp
#include "Date.h"
#include "Time.h"
#include <iostream>

int main() {
    Date d(4, 15, 2026);
    Time t(14, 30, 0);    // 2:30 PM

    std::cout << "Date: ";  d.print();
    std::cout << " Time: "; t.print();
    std::cout << "\n";
    return 0;
}
```

Keep the two classes independent—neither should `#include` the other. The test program coordinates them.

## Linear regression basics

Given pairs of data points `(x₁,y₁), (x₂,y₂), ..., (xₙ,yₙ)`, the **least-squares line** `y = mx + b` that best fits the data has:

```
m = (n·Σxᵢyᵢ − Σxᵢ·Σyᵢ) / (n·Σxᵢ² − (Σxᵢ)²)
b = (Σyᵢ − m·Σxᵢ) / n
```

You compute five running totals as you loop through the data: `n`, `Σx`, `Σy`, `Σx²`, `Σxy`. Then apply the formulas above once, after the loop.

```cpp
void computeLine(const double x[], const double y[], int n,
                 double& slope, double& intercept) {
    double sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (int i = 0; i < n; ++i) {
        sx  += x[i];
        sy  += y[i];
        sxx += x[i] * x[i];
        sxy += x[i] * y[i];
    }
    slope     = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    intercept = (sy - slope * sx) / n;
}
```

---

*The lab this week builds a `Date` class alongside a provided `Time` class. The program implements the regression function behind a header your instructor supplies.*
