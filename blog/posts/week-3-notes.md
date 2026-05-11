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
#include <iostream>

struct Date {
    int month;
    int day;
    int year;
};

int main() {
    Date birthday;
    birthday.month = 5;
    birthday.day   = 10;
    birthday.year  = 2003;

    std::cout << "Birthday: "
              << birthday.month << "/"
              << birthday.day   << "/"
              << birthday.year  << "\n";
    return 0;
}
```

**Output:**
```
Birthday: 5/10/2003
```

### Nesting structs

One struct can contain another. A `Person` might have both a birthday and a date when their vitals were measured:

```cpp
#include <iostream>

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
};

int main() {
    Person p;
    p.name              = "Alex";
    p.birthday.month    = 3;
    p.birthday.day      = 15;
    p.birthday.year     = 1998;
    p.measureDate.month = 5;
    p.measureDate.day   = 10;
    p.measureDate.year  = 2026;
    p.heightCm          = 175.5;

    std::cout << "Name: " << p.name << "\n";
    std::cout << "Born: " << p.birthday.month << "/"
              << p.birthday.day << "/" << p.birthday.year << "\n";
    std::cout << "Measured: " << p.measureDate.month << "/"
              << p.measureDate.day << "/" << p.measureDate.year << "\n";
    std::cout << "Height: " << p.heightCm << " cm\n";
    return 0;
}
```

**Output:**
```
Name: Alex
Born: 3/15/1998
Measured: 5/10/2026
Height: 175.5 cm
```

## `struct` vs `class`

The only technical difference between `struct` and `class` in C++ is the **default access level**:
- `struct` members are `public` by default
- `class` members are `private` by default

In practice, use `struct` for plain data bundles, `class` when you add methods and want to control access.

## The three loops

### `for` — when the iteration count is known

```cpp
#include <iostream>

int main() {
    int n = 5;
    int sum = 0;
    for (int i = 1; i <= n; ++i) {
        sum += i;
    }
    std::cout << "Sum 1.." << n << " = " << sum << "\n";
    return 0;
}
```

**Output:**
```
Sum 1..5 = 15
```

### `while` — when the condition drives everything

```cpp
#include <iostream>

int main() {
    int a = 3, b = 9;
    int count  = 0;
    int cursor = a + 1;
    while (cursor < b) {
        ++count;
        ++cursor;
    }
    std::cout << "Interior integers between " << a
              << " and " << b << ": " << count << "\n";
    return 0;
}
```

**Output:**
```
Interior integers between 3 and 9: 5
```

### `do-while` — when the body must run at least once

```cpp
#include <iostream>

int main() {
    int value = 0;
    do {
        std::cout << "Enter a positive integer: ";
        std::cin >> value;
        if (value <= 0) std::cout << "  That's not positive. Try again.\n";
    } while (value <= 0);

    std::cout << "You entered: " << value << "\n";
    return 0;
}
```

**Sample run:**
```
Enter a positive integer: -3
  That's not positive. Try again.
Enter a positive integer: 0
  That's not positive. Try again.
Enter a positive integer: 7
You entered: 7
```

## Choosing the right loop

| Situation | Use |
|-----------|-----|
| Fixed count, index needed | `for` |
| Unknown count, may run 0 times | `while` |
| Must run at least once (input, menus) | `do-while` |

## A complete example using all three

```cpp
#include <iostream>

int main() {
    // do-while: keep asking until n >= 1
    int n = 0;
    do {
        std::cout << "Enter n >= 1: ";
        std::cin >> n;
    } while (n < 1);

    // for: sum integers 1 through n
    int sumN = 0;
    for (int i = 1; i <= n; ++i) sumN += i;
    std::cout << "Sum 1.." << n << " = " << sumN << "\n";

    // while: count interior integers between two fences
    int a = 0, b = 0;
    std::cout << "Enter two integers a b: ";
    std::cin >> a >> b;
    if (a > b) { int t = a; a = b; b = t; }

    int length = 0;
    int pos = a + 1;
    while (pos < b) { ++length; ++pos; }
    std::cout << "Interior length between " << a
              << " and " << b << " = " << length << "\n";

    return 0;
}
```

**Sample run:**
```
Enter n >= 1: -2
Enter n >= 1: 4
Sum 1..4 = 10
Enter two integers a b: 2 8
Interior length between 2 and 8 = 5
```

---

*This week's lab has you extend a struct and a class with an additional nested Date. The program gives you one section per loop type—use the correct loop in each section.*
