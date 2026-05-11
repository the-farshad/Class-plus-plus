---
slug: week-3-notes
title: "Week 3: Structs, classes, and three loop flavors"
date: "2026-05-13"
summary: "Extend Person struct/class with dates; program exercises for, while, and do-while on different tasks."
tags: ["struct", "class", "methods", "for-loop", "while-loop", "do-while"]
week: 3
---

# Week 3: Grouping Data and Controlling Repetition

Two big ideas this week: how to bundle related data into a single named type, and why C++ gives you three different loop constructs instead of one.

## Grouping data with `struct`

When a program deals with a real-world thing—a date, a person, a sensor reading—you end up with several related values. A `struct` groups them into one named unit.

```cpp
struct Date {
    int month;
    int day;
    int year;
};
```

Now you can declare variables of type `Date`, pass them to functions, and store them in arrays—without juggling three separate integers everywhere.

```cpp
Date birthday;
birthday.month = 5;
birthday.day  = 10;
birthday.year = 2003;

std::cout << birthday.month << "/" << birthday.day
          << "/" << birthday.year << "\n";
```

### Nesting structs

One struct can contain another. A `Person` might have both a birthday and a date when their vitals were measured:

```cpp
struct Date {
    int month = 1;
    int day   = 1;
    int year  = 2000;
};

struct Person {
    std::string name;
    Date        birthday;
    Date        measureDate;
    double      heightCm;
    double      weightKg;
};
```

Accessing nested fields uses a chain of dots:

```cpp
Person p;
p.name              = "Alex";
p.birthday.month    = 3;
p.birthday.day      = 15;
p.birthday.year     = 1998;
p.measureDate.month = 5;
p.measureDate.day   = 10;
p.measureDate.year  = 2026;
```

## `struct` vs `class`

The only technical difference between `struct` and `class` in C++ is the **default access level**:
- `struct` members are `public` by default
- `class` members are `private` by default

In practice, use `struct` for plain data bundles, `class` when you add methods and want to control access. Either is fine for this week's work; just be consistent.

## The three loops

### `for` — when the iteration count is known

Use `for` when you know how many times to loop *before* the loop starts.

```cpp
// Sum integers 1 through n
int n = 10;
int sum = 0;
for (int i = 1; i <= n; ++i) {
    sum += i;
}
std::cout << "Sum 1.." << n << " = " << sum << "\n";
```

### `while` — when the condition drives everything

Use `while` when the loop body might never execute (if the condition is false immediately).

```cpp
// Walk through every integer strictly between a and b, counting steps
int a = 3, b = 9;
int count = 0;
int cursor = a + 1;           // start just inside the left fence
while (cursor < b) {          // stop before the right fence
    ++count;
    ++cursor;
}
std::cout << "Interior integers between " << a << " and " << b
          << ": " << count << "\n";  // 5
```

This is also the natural choice when you don't know how many iterations you need—for example reading input until the user enters a sentinel.

### `do-while` — when the body must run at least once

Use `do-while` when you need to execute the body *before* checking the condition. The classic example is input validation: you have to ask the question at least once.

```cpp
int value = 0;
do {
    std::cout << "Enter a positive integer: ";
    std::cin >> value;
} while (value <= 0);

std::cout << "You entered: " << value << "\n";
```

Without `do-while` you'd have to duplicate the prompt before the loop, or use an awkward `while (true) { ... break; }` construct.

## Choosing the right loop

| Situation | Use |
|-----------|-----|
| Fixed count, index needed | `for` |
| Unknown count, may run 0 times | `while` |
| Must run at least once (input, menus) | `do-while` |

Any loop can technically replace any other, but choosing the semantically correct one makes your code tell the same story as your pseudocode.

## A complete example using all three

```cpp
#include <iostream>

int main() {
    // --- Part 1: for loop ---
    int n = 0;
    do {
        std::cout << "Enter n >= 1: ";
        std::cin >> n;
    } while (n < 1);

    int sumN = 0;
    for (int i = 1; i <= n; ++i) {
        sumN += i;
    }
    std::cout << "Sum 1.." << n << " = " << sumN << "\n";

    // --- Part 2: while loop (interval length, exclusive endpoints) ---
    int a = 0, b = 0;
    std::cout << "Enter two integers a b: ";
    std::cin >> a >> b;
    if (a > b) { int t = a; a = b; b = t; }

    int length = 0;
    int pos = a + 1;
    while (pos < b) {
        ++length;
        ++pos;
    }
    std::cout << "Interior length between " << a << " and " << b
              << " = " << length << "\n";

    return 0;
}
```

---

*This week's lab has you extend a struct and a class with an additional nested Date. The program gives you one section per loop type—use the correct loop in each section.*
