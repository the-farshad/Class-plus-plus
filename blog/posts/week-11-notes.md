---
slug: week-11-notes
title: "Week 11: Raw C-strings vs a handcrafted string class"
date: "2026-05-21"
summary: "strlen_s-style safety where available; cin.getline drains; dynamic storage for char buffers."
tags: ["cstring", "char-array", "cin", "class-design", "memory"]
week: 11
---

# Week 11: C-Strings — The Low-Level Foundation of Text

Before `std::string`, text was stored as an array of `char` with a **null terminator** (`'\0'`) marking the end. Understanding this is essential because you encounter it in system APIs, old codebases, and this course's assignments.

## What is a C-string?

A C-string is a `char` array whose last used element is `'\0'` (ASCII 0):

```
 H   e   l   l   o  \0
[0] [1] [2] [3] [4] [5]
```

```cpp
#include <iostream>
#include <cstring>

int main() {
    char greeting[6] = "Hello";   // compiler adds '\0'
    std::cout << greeting << "\n";
    std::cout << "Length: " << strlen(greeting) << "\n";
    return 0;
}
```

**Output:**
```
Hello
Length: 5
```

The array must be large enough for the string **plus** the terminator. A 5-character string needs at least 6 elements.

## Key C-string functions (`<cstring>`)

```cpp
#include <iostream>
#include <cstring>

int main() {
    char s1[] = "Hello";
    char s2[20];

    std::cout << "strlen: "  << strlen(s1) << "\n";

    strcpy(s2, s1);
    std::cout << "strcpy: "  << s2 << "\n";

    strcat(s2, " world");
    std::cout << "strcat: "  << s2 << "\n";

    std::cout << "strcmp(s1,s2): " << strcmp(s1, s2) << "\n";  // negative: s1 < s2
    std::cout << "strcmp(s1,s1): " << strcmp(s1, s1) << "\n";  // 0: equal
    return 0;
}
```

**Output:**
```
strlen: 5
strcpy: Hello
strcat: Hello world
strcmp(s1,s2): -32
strcmp(s1,s1): 0
```

On Visual Studio with `/SDL` enabled, `strcpy_s` and `strnlen_s` are preferred. On GCC/Clang use the standard versions.

## Reading C-strings from the keyboard

`cin >>` reads one word; `cin.getline` reads an entire line including spaces:

```cpp
#include <iostream>
#include <cstring>
#include <limits>

int main() {
    char name[50];
    char sentence[256];

    std::cout << "Enter a name: ";
    std::cin >> name;

    // drain the leftover newline BEFORE calling getline
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

    std::cout << "Enter a sentence: ";
    std::cin.getline(sentence, sizeof(sentence));

    std::cout << "Name: "         << name               << "\n";
    std::cout << "Name length: "  << strlen(name)       << "\n";
    std::cout << "Sentence: "     << sentence           << "\n";
    std::cout << "Sent length: "  << strlen(sentence)   << "\n";
    return 0;
}
```

**Sample run:**
```
Enter a name: Torres
Enter a sentence: The quick brown fox
Name: Torres
Name length: 6
Sentence: The quick brown fox
Sent length: 19
```

Without the `ignore()`, `getline` would silently consume the leftover newline and `sentence` would be empty.

## Echoing a C-string one character at a time

```cpp
#include <iostream>
#include <cstring>

int main() {
    char word[50];
    std::cout << "Enter a word: ";
    std::cin >> word;

    std::cout << "Characters:\n";
    for (int i = 0; word[i] != '\0'; ++i) {
        std::cout << "  [" << i << "] = '" << word[i] << "'\n";
    }
    return 0;
}
```

**Sample run:**
```
Enter a word: code
Characters:
  [0] = 'c'
  [1] = 'o'
  [2] = 'd'
  [3] = 'e'
```

## Implementing a string class with dynamic storage

```cpp
#include <iostream>
#include <cstring>

class SimpleString {
public:
    SimpleString() : data_(nullptr), length_(0) {}

    explicit SimpleString(const char* src) {
        if (!src) { data_ = nullptr; length_ = 0; return; }
        length_ = strlen(src);
        data_   = new char[length_ + 1];
        strcpy(data_, src);
    }

    ~SimpleString() { delete[] data_; }

    size_t length() const { return length_; }

    void print() const {
        if (data_) std::cout << data_;
        std::cout << "\n";
    }

private:
    char*  data_;
    size_t length_;
};

int main() {
    SimpleString s("Wyoming");
    std::cout << "String: ";
    s.print();
    std::cout << "Length: " << s.length() << "\n";

    SimpleString empty;
    std::cout << "Empty length: " << empty.length() << "\n";
    return 0;
}
```

**Output:**
```
String: Wyoming
Length: 7
Empty length: 0
```

Key rules with `new`:
- Every `new` needs exactly one matching `delete[]` (for arrays).
- The destructor is responsible for releasing memory.
- If a class manages heap memory, you almost certainly need a copy constructor and copy-assignment operator too.

---

*The lab explores `cin.getline`, `strlen`, and character-by-character output with a char buffer. The program implements a string class with dynamic heap storage behind a given interface.*
