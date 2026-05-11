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

A `std::vector` is a dynamically-sized array that manages its own memory. Unlike a raw array (`int arr[100]`), a vector grows automatically as you add elements and you never have to guess the size upfront.

```cpp
#include <vector>
#include <iostream>

int main() {
    std::vector<int> scores;    // empty, size = 0

    scores.push_back(85);
    scores.push_back(92);
    scores.push_back(74);

    std::cout << "Size: " << scores.size() << "\n";   // 3
    std::cout << "First: " << scores[0] << "\n";      // 85
    std::cout << "Last:  " << scores.back() << "\n";  // 74
    return 0;
}
```

Key operations:

| Operation | What it does |
|-----------|-------------|
| `v.push_back(x)` | append `x` to the end |
| `v.size()` | number of elements (type `size_t`) |
| `v[i]` | access element at index `i` (no bounds check) |
| `v.at(i)` | access with bounds checking (throws on bad index) |
| `v.front()` / `v.back()` | first / last element |
| `v.empty()` | true if size is 0 |
| `v.clear()` | remove all elements |

## Range-based `for` loops

The range-based `for` loop works with any container that has a begin/end:

```cpp
std::vector<int> nums = {3, 7, 2, 9, 1};

for (int n : nums) {
    std::cout << n << " ";
}
// 3 7 2 9 1
```

Use `const int& n` when you do not need to modify elements (avoids copying):

```cpp
int total = 0;
for (const int& n : nums) {
    total += n;
}
```

Use `int& n` when you do need to modify:

```cpp
for (int& n : nums) {
    n *= 2;   // doubles every element in place
}
```

## Loading a vector from a file

The correct order is: open file → read all data into vector → close file → then process. Do not mix reading and computation.

```cpp
#include <fstream>
#include <vector>
#include <iostream>
#include <string>

void readIntegers(std::vector<int>& data, std::ifstream& file) {
    int val = 0;
    while (file >> val) {
        data.push_back(val);
    }
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
    std::string filename;
    std::cout << "Filename: ";
    std::cin >> filename;

    std::ifstream inFile(filename);
    if (!inFile.is_open()) {
        std::cout << "Cannot open \"" << filename << "\"\n";
        return 1;
    }

    std::vector<int> data;
    readIntegers(data, inFile);
    inFile.close();

    if (data.empty()) {
        std::cout << "No data in file.\n";
        return 1;
    }

    std::cout << "Min: " << getMin(data)
              << "  Max: " << getMax(data)
              << "  Avg: " << getAvg(data) << "\n";
    return 0;
}
```

## Designing an ADT: the Polynomial class

An ADT (Abstract Data Type) hides its internal representation and exposes only meaningful operations. For a polynomial `4x³ + 3x² + 0.3x − 1.54`:

- Internally: an array/vector of coefficients, indexed by exponent
- Externally: methods like `degree()`, `evaluate(x)`, `print()`

```cpp
class Polynomial {
public:
    Polynomial();                              // zero polynomial
    Polynomial(int degree);                   // all-zero coefficients
    void setCoeff(int exponent, double val);  // set one coefficient
    double getCoeff(int exponent) const;
    int    degree() const;
    double evaluate(double x) const;          // compute p(x)
    void   print() const;

private:
    std::vector<double> coeffs_;  // coeffs_[k] is the coefficient for x^k
};
```

**Evaluate using Horner's method** — more efficient than computing each power separately:

```cpp
// p(x) = a0 + a1*x + a2*x^2 + a3*x^3
//       = a0 + x*(a1 + x*(a2 + x*a3))
double Polynomial::evaluate(double x) const {
    double result = 0.0;
    for (int k = static_cast<int>(coeffs_.size()) - 1; k >= 0; --k) {
        result = result * x + coeffs_[k];
    }
    return result;
}
```

---

*The lab reads integers from a file into a vector and finds min/max/average with range-for helper functions. The program completes a Polynomial class behind a provided header.*
