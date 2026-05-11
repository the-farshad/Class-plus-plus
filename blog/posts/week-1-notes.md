---
slug: week-1-notes
title: "Week 1: First project, I/O, and Program 01 workflow"
date: "2026-05-11"
summary: "Visual Studio empty project, headers, four-integer sum—pseudocode + .cpp + transcript deliverables."
tags: ["visual-studio", "iostream", "cin", "cout", "variables", "deliverables"]
week: 1
---

# Week 1: Your First C++ Program

Every C++ program begins with the same skeleton. Understanding each piece—why it exists and what it does—means you will never be lost staring at a blank file.

## The anatomy of a minimal program

```cpp
#include <iostream>

int main() {
    std::cout << "Hello, world!\n";
    return 0;
}
```

**`#include <iostream>`** tells the compiler to bring in the standard input/output library. Without it, `cout` and `cin` simply do not exist. The angle brackets mean it is a system header, not a file you wrote.

**`int main()`** is the entry point. Every program has exactly one. It returns an `int` to the operating system—`0` means success, anything else signals an error.

**`std::cout`** is the *standard output stream*—think of it as a pipe leading to your terminal screen. The `<<` operator pushes data into that pipe. The `\n` at the end of a string moves to the next line.

**`std::` prefix**: `cout`, `cin`, `endl` all live inside the `std` namespace. You will see `using namespace std;` in older code, but using the prefix explicitly makes it obvious where things come from.

## Reading input with `cin`

`std::cin` is the mirror image of `cout`—it reads from the keyboard.

```cpp
#include <iostream>

int main() {
    int age = 0;
    std::cout << "Enter your age: ";
    std::cin >> age;
    std::cout << "In ten years you will be " << age + 10 << ".\n";
    return 0;
}
```

The `>>` operator extracts a value from the stream and puts it into the variable. You can chain multiple reads on one line:

```cpp
int x = 0, y = 0;
std::cin >> x >> y;   // reads two integers separated by whitespace
```

## Variables and types

A variable is a named box that holds a value. You must declare its *type* before using it.

| Type | Holds | Example literal |
|------|-------|-----------------|
| `int` | whole numbers (approx ±2 billion) | `42`, `-7` |
| `double` | decimal numbers | `3.14`, `-0.5` |
| `char` | a single character | `'A'`, `'9'` |
| `bool` | true or false | `true`, `false` |
| `std::string` | text (needs `<string>`) | `"hello"` |

Always initialize variables when you declare them:

```cpp
int score = 0;       // good
int score;           // bad—value is garbage until assigned
```

## Doing arithmetic

```cpp
int a = 10, b = 3;
std::cout << a + b  << "\n";  // 13
std::cout << a - b  << "\n";  // 7
std::cout << a * b  << "\n";  // 30
std::cout << a / b  << "\n";  // 3   ← integer division, remainder dropped
std::cout << a % b  << "\n";  // 1   ← remainder (modulo)
```

Integer division is a frequent surprise: `10 / 3` is `3`, not `3.333`. To get a decimal result, at least one operand must be a floating-point type:

```cpp
double result = 10.0 / 3;    // 3.333...
double result2 = static_cast<double>(a) / b;  // same
```

## Putting output together

You can chain any number of values with `<<`:

```cpp
int cups = 4;
double oz = 8.5;
std::cout << cups << " cups × " << oz << " oz = " << cups * oz << " oz total\n";
// 4 cups × 8.5 oz = 34 oz total
```

## The three-document workflow

For graded work this semester you will always produce:

1. **Pseudocode** — a plain-English plan written *before* touching the keyboard. No C++ syntax.
2. **Source file** — the `.cpp` implementation.
3. **Test transcript** — paste your actual terminal session. Use runs *you* created, not examples from the assignment sheet.

Every file must include a **comment header** at the top identifying you, the course, the assignment, and the date.

```cpp
// Prog01.cpp
// Jane Smith
// COSC 1030 Spring 2026, Section 2
// Program 01 — January 24, 2026
```

---

*This week's lab and program both use these exact ideas: prompting the user, reading integers, doing arithmetic, and printing a result.*
