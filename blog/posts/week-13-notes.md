---
slug: week-13-notes
title: "Week 13: Virtual dispatch puzzles and 3D vector algebra"
date: "2026-05-23"
summary: "Abstract bases, access control gotchas; ThreeDVec with dot/cross/magnitude operators."
tags: ["virtual", "abstract-class", "operators", "math", "classes"]
week: 13
---

# Week 13: Virtual Functions, Access Control, and Operator Overloading

## How virtual dispatch works

When you call a virtual function through a pointer or reference, C++ looks up the function in a hidden table (the **vtable**) attached to the object's actual type—not the declared type of the pointer.

```cpp
#include <iostream>

class Base {
public:
    virtual void hello() const { std::cout << "Hello from Base\n"; }
    virtual ~Base() {}
};

class Derived : public Base {
public:
    void hello() const override { std::cout << "Hello from Derived\n"; }
};

int main() {
    Base* ptr = new Derived();
    ptr->hello();    // virtual dispatch — calls Derived version
    delete ptr;

    Base b;
    b.hello();       // no pointer — calls Base version directly
    return 0;
}
```

**Output:**
```
Hello from Derived
Hello from Base
```

Without `virtual`, `ptr->hello()` would always print `"Hello from Base"`.

## Pure virtual = abstract class = cannot instantiate

```cpp
#include <iostream>

class Shape {
public:
    virtual double area() const = 0;   // pure virtual
    virtual ~Shape() {}
};

class Square : public Shape {
    double s_;
public:
    Square(double s) : s_(s) {}
    double area() const override { return s_ * s_; }
};

int main() {
    // Shape s;         // ERROR: cannot instantiate abstract class
    Square sq(4.0);
    std::cout << "Square area: " << sq.area() << "\n";

    Shape* p = new Square(3.0);
    std::cout << "Via pointer: " << p->area() << "\n";
    delete p;
    return 0;
}
```

**Output:**
```
Square area: 16
Via pointer: 9
```

## Access-control pitfall: `private` vs `protected`

```cpp
#include <iostream>

class VBase {
    int stuff_;        // private — derived class CANNOT access
public:
    VBase(int s) : stuff_(s) {}
    virtual int getStuff() const { return stuff_; }
};

class VDerived : public VBase {
public:
    VDerived(int s) : VBase(s) {}
    // int getStuff() const override { return stuff_ * stuff_; }
    // ^^^ COMPILER ERROR: 'stuff_' is private in VBase
};
```

Fix: change `private` to `protected` in `VBase`:

```cpp
class VBase {
protected:
    int stuff_;        // now accessible to derived classes
public:
    VBase(int s) : stuff_(s) {}
    virtual int getStuff() const { return stuff_; }
};

class VDerived : public VBase {
public:
    VDerived(int s) : VBase(s) {}
    int getStuff() const override { return stuff_ * stuff_; }
};

int main() {
    VDerived d(3);
    std::cout << "VBase::getStuff:    " << d.VBase::getStuff() << "\n";
    std::cout << "VDerived::getStuff: " << d.getStuff()        << "\n";
    return 0;
}
```

**Output:**
```
VBase::getStuff:    3
VDerived::getStuff: 9
```

## Operator overloading

C++ lets you give standard operators custom meaning for your types.

```cpp
#include <iostream>

class Vec2 {
public:
    double x, y;
    Vec2(double x = 0, double y = 0) : x(x), y(y) {}

    Vec2 operator+(const Vec2& rhs) const { return Vec2(x+rhs.x, y+rhs.y); }
    Vec2 operator*(double k)        const { return Vec2(x*k, y*k); }
    double dot(const Vec2& rhs)     const { return x*rhs.x + y*rhs.y; }
};

std::ostream& operator<<(std::ostream& os, const Vec2& v) {
    return os << "(" << v.x << ", " << v.y << ")";
}

int main() {
    Vec2 a(1, 2), b(3, 4);
    std::cout << "a        = " << a          << "\n";
    std::cout << "b        = " << b          << "\n";
    std::cout << "a + b    = " << (a + b)    << "\n";
    std::cout << "a * 3    = " << (a * 3.0)  << "\n";
    std::cout << "a dot b  = " << a.dot(b)   << "\n";
    return 0;
}
```

**Output:**
```
a        = (1, 2)
b        = (3, 4)
a + b    = (4, 6)
a * 3    = (3, 6)
a dot b  = 11
```

## 3D vector algebra

Extending to three dimensions:

```cpp
#include <iostream>
#include <cmath>

class Vec3 {
public:
    double x, y, z;
    Vec3(double x=0, double y=0, double z=0) : x(x), y(y), z(z) {}

    Vec3   operator+(const Vec3& r) const { return {x+r.x, y+r.y, z+r.z}; }
    double operator*(const Vec3& r) const { return x*r.x + y*r.y + z*r.z; }  // dot
    Vec3   operator^(const Vec3& r) const {                                    // cross
        return {y*r.z - z*r.y, z*r.x - x*r.z, x*r.y - y*r.x};
    }
    double magnitude() const { return std::sqrt(x*x + y*y + z*z); }
};

std::ostream& operator<<(std::ostream& os, const Vec3& v) {
    return os << "(" << v.x << ", " << v.y << ", " << v.z << ")";
}

int main() {
    Vec3 a(1, 0, 0);
    Vec3 b(0, 1, 0);

    std::cout << "a           = " << a            << "\n";
    std::cout << "b           = " << b            << "\n";
    std::cout << "a + b       = " << (a + b)      << "\n";
    std::cout << "a dot b     = " << (a * b)      << "\n";  // 0 (perpendicular)
    std::cout << "a cross b   = " << (a ^ b)      << "\n";  // (0,0,1)
    std::cout << "|a|         = " << a.magnitude() << "\n";
    return 0;
}
```

**Output:**
```
a           = (1, 0, 0)
b           = (0, 1, 0)
a + b       = (1, 1, 0)
a dot b     = 0
a cross b   = (0, 0, 1)
|a|         = 1
```

The dot product of two perpendicular unit vectors is always 0. The cross product of x-hat and y-hat is z-hat.

---

*The lab investigates abstract classes and access control by intentionally provoking errors and recording the compiler messages. The program implements the full `ThreeDVec` class behind a provided test driver.*
