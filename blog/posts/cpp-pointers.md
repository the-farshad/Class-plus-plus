---
slug: cpp-pointers
title: "Understanding Pointers in C++"
date: "2026-05-11"
summary: "A quick guide to pointers, memory addresses, and common pitfalls in C++."
tags: ["pointers","memory","references"]
---
# Understanding Pointers in C++

Pointers are one of the most powerful and, at times, confusing features of C++. A pointer is simply a variable that stores the **memory address** of another variable.

## Basic Syntax

To declare a pointer, use the `*` symbol:

```cpp
int myVar = 10;
int* ptr = &myVar; // ptr now stores the address of myVar
```

- `&` is the **address-of** operator.
- `*` (when used in a declaration) indicates the variable is a pointer.
- `*` (when used on an existing pointer) is the **dereference** operator, allowing you to access the value stored at that address.

## Why use pointers?

1. **Efficiency**: Pass large objects to functions without copying them.
2. **Dynamic Memory**: Allocate memory on the heap during runtime using `new` and `delete`.
3. **Data Structures**: Build complex structures like linked lists, trees, and graphs.

## Common Pitfalls

- **Dangling Pointers**: A pointer that points to a memory location that has been deleted.
- **Memory Leaks**: Forgetting to `delete` memory allocated with `new`.
- **Null Pointers**: Always initialize pointers to `nullptr` if they don't point to anything yet.

```cpp
int* p = nullptr;
if (p != nullptr) {
    // safe to dereference
}
```

Understanding pointers is a crucial step in mastering C++. Practice by tracing memory addresses and values in your IDE's debugger!
