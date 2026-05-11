---
slug: week-13-notes
title: "Week 13: Virtual dispatch puzzles and 3D vector algebra"
date: "2026-05-23"
summary: "Abstract bases, access control gotchas; ThreeDVec with dot/cross/magnitude operators."
tags: ["virtual", "abstract-class", "operators", "math", "classes"]
week: 13
---

# Week 13: Virtual Functions, Access Control, and Operator Overloading

## How virtual dispatch actually works

When you call a virtual function through a pointer or reference, C++ looks up the function in a hidden table (the **vtable**) attached to the object's actual type—not the declared type of the pointer.

```cpp
class Base {
public:
    virtual void hello() const { std::cout << "Base\n"; }
    virtual ~Base() {}
};

class Derived : public Base {
public:
    void hello() const override { std::cout << "Derived\n"; }
};

Base* ptr = new Derived();
ptr->hello();    // prints "Derived" — virtual dispatch
delete ptr;
```

Without `virtual`, `ptr->hello()` would always print `"Base"` because the compiler uses the static (declared) type of `ptr`.

## Pure virtual = abstract class = cannot instantiate

```cpp
class Shape {
public:
    virtual double area() const = 0;   // no body — subclasses MUST implement
    virtual ~Shape() {}
};

// Shape s;      // ERROR: cannot instantiate abstract class
// Shape* p = new Shape();   // ERROR: same reason
Shape* p = new Circle(5.0);  // OK: Circle implements area()
```

## Access-control pitfall: overloading in a derived class

If `VBase` has a private member that `VDerived::getStuff()` tries to access, the build fails:

```cpp
class VBase {
    int stuff;   // private — subclasses cannot reach it
public:
    VBase(int s) : stuff(s) {}
    virtual int getStuff() const { return stuff; }
};

class VDerived : public VBase {
public:
    VDerived(int s) : VBase(s) {}
    int getStuff() const override {
        return stuff * stuff;   // ERROR: 'stuff' is private in VBase
    }
};
```

Fix: change `private` to `protected` in `VBase`:

```cpp
class VBase {
protected:       // <-- now accessible to derived classes
    int stuff;
    ...
};
```

**`protected`** is the midpoint between `public` (everyone) and `private` (only the class itself). Use it specifically for members derived classes need to read or modify.

## Operator overloading

C++ lets you give standard operators (`+`, `*`, `<<`, etc.) custom meaning for your types. The result feels natural to callers.

```cpp
class Vec2 {
public:
    double x, y;
    Vec2(double x = 0, double y = 0) : x(x), y(y) {}

    Vec2 operator+(const Vec2& rhs) const {
        return Vec2(x + rhs.x, y + rhs.y);
    }

    Vec2 operator*(double scalar) const {
        return Vec2(x * scalar, y * scalar);
    }

    double dot(const Vec2& rhs) const {
        return x * rhs.x + y * rhs.y;
    }
};

// Free function for output
std::ostream& operator<<(std::ostream& os, const Vec2& v) {
    return os << "(" << v.x << ", " << v.y << ")";
}
```

Usage reads naturally:

```cpp
Vec2 a(1, 2), b(3, 4);
Vec2 c = a + b;          // (4, 6)
Vec2 d = a * 3.0;        // (3, 6)
double s = a.dot(b);     // 11.0
std::cout << c << "\n";  // (4, 6)
```

## 3D vector algebra

Extending to three dimensions, the core operations are:

```text
||V||  = sqrt(x*x + y*y + z*z)              (magnitude)
V · W  = x1*x2 + y1*y2 + z1*z2             (dot product — scalar)
V ^ W  = (y1*z2-z1*y2, z1*x2-x1*z2, x1*y2-y1*x2)  (cross product — vector)
```

Magnitude requires `#include <cmath>` for `std::sqrt`. The cross product is a vector perpendicular to both inputs.

```cpp
#include <cmath>

class ThreeDVec {
public:
    ThreeDVec(double x = 0, double y = 0, double z = 0)
        : x_(x), y_(y), z_(z) {}

    double magnitude() const {
        return std::sqrt(x_*x_ + y_*y_ + z_*z_);
    }

    double operator*(const ThreeDVec& rhs) const {  // dot product
        return x_*rhs.x_ + y_*rhs.y_ + z_*rhs.z_;
    }

    ThreeDVec operator^(const ThreeDVec& rhs) const {  // cross product
        return ThreeDVec(
            y_*rhs.z_ - z_*rhs.y_,
            z_*rhs.x_ - x_*rhs.z_,
            x_*rhs.y_ - y_*rhs.x_
        );
    }

    ThreeDVec operator+(const ThreeDVec& rhs) const {
        return ThreeDVec(x_+rhs.x_, y_+rhs.y_, z_+rhs.z_);
    }

private:
    double x_, y_, z_;
};
```

---

*The lab investigates abstract classes and access control by intentionally provoking errors and recording the compiler messages. The program implements the full `ThreeDVec` class behind a provided test driver.*
