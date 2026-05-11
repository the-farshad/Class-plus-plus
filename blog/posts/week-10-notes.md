---
slug: week-10-notes
title: "Week 10: STL vector analysis and Polynomial ADT"
date: "2026-05-20"
summary: "File → vector pipeline with range-for helpers; encapsulate coeffs/degree behaviors in a class."
tags: ["vector", "range-for", "file-io", "classes", "adts"]
week: 10
---

# Week 10: `std::vector` and Building Your Own ADT

## What is `std::vector`?

A `std::vector` is a dynamically-sized array that manages its own memory. Unlike a raw array, it grows automatically as you add elements.

```cpp
#include <vector>
#include <iostream>

int main() {
    std::vector<int> scores;

    scores.push_back(85);
    scores.push_back(92);
    scores.push_back(74);

    std::cout << "Size:  " << scores.size()  << "\n";
    std::cout << "First: " << scores[0]      << "\n";
    std::cout << "Last:  " << scores.back()  << "\n";
    return 0;
}
```

**Output:**
```
Size:  3
First: 85
Last:  74
```

Key operations:

| Operation | What it does |
|-----------|-------------|
| `v.push_back(x)` | append `x` to the end |
| `v.size()` | number of elements |
| `v[i]` | element at index `i` (no bounds check) |
| `v.at(i)` | element with bounds checking |
| `v.front()` / `v.back()` | first / last element |
| `v.empty()` | true if size is 0 |
| `v.clear()` | remove all elements |

## Range-based `for` loops

```cpp
#include <vector>
#include <iostream>

int main() {
    std::vector<int> nums = {3, 7, 2, 9, 1};

    std::cout << "Values: ";
    for (const int& n : nums) {
        std::cout << n << " ";
    }
    std::cout << "\n";

    // double each element
    for (int& n : nums) {
        n *= 2;
    }

    std::cout << "Doubled: ";
    for (const int& n : nums) {
        std::cout << n << " ";
    }
    std::cout << "\n";
    return 0;
}
```

**Output:**
```
Values:  3 7 2 9 1
Doubled: 6 14 4 18 2
```

## Loading a vector from a file

The correct order: **open → read all → close → then compute**. Do not mix reading and computation.

```cpp
#include <fstream>
#include <vector>
#include <iostream>
#include <string>

void readIntegers(std::vector<int>& data, std::ifstream& file) {
    int val = 0;
    while (file >> val) data.push_back(val);
}

int getMin(const std::vector<int>& v) {
    int m = v[0];
    for (const int& x : v) if (x < m) m = x;
    return m;
}

int getMax(const std::vector<int>& v) {
    int m = v[0];
    for (const int& x : v) if (x > m) m = x;
    return m;
}

double getAvg(const std::vector<int>& v) {
    long long sum = 0;
    for (const int& x : v) sum += x;
    return static_cast<double>(sum) / v.size();
}

int main() {
    std::ifstream inFile("numbers.txt");
    if (!inFile.is_open()) {
        std::cout << "Cannot open file.\n";
        return 1;
    }

    std::vector<int> data;
    readIntegers(data, inFile);
    inFile.close();

    if (data.empty()) {
        std::cout << "No data.\n";
        return 1;
    }

    std::cout << "Count: " << data.size()  << "\n";
    std::cout << "Min:   " << getMin(data) << "\n";
    std::cout << "Max:   " << getMax(data) << "\n";
    std::cout << "Avg:   " << getAvg(data) << "\n";
    return 0;
}
```

If `numbers.txt` contains: `10 5 3 22 8 15 1 19`

**Output:**
```
Count: 8
Min:   1
Max:   22
Avg:   10.375
```

## Designing an ADT: the Polynomial class

An ADT hides its internal representation and exposes only meaningful operations. For `4x³ + 3x² + 0.3x − 1.54`:

```cpp
#include <vector>
#include <iostream>
#include <iomanip>

class Polynomial {
public:
    Polynomial() {}

    void setCoeff(int exp, double val) {
        if (exp >= static_cast<int>(coeffs_.size()))
            coeffs_.resize(exp + 1, 0.0);
        coeffs_[exp] = val;
    }

    int    degree()                 const { return static_cast<int>(coeffs_.size()) - 1; }
    double getCoeff(int exp)        const { return (exp < static_cast<int>(coeffs_.size())) ? coeffs_[exp] : 0.0; }

    double evaluate(double x) const {
        double result = 0.0;
        for (int k = degree(); k >= 0; --k)
            result = result * x + coeffs_[k];   // Horner's method
        return result;
    }

private:
    std::vector<double> coeffs_;  // coeffs_[k] = coefficient for x^k
};

int main() {
    Polynomial p;
    p.setCoeff(3,  4.0);   // 4x^3
    p.setCoeff(2,  3.0);   // 3x^2
    p.setCoeff(1,  0.3);   //  0.3x
    p.setCoeff(0, -1.54);  // -1.54

    std::cout << "Degree: " << p.degree() << "\n";
    std::cout << std::fixed << std::setprecision(4);
    std::cout << "p(0) = " << p.evaluate(0.0) << "\n";  // should be -1.54
    std::cout << "p(1) = " << p.evaluate(1.0) << "\n";  // 4+3+0.3-1.54 = 5.76
    std::cout << "p(2) = " << p.evaluate(2.0) << "\n";  // 32+12+0.6-1.54 = 43.06
    return 0;
}
```

**Output:**
```
Degree: 3
p(0) = -1.5400
p(1) = 5.7600
p(2) = 43.0600
```

---

*The lab reads integers from a file into a vector and finds min/max/average with range-for helper functions. The program completes a Polynomial class behind a provided header.*
