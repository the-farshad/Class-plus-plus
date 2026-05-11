---
slug: week-14-notes
title: "Week 14: Debugging mixed I/O and vector statistics"
date: "2026-05-24"
summary: "Repair getline/cin interactions; load ints from file; mean and median with STL vector."
tags: ["debugging", "getline", "vector", "median", "exceptions-readiness"]
week: 14
---

# Week 14: Debugging, Statistics, and Wrapping Up

Two skills meet this week: reading code that is **already broken** and fixing it systematically, and computing **statistical summaries** (mean and median) of data loaded from a file.

## Debugging systematically

When you inherit buggy code, resist the urge to start changing things randomly. Work through these steps:

1. **Read the expected behavior** — what should the program do?
2. **Run it and observe the actual behavior** — what does it do instead?
3. **Form a hypothesis** — what could cause this specific symptom?
4. **Test the hypothesis** — add a `cout` or use the debugger to inspect state.
5. **Fix one thing at a time** — confirm each fix before moving on.

## The `cin` + `getline` name-reading bug

A classic bug: a program reads a name with `cin >>` expecting one word, but full names have spaces, so `getline` is needed instead. Without the fix:

```cpp
std::string nurseName, patientName;

std::cout << "Enter nurse's name: ";
std::cin >> nurseName;           // reads only first word, leaves rest in buffer

std::cout << "Enter patient's name: ";
std::cin >> patientName;         // picks up second word of nurse's name!
```

For names with spaces, use `getline` throughout, and ensure there is no leftover newline before the first call:

```cpp
std::string nurseName, patientName;

// If anything was read with >> before this, call:
// std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

std::cout << "Enter nurse's name: ";
std::getline(std::cin, nurseName);

std::cout << "Enter patient's name: ";
std::getline(std::cin, patientName);
```

Now "Josephine Nightingale" stays together as the nurse's name.

## Computing the mean

```cpp
#include <vector>
#include <numeric>   // for std::accumulate

double mean(const std::vector<int>& v) {
    if (v.empty()) return 0.0;
    long long sum = 0;
    for (int x : v) sum += x;
    return static_cast<double>(sum) / static_cast<double>(v.size());
}
```

Watch out for overflow: if the values are large and the vector is long, `int` can overflow. Use `long long` for the accumulator.

## Computing the median

The median is the middle value when the data is sorted. For even counts, it is the average of the two middle values.

```cpp
#include <algorithm>   // for std::sort

double median(std::vector<int> v) {   // pass by VALUE — we will sort it
    if (v.empty()) return 0.0;
    std::sort(v.begin(), v.end());

    size_t n = v.size();
    if (n % 2 == 1) {
        return static_cast<double>(v[n / 2]);         // middle element
    } else {
        return (v[n/2 - 1] + v[n/2]) / 2.0;          // average of two middles
    }
}
```

Passing by value (not reference) means the sort happens on a copy—the caller's vector is unchanged. This is intentional when the caller still needs the original order.

## Reading integers from a file into a vector

```cpp
#include <fstream>
#include <vector>
#include <string>
#include <iostream>

std::vector<int> readData(const std::string& filename, bool& ok) {
    std::vector<int> data;
    std::ifstream file(filename);
    if (!file.is_open()) {
        ok = false;
        return data;
    }
    int val = 0;
    while (file >> val) {
        data.push_back(val);
    }
    ok = true;
    return data;
}
```

The function signals success/failure through the `bool&` parameter because the return value is already used for the data. An alternative is to return an empty vector and let the caller decide what "empty" means, but explicit status is clearer.

## Prompting until a file opens

```cpp
std::string promptForFile() {
    std::string name;
    while (true) {
        std::cout << "Enter filename: ";
        std::cin >> name;
        std::ifstream test(name);
        if (test.is_open()) return name;
        std::cout << "  Cannot open \"" << name << "\" — try again.\n";
    }
}
```

## Putting it all together

```cpp
int main() {
    std::string filename = promptForFile();

    bool ok = false;
    std::vector<int> data = readData(filename, ok);
    if (!ok || data.empty()) {
        std::cout << "No data to process.\n";
        return 1;
    }

    std::cout << "Count:  " << data.size()  << "\n";
    std::cout << "Mean:   " << mean(data)   << "\n";
    std::cout << "Median: " << median(data) << "\n";
    return 0;
}
```

## Looking ahead: exceptions

`std::sort` and many STL operations can throw `std::bad_alloc` if memory runs out. A `try/catch` block gracefully handles these:

```cpp
try {
    std::sort(v.begin(), v.end());
} catch (const std::exception& e) {
    std::cerr << "Error: " << e.what() << "\n";
}
```

You will explore this further in later courses; for now, knowing the syntax exists is enough.

---

*The lab has you find and fix bugs in a provided program where full names break the I/O flow. The program loads integers from a file and computes mean and median.*
