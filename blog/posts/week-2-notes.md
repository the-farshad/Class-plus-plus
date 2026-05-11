---
slug: week-2-notes
title: "Week 2: Planning, selection, and bounded products"
date: "2026-05-12"
summary: "Pseudocode discipline; if/else menus; program multiplies every integer in an interval (order flexible)."
tags: ["pseudocode", "if-else", "planning", "loops", "arithmetics"]
week: 2
---

# Week 2: Decisions, Loops, and Thinking Before You Code

This week two ideas run in parallel: **how to plan a program** before writing any C++, and the **mechanics of making decisions and repeating work** inside that program.

## Pseudocode: plan first, code second

Pseudocode is a description of your algorithm in plain language. It is not C++—no semicolons, no braces. Its purpose is to let you work out the logic on paper so the coding step is mostly transcription.

A reasonable pseudocode format for a simple menu program:

```
Display prompt asking for a number 1–4
Read the number
IF number == 1
    Print "One is the loneliest number."
ELSE IF number == 2
    Print "Two can be as bad as one."
ELSE IF number == 3
    Print "Three is just confusing."
ELSE IF number == 4
    Print "Four means you are done."
ELSE
    Print "Input not in range."
END IF
```

Notice that the out-of-range case is handled *explicitly*. Good pseudocode forces you to think about every branch, not just the happy path.

## `if` / `else if` / `else`

The C++ translation of the plan above is almost mechanical:

```cpp
#include <iostream>

int main() {
    int choice = 0;
    std::cout << "Enter a number (1-4): ";
    std::cin >> choice;

    if (choice == 1) {
        std::cout << "One is the loneliest number.\n";
    } else if (choice == 2) {
        std::cout << "Two can be as bad as one.\n";
    } else if (choice == 3) {
        std::cout << "Three is just confusing.\n";
    } else if (choice == 4) {
        std::cout << "Four means you are done.\n";
    } else {
        std::cout << "Input not in range.\n";
    }
    return 0;
}
```

**Sample run — valid input:**
```
Enter a number (1-4): 3
Three is just confusing.
```

**Sample run — out of range:**
```
Enter a number (1-4): 99
Input not in range.
```

Key points:
- `==` tests equality; `=` assigns. Confusing them is one of the most common bugs in C++.
- Exactly one branch executes. Once a condition is true, the rest are skipped.
- The final `else` catches everything not handled above—always include it when the input might be invalid.

## Comparison and logical operators

| Operator | Meaning |
|----------|---------|
| `==` | equal to |
| `!=` | not equal to |
| `<`, `<=` | less than, less than or equal |
| `>`, `>=` | greater than, greater than or equal |
| `&&` | AND — both sides must be true |
| `\|\|` | OR — at least one side must be true |
| `!` | NOT — flips true/false |

Example — checking a range and printing a verdict:

```cpp
#include <iostream>

int main() {
    int x = 0;
    std::cout << "Enter a number: ";
    std::cin >> x;

    if (x >= 1 && x <= 100) {
        std::cout << x << " is in range [1, 100].\n";
    } else {
        std::cout << x << " is out of range.\n";
    }
    return 0;
}
```

**Sample run:**
```
Enter a number: 42
42 is in range [1, 100].
```

```
Enter a number: 0
0 is out of range.
```

## Loops: the `for` loop

A `for` loop is the right tool when you know in advance how many times you need to repeat something.

```cpp
#include <iostream>

int main() {
    for (int i = 1; i <= 5; ++i) {
        std::cout << i << " squared = " << i * i << "\n";
    }
    return 0;
}
```

**Output:**
```
1 squared = 1
2 squared = 4
3 squared = 9
4 squared = 16
5 squared = 25
```

The three parts of the header:
- `int i = 1` — initialization, runs once before the loop starts
- `i <= 5` — condition checked before each iteration; loop ends when false
- `++i` — update, runs after each iteration

## Computing a product with a loop

Summing a range uses `+= i`. Multiplying uses `*= i`, but the starting value must be `1` (not `0`—multiplying anything by 0 gives 0 forever).

```cpp
#include <iostream>

int main() {
    int low = 0, high = 0;
    std::cout << "Enter two integers: ";
    std::cin >> low >> high;

    if (low > high) {
        int tmp = low;
        low = high;
        high = tmp;
    }

    long long product = 1;
    for (int i = low; i <= high; ++i) {
        product *= i;
    }

    std::cout << "Product from " << low << " to " << high
              << " = " << product << "\n";
    return 0;
}
```

**Sample run — normal order:**
```
Enter two integers: 3 6
Product from 3 to 6 = 360
```

**Sample run — reversed order (program handles it):**
```
Enter two integers: 6 3
Product from 3 to 6 = 360
```

**Sample run — same value:**
```
Enter two integers: 5 5
Product from 5 to 5 = 5
```

## Edge cases to test

Before submitting any program, run it on these classes of input:
- The normal case (`low < high`)
- Reversed order (`high < low`)
- Same value (`low == high`) — should just be that one number
- One of them is negative
- Both negative

Testing edge cases is what separates a working program from a lucky program.

---

*This week's lab has you write pseudocode and implement a menu with `if/else`. The program computes a series product over a user-specified interval.*
