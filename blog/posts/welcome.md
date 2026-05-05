# Welcome to Class++ Notes

This section holds short Markdown posts that go alongside in-class activities — solution write-ups, lesson notes, and follow-up explanations.

## Adding a new post

1. Drop a Markdown file into `blog/posts/`, e.g. `blog/posts/loops-recap.md`.
2. Add an entry to `blog/posts/index.json`:
   ```json
   {
     "slug": "loops-recap",
     "title": "A quick recap on loops",
     "date": "2026-05-10",
     "summary": "Why your for-loop printed one extra line."
   }
   ```
3. Commit and push. GitHub Pages will publish it.

## Example: predict the output

```cpp
#include <iostream>
int main() {
    int x = 5;
    std::cout << x++ << " " << ++x << "\n";
}
```

Take a guess before reading on — order of evaluation in `<<` chains is a classic gotcha.
