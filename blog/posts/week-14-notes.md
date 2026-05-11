---
slug: week-14-notes
title: "Week 14: Debugging mixed I/O and vector statistics"
date: "2026-05-24"
summary: "Repair getline/cin interactions; load ints from file; mean and median with STL vector."
tags: ["debugging", "getline", "vector", "median", "exceptions-readiness"]
week: 14
---

# Week 14: Debugging, Statistics, and Wrapping Up

## Debugging systematically

When you inherit buggy code, resist the urge to start changing things randomly. Work through these steps:

1. **Read the expected behavior** — what should the program do?
2. **Run it and observe the actual behavior** — what does it do instead?
3. **Form a hypothesis** — what could cause this specific symptom?
4. **Test the hypothesis** — add a `cout` to inspect state at that point.
5. **Fix one thing at a time** — confirm each fix before moving on.

## The `cin` + `getline` name-reading bug

A classic bug: the program reads a name with `cin >>` and full names break because `>>` stops at the first space.

**Buggy version:**
```cpp
#include <iostream>
#include <string>

int main() {
    std::string nurseName, patientName;
    std::cout << "Enter nurse's name: ";
    std::cin >> nurseName;          // stops at first space!
    std::cout << "Enter patient's name: ";
    std::cin >> patientName;        // picks up leftover words from nurse's name

    std::cout << "Nurse:   " << nurseName   << "\n";
    std::cout << "Patient: " << patientName << "\n";
    return 0;
}
```

**Sample run with full name — wrong output:**
```
Enter nurse's name: Josephine Nightingale
Enter patient's name: Nurse:   Josephine
Patient: Nightingale
```

**Fixed version using `getline`:**
```cpp
#include <iostream>
#include <string>
#include <limits>

int main() {
    std::string nurseName, patientName;

    std::cout << "Enter nurse's name: ";
    std::getline(std::cin, nurseName);

    std::cout << "Enter patient's name: ";
    std::getline(std::cin, patientName);

    std::cout << "Nurse:   " << nurseName   << "\n";
    std::cout << "Patient: " << patientName << "\n";
    return 0;
}
```

**Sample run — correct output:**
```
Enter nurse's name: Josephine Nightingale
Enter patient's name: Poor Unfortunate Soule
Nurse:   Josephine Nightingale
Patient: Poor Unfortunate Soule
```

## Computing the mean

```cpp
#include <vector>
#include <iostream>

double mean(const std::vector<int>& v) {
    if (v.empty()) return 0.0;
    long long sum = 0;
    for (int x : v) sum += x;
    return static_cast<double>(sum) / static_cast<double>(v.size());
}

int main() {
    std::vector<int> data = {4, 8, 15, 16, 23, 42};
    std::cout << "Mean: " << mean(data) << "\n";
    return 0;
}
```

**Output:**
```
Mean: 18
```

Use `long long` for the accumulator—if values are large and the vector is long, `int` overflows silently.

## Computing the median

```cpp
#include <vector>
#include <algorithm>
#include <iostream>

double median(std::vector<int> v) {   // pass by VALUE — we sort a copy
    if (v.empty()) return 0.0;
    std::sort(v.begin(), v.end());
    size_t n = v.size();
    if (n % 2 == 1)
        return static_cast<double>(v[n / 2]);
    else
        return (v[n/2 - 1] + v[n/2]) / 2.0;
}

int main() {
    std::vector<int> odd  = {3, 1, 4, 1, 5};
    std::vector<int> even = {3, 1, 4, 1, 5, 9};

    std::cout << "Odd  count median: " << median(odd)  << "\n";
    std::cout << "Even count median: " << median(even) << "\n";
    return 0;
}
```

**Output:**
```
Odd  count median: 3
Even count median: 3.5
```

For `odd` = {1, 1, 3, 4, 5} sorted, middle element is index 2 → `3`.
For `even` = {1, 1, 3, 4, 5, 9} sorted, average of indices 2 and 3 → `(3 + 4) / 2 = 3.5`.

## Reading integers from a file into a vector

```cpp
#include <fstream>
#include <vector>
#include <iostream>
#include <string>

int readData(std::vector<int>& data, std::ifstream& file) {
    if (!file.is_open()) return 1;   // error
    int val = 0;
    while (file >> val) data.push_back(val);
    return 0;                        // success
}

int main() {
    std::string filename;
    std::ifstream file;

    while (true) {
        std::cout << "Enter filename: ";
        std::cin >> filename;
        file.open(filename);
        if (file.is_open()) break;
        std::cout << "  Cannot open \"" << filename << "\"\n";
        file.clear();
    }

    std::vector<int> data;
    if (readData(data, file) != 0 || data.empty()) {
        std::cout << "No data to process.\n";
        return 1;
    }
    file.close();

    std::cout << "Count:  " << data.size()  << "\n";
    std::cout << "Mean:   " << mean(data)   << "\n";
    std::cout << "Median: " << median(data) << "\n";
    return 0;
}
```

If the file `scores.txt` contains: `72 88 91 65 78 95 83 70`

**Sample run:**
```
Enter filename: missing.txt
  Cannot open "missing.txt"
Enter filename: scores.txt
Count:  8
Mean:   80.25
Median: 80.5
```

## Looking ahead: exceptions

STL operations can throw `std::bad_alloc` when memory runs out. A `try/catch` block handles this gracefully:

```cpp
#include <stdexcept>
#include <iostream>

try {
    std::sort(v.begin(), v.end());
} catch (const std::exception& e) {
    std::cerr << "Error: " << e.what() << "\n";
}
```

You will explore exception-driven design in later courses. For now, knowing the syntax exists is enough.

---

*The lab has you find and fix bugs in a provided program where full names break the I/O flow. The program loads integers from a file and computes mean and median.*
