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

```cpp
#include <fstream>
#include <iostream>

int main() {
    std::ifstream inFile("data.txt");

    if (!inFile.is_open()) {
        std::cout << "Could not open data.txt\n";
        return 1;
    }

    std::cout << "File opened successfully.\n";
    inFile.close();
    return 0;
}
```

**Output (file exists):**
```
File opened successfully.
```

**Output (file missing):**
```
Could not open data.txt
```

Always check `is_open()` before reading.

## Prompting until a file opens

```cpp
#include <fstream>
#include <iostream>
#include <string>

int main() {
    std::string name;
    std::ifstream file;

    while (true) {
        std::cout << "Enter filename: ";
        std::cin >> name;
        file.open(name);
        if (file.is_open()) break;
        std::cout << "  Cannot open \"" << name << "\". Try again.\n";
        file.clear();
    }

    std::cout << "Opened: " << name << "\n";
    file.close();
    return 0;
}
```

**Sample run:**
```
Enter filename: missing.txt
  Cannot open "missing.txt". Try again.
Enter filename: notes.txt
Opened: notes.txt
```

## Reading line by line with `getline`

`operator>>` on strings stops at whitespace. `std::getline` reads an entire line including spaces:

```cpp
#include <fstream>
#include <iostream>
#include <string>

int main() {
    std::ifstream in("poem.txt");
    std::string line;
    int lineNum = 0;
    while (std::getline(in, line)) {
        ++lineNum;
        std::cout << lineNum << ": " << line << "\n";
    }
    return 0;
}
```

If `poem.txt` contains:
```
Roses are red
Violets are blue
```

**Output:**
```
1: Roses are red
2: Violets are blue
```

`getline` returns the stream (which converts to `false` at end-of-file), so using it directly in the `while` condition is the correct loop structure.

### The newline trap

`getline` discards the `\n` it reads. When copying to an output file, put it back:

```cpp
#include <fstream>
#include <string>

int main() {
    std::ifstream input("source.txt");
    std::ofstream output("copy.txt");
    std::string line;
    while (std::getline(input, line)) {
        output << line << "\n";   // restore the newline getline consumed
    }
    return 0;
}
```

### Mixing `>>` and `getline`

`operator>>` leaves a newline in the buffer. If you call `getline` next without draining it, `getline` reads that empty line immediately.

```cpp
#include <iostream>
#include <limits>
#include <string>

int main() {
    int n = 0;
    std::cout << "Enter a number: ";
    std::cin >> n;
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // drain

    std::string sentence;
    std::cout << "Enter a sentence: ";
    std::getline(std::cin, sentence);

    std::cout << "Number: " << n << "\n";
    std::cout << "Sentence: " << sentence << "\n";
    return 0;
}
```

**Sample run:**
```
Enter a number: 5
Enter a sentence: hello world
Number: 5
Sentence: hello world
```

Without the `ignore`, "Enter a sentence:" would be skipped and `sentence` would be empty.

## Reading structured records

```cpp
#include <fstream>
#include <iostream>
#include <string>

struct Employee {
    int   id;
    std::string department;
    float hours;
};

int main() {
    std::ifstream inFile("staff.txt");
    Employee emp;
    int   totalCount = 0;
    float totalHours = 0.0f;

    while (inFile >> emp.id >> emp.department >> emp.hours) {
        if (emp.id == 0) break;           // sentinel
        ++totalCount;
        totalHours += emp.hours;
    }

    if (totalCount > 0) {
        std::cout << totalCount << " employees\n";
        std::cout << "Total hours: " << totalHours << "\n";
        std::cout << "Average: " << totalHours / totalCount << "\n";
    }
    return 0;
}
```

If `staff.txt` contains:
```
101 Engineering 40.0
102 Marketing   37.5
103 Engineering 42.0
0   End         0.0
```

**Output:**
```
3 employees
Total hours: 119.5
Average: 39.8333
```

## Opening for append vs truncate

By default `ofstream` **truncates** (erases) an existing file. To add to the end instead:

```cpp
std::ofstream log("log.txt", std::ios::app);
log << "New entry\n";
```

Each run appends a new line rather than overwriting the file.

---

*The lab has you copy one file to another line by line, handling open failures gracefully. The program reads structured records from a file and computes totals.*
