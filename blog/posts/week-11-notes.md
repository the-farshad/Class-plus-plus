---
slug: week-11-notes
title: "Week 11: Raw C-strings vs a handcrafted string class"
date: "2026-05-21"
summary: "strlen_s-style safety where available; cin.getline drains; dynamic storage for char buffers."
tags: ["cstring", "char-array", "cin", "class-design", "memory"]
week: 11
---

# Week 11: C-Strings — The Low-Level Foundation of Text

Before `std::string`, text in C (and early C++) was stored as an array of `char` with a special **null terminator** (`'\0'`) marking the end. Understanding this is essential because you will encounter it in old code, in system APIs, and when taking this course.

## What is a C-string?

A C-string is a `char` array where the last element is `'\0'` (ASCII value 0):

```
 H   e   l   l   o  \0
[0] [1] [2] [3] [4] [5]   <- indices
```

Declare and initialize:

```cpp
char greeting[6] = "Hello";   // compiler adds the '\0' automatically
char letter[1]   = {'\0'};    // just the terminator — empty string
```

The array must be large enough to hold the string *plus* the terminator. A 5-character string needs at least 6 elements.

## Key C-string functions (`<cstring>`)

```cpp
#include <cstring>

char s1[] = "Hello";
char s2[20];

strlen(s1);          // 5 — length NOT counting '\0'
strcpy(s2, s1);      // copy s1 into s2 (s2 must be large enough)
strcat(s2, " world");// append " world" to s2
strcmp(s1, s2);      // 0 if equal, <0 / >0 otherwise
```

**Never write past the end of the array.** There is no automatic bounds checking—if your array is too small and you write beyond it, you corrupt memory.

On Visual Studio with `/SDL` enabled, the *_s* variants are safer:

```cpp
size_t len = strnlen_s(s1, 128);  // checks at most 128 bytes
strcpy_s(s2, sizeof(s2), s1);     // checks destination size
```

On GCC/Clang these may not be available; use the regular versions with careful size calculations.

## Reading C-strings from the keyboard

`cin >> buffer` reads a word (stops at whitespace). For a full sentence, use `cin.getline`:

```cpp
char name[50];
char sentence[256];

std::cout << "Enter a name: ";
std::cin >> name;                           // reads one word

// drain leftover newline BEFORE calling getline
std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

std::cout << "Enter a sentence: ";
std::cin.getline(sentence, sizeof(sentence));   // reads up to 255 chars + '\0'

std::cout << "Name length: " << strlen(name) << "\n";
std::cout << "Sentence: " << sentence << "\n";
std::cout << "gcount: " << std::cin.gcount() << "\n";  // chars just read
```

`cin.gcount()` returns how many characters the last `getline` actually read. Useful for diagnostics.

### The leftover-newline problem

Whenever you mix `>>` and `getline`, there is a leftover `\n` in the stream after the `>>` read. If you call `getline` without draining it, `getline` immediately returns an empty string—it just read that newline.

The fix is always `cin.ignore(...)` between a `>>` read and a `getline`.

## Echoing a C-string one character at a time

Treat the buffer as an array and index into it:

```cpp
char word[50];
std::cin >> word;

std::cout << "Character by character:\n";
for (int i = 0; word[i] != '\0'; ++i) {
    std::cout << word[i] << "\n";
}
```

## Implementing a string class with dynamic storage

When you build a class that owns a C-string of unknown length, you need to allocate memory at runtime:

```cpp
class SimpleString {
public:
    SimpleString() : data_(nullptr), length_(0) {}

    explicit SimpleString(const char* src) {
        if (src == nullptr) {
            data_ = nullptr;
            length_ = 0;
        } else {
            length_ = strlen(src);
            data_ = new char[length_ + 1];   // +1 for '\0'
            strcpy(data_, src);
        }
    }

    ~SimpleString() {
        delete[] data_;   // must free what we allocated
    }

    size_t length() const { return length_; }

    void print() const {
        if (data_) std::cout << data_;
    }

private:
    char*  data_;
    size_t length_;

    // Copy constructor and assignment deliberately omitted here—
    // implementing them correctly is part of the week's assignment
};
```

Key rules whenever you use `new`:
- Every `new` must have exactly one matching `delete` (or `delete[]` for arrays).
- The destructor is responsible for releasing memory.
- If a class manages heap memory, you almost certainly need a copy constructor and copy-assignment operator too (the Rule of Three).

---

*The lab explores `cin.getline`, `strlen`, and character-by-character output with a char buffer. The program implements a string class with dynamic heap storage behind a given interface.*
