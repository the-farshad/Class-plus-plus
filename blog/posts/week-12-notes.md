---
slug: week-12-notes
title: "Week 12: Inheritance fleets and polymorphic shapes"
date: "2026-05-22"
summary: "Derive specialized Auto types; extend abstract 2D hierarchy and sort by a geometric key."
tags: ["inheritance", "virtual", "polymorphism", "stl", "algorithms"]
week: 12
---

# Week 12: Inheritance and Polymorphism

Inheritance lets you define a new class as a specialization of an existing one, reusing everything the base class already does while adding or changing what is different.

## Basic inheritance syntax

```cpp
class Animal {
public:
    Animal(const std::string& name) : name_(name) {}
    void breathe() const { std::cout << name_ << " breathes.\n"; }
    virtual void speak() const { std::cout << name_ << " makes a sound.\n"; }
    virtual ~Animal() {}

protected:
    std::string name_;
};

class Dog : public Animal {
public:
    Dog(const std::string& name) : Animal(name) {}   // call base constructor
    void speak() const override {
        std::cout << name_ << " says: Woof!\n";
    }
    void fetch() const { std::cout << name_ << " fetches the ball.\n"; }
};
```

`public` inheritance means the public members of `Animal` remain public in `Dog`. The `override` keyword tells the compiler you intend to replace a virtual method—it catches typos in the signature.

## `protected` visibility

- `private` members are inaccessible to derived classes.
- `protected` members are accessible to derived classes but not to outside code.

Use `protected` for data or helpers that derived classes legitimately need, but that callers should not touch directly.

## Constructor chains

When a derived object is created, the **base constructor runs first**, then the derived constructor:

```cpp
Dog d("Rex");
// 1. Animal::Animal("Rex") — sets name_
// 2. Dog::Dog("Rex")       — nothing extra here
```

You must explicitly call the base constructor in the initializer list if it takes arguments:

```cpp
Dog::Dog(const std::string& name, const std::string& breed)
    : Animal(name), breed_(breed) {}
```

## Polymorphism: one interface, many behaviors

Polymorphism means a pointer or reference to a base class can transparently call derived class methods:

```cpp
Animal* a = new Dog("Rex");
a->speak();    // calls Dog::speak(), not Animal::speak()
delete a;
```

This only works because `speak()` is `virtual`. Without `virtual`, the base version would always be called regardless of the actual object type.

**Always make the destructor `virtual` in a base class.** Without it, `delete a` on the example above would call `Animal::~Animal()` only, leaking anything the `Dog` destructor would have cleaned up.

## Abstract classes and pure virtual functions

An **abstract class** is one you cannot instantiate directly—it serves only as a base. Mark a method as *pure virtual* with `= 0`:

```cpp
class TwoDShape {
public:
    virtual double area()      const = 0;   // pure virtual
    virtual double perimeter() const = 0;   // pure virtual
    virtual void   print()     const;       // regular virtual (has a body)
    virtual ~TwoDShape() {}
};
```

Any class with at least one pure virtual method is abstract. Derived classes must implement all pure virtual methods, or they are also abstract.

## Storing polymorphic objects in a vector

Because of **object slicing** (derived data is lost when copying to a base object), store pointers:

```cpp
#include <vector>
#include <memory>   // for unique_ptr

std::vector<std::unique_ptr<TwoDShape>> shapes;
shapes.push_back(std::make_unique<Circle>(5.0));
shapes.push_back(std::make_unique<Square>(3.0));
shapes.push_back(std::make_unique<EqTriangle>(4.0));

for (const auto& s : shapes) {
    s->print();
}
```

## Sorting with a custom comparator

`std::sort` from `<algorithm>` accepts a comparator function or lambda:

```cpp
#include <algorithm>

// Sort by area, largest first
std::sort(shapes.begin(), shapes.end(),
    [](const std::unique_ptr<TwoDShape>& a,
       const std::unique_ptr<TwoDShape>& b) {
        return a->area() > b->area();
    });
```

To sort by perimeter instead, just swap `area()` for `perimeter()`.

---

*The lab creates two derived vehicle classes from a provided `Auto` base. The program adds an `EqTriangle` to an existing 2D shape hierarchy, stores shapes in a vector, and sorts by perimeter.*
