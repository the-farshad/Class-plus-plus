---
slug: welcome
title: "Welcome to Class++ Notes"
date: "2026-05-04"
summary: "What this section is for and how to add a new post."
tags: ["meta","how-to"]
---
# Welcome to Class++ Notes

This section holds short Markdown posts that go alongside in-class activities — solution write-ups, lesson notes, and follow-up explanations.

## Adding a new post

Posts are **Markdown (`.md`)** with optional **YAML frontmatter** at the top (between `---` lines). The site strips the frontmatter and renders the rest with [GitHub-Flavored Markdown](https://github.github.com/gfm/) (tables, strikethrough, fenced code blocks, etc.).

1. Create `blog/posts/your-slug.md` starting with frontmatter, then the article body:

   ```yaml
   ---
   slug: loops-recap
   title: "A quick recap on loops"
   date: "2026-05-10"
   summary: "Why your for-loop printed one extra line."
   tags: ["loops", "for"]
   ---

   # A quick recap on loops

   Your markdown body starts here…
   ```

   Use `week: 3` only for numbered course week notes. `tags` must be a single-line JSON array.

2. Add a matching entry to `blog/posts/index.json` (used for the notes list, search, and sort):

   ```json
   {
     "slug": "loops-recap",
     "title": "A quick recap on loops",
     "date": "2026-05-10",
     "summary": "Why your for-loop printed one extra line.",
     "tags": ["loops", "for"]
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
