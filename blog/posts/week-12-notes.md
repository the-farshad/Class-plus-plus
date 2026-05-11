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
#include <iostream>
#include <string>

class Animal {
public:
    Animal(const std::string& name) : name_(name) {}
    virtual void speak() const { std::cout << name_ << " makes a sound.\n"; }
    virtual ~Animal() {}
protected:
    std::string name_;
};

class Dog : public Animal {
public:
    Dog(const std::string& name) : Animal(name) {}
    void speak() const override {
        std::cout << name_ << " says: Woof!\n";
    }
};

class Cat : public Animal {
public:
    Cat(const std::string& name) : Animal(name) {}
    void speak() const override {
        std::cout << name_ << " says: Meow!\n";
    }
};

int main() {
    Dog d("Rex");
    Cat c("Whiskers");
    d.speak();
    c.speak();
    return 0;
}
```

**Output:**
```
Rex says: Woof!
Whiskers says: Meow!
```

`override` tells the compiler you intend to replace a virtual method—it catches typos in the signature.

## `protected` visibility

```cpp
class Vehicle {
protected:
    int speed_;   // derived classes can access; outside code cannot
public:
    Vehicle(int s) : speed_(s) {}
};

class Car : public Vehicle {
public:
    Car(int s) : Vehicle(s) {}
    void accelerate(int delta) {
        speed_ += delta;   // OK — Car can access protected member
        std::cout << "Speed now: " << speed_ << "\n";
    }
};
```

**Sample:**
```cpp
Car c(60);
c.accelerate(20);
```

**Output:**
```
Speed now: 80
```

## Constructor chains

```cpp
#include <iostream>
#include <string>

class Shape {
public:
    Shape(const std::string& color) : color_(color) {
        std::cout << "Shape created (" << color_ << ")\n";
    }
protected:
    std::string color_;
};

class Circle : public Shape {
public:
    Circle(const std::string& color, double r)
        : Shape(color), radius_(r) {
        std::cout << "Circle created (r=" << radius_ << ")\n";
    }
private:
    double radius_;
};

int main() {
    Circle c("blue", 5.0);
    return 0;
}
```

**Output:**
```
Shape created (blue)
Circle created (r=5)
```

Base constructor always runs first.

## Polymorphism via pointer or reference

```cpp
#include <iostream>

// (using Animal/Dog/Cat from above)
int main() {
    Animal* pets[3];
    pets[0] = new Dog("Rex");
    pets[1] = new Cat("Whiskers");
    pets[2] = new Dog("Buddy");

    for (int i = 0; i < 3; ++i)
        pets[i]->speak();

    for (int i = 0; i < 3; ++i)
        delete pets[i];
    return 0;
}
```

**Output:**
```
Rex says: Woof!
Whiskers says: Meow!
Buddy says: Woof!
```

This works because `speak()` is `virtual`—the actual type of the object is consulted at runtime.

## Abstract classes and sorting with STL

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <memory>
#include <cmath>

class TwoDShape {
public:
    virtual double area()      const = 0;
    virtual double perimeter() const = 0;
    virtual void   print()     const = 0;
    virtual ~TwoDShape() {}
};

class Circle : public TwoDShape {
    double r_;
public:
    Circle(double r) : r_(r) {}
    double area()      const override { return 3.14159265 * r_ * r_; }
    double perimeter() const override { return 2 * 3.14159265 * r_; }
    void   print()     const override {
        std::cout << "Circle r=" << r_
                  << "  area=" << area()
                  << "  perim=" << perimeter() << "\n";
    }
};

class Square : public TwoDShape {
    double s_;
public:
    Square(double s) : s_(s) {}
    double area()      const override { return s_ * s_; }
    double perimeter() const override { return 4 * s_; }
    void   print()     const override {
        std::cout << "Square s=" << s_
                  << "  area=" << area()
                  << "  perim=" << perimeter() << "\n";
    }
};

int main() {
    std::vector<std::unique_ptr<TwoDShape>> shapes;
    shapes.push_back(std::make_unique<Circle>(3.0));
    shapes.push_back(std::make_unique<Square>(5.0));
    shapes.push_back(std::make_unique<Circle>(1.5));
    shapes.push_back(std::make_unique<Square>(2.0));

    // sort by perimeter ascending
    std::sort(shapes.begin(), shapes.end(),
        [](const auto& a, const auto& b){
            return a->perimeter() < b->perimeter();
        });

    std::cout << "Sorted by perimeter:\n";
    for (const auto& s : shapes) s->print();
    return 0;
}
```

**Output:**
```
Sorted by perimeter:
Circle r=1.5  area=7.06858  perim=9.42478
Square s=2  area=4  perim=8
Square s=5  area=25  perim=20
Circle r=3  area=28.2743  perim=18.8496
```

Wait — that order looks off. Let me re-examine: `Circle r=1.5` perim ≈ 9.42, `Square s=2` perim = 8, `Square s=5` perim = 20, `Circle r=3` perim ≈ 18.85. Sorted ascending: 8, 9.42, 18.85, 20:

**Correct output:**
```
Sorted by perimeter:
Square s=2  area=4  perim=8
Circle r=1.5  area=7.06858  perim=9.42478
Circle r=3  area=28.2743  perim=18.8496
Square s=5  area=25  perim=20
```

To sort by area instead, replace `perimeter()` with `area()` in the lambda.

---

*The lab creates two derived vehicle classes from a provided `Auto` base. The program adds an `EqTriangle` to an existing 2D shape hierarchy, stores shapes in a vector, and sorts by perimeter.*
