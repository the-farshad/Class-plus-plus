---
slug: week-7-notes
title: "Week 7: Line-oriented files and structured records"
date: "2026-05-17"
summary: "Retry open/copy with getline; read employee structs from a block-formatted binary-style file."
tags: ["fstream", "getline", "structs", "file-io"]
week: 7
---

# Week 7: Reading and Writing Files

Keyboard input disappears when a program ends. Files let you persist data between runs, process large datasets, and share output with other programs.

## Opening a file

Include `<fstream>` and declare either an `ifstream` (input) or `ofstream` (output):

```cpp
#include <fstream>
#include <iostream>
#include <string>

int main() {
    std::ifstream inFile("data.txt");

    if (!inFile.is_open()) {
        std::cout << "Could not open data.txt\n";
        return 1;
    }

    // ... read from inFile ...

    inFile.close();
    return 0;
}
```

Always check `is_open()` (or test the stream as a boolean) before reading. Files may not exist, may have wrong permissions, or the path may be wrong.

## Prompting until a file opens successfully

Programs that rely on a filename from the user should retry:

```cpp
#include <fstream>
#include <iostream>
#include <string>

std::ifstream openUntilSuccess() {
    std::string name;
    std::ifstream file;

    while (true) {
        std::cout << "Enter filename: ";
        std::cin >> name;
        file.open(name);
        if (file.is_open()) return file;    // move-return

        std::cout << "  Cannot open \"" << name << "\". Try again.\n";
        file.clear();                       // reset flags before reuse
    }
}
```

## Reading line by line with `getline`

`operator>>` on strings stops at whitespace. `std::getline` reads an entire line including spaces:

```cpp
std::string line;
while (std::getline(inFile, line)) {
    // process line
    std::cout << line << "\n";
}
```

`getline` returns the stream (which converts to `false` at end-of-file), so using it directly in the `while` condition is the correct loop structure.

### The newline trap

`getline` reads up to and including `\n`, discarding the newline. When you copy to an output file, put it back:

```cpp
std::string line;
while (std::getline(input, line)) {
    output << line << "\n";   // restore the newline that getline consumed
}
```

### Mixing `>>` and `getline`

`operator>>` leaves a newline in the buffer after reading a word or number. If you then call `getline`, it immediately reads that leftover newline as an empty line. Fix it by ignoring the remainder of the line after the `>>` read:

```cpp
int n = 0;
std::cin >> n;
std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');  // flush newline
std::string sentence;
std::getline(std::cin, sentence);   // now reads correctly
```

## Reading structured records

When a file contains repeated blocks of data describing the same kind of thing, define a struct and read one block per iteration:

```cpp
struct Employee {
    int   id;
    char  department[25];
    float hours;
};
```

Read sequentially until end-of-file or a sentinel value:

```cpp
Employee emp;
int totalCount = 0;
float totalHours = 0.0f;

while (inFile >> emp.id >> emp.department >> emp.hours) {
    if (emp.id == 0) break;          // sentinel record
    ++totalCount;
    totalHours += emp.hours;
}

if (totalCount > 0) {
    std::cout << totalCount << " employees, "
              << "average " << totalHours / totalCount << " hours.\n";
}
```

## Opening for append vs truncate

By default, `ofstream` **truncates** (erases) an existing file. To add to the end instead:

```cpp
std::ofstream log("log.txt", std::ios::app);   // append mode
```

Use append when writing a summary at the end of an existing file, or accumulating logs across runs.

## Always close files

When you are done with a file, call `.close()`. For short programs it happens automatically at the end of scope, but explicitly closing is good practice—and required when you need to check for write errors.

---

*The lab this week has you copy one file to another line by line, handling open failures gracefully. The program reads structured records from a file and computes totals.*
