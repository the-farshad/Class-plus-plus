---
slug: week-7-notes
title: "Week 7: Line-oriented files and structured records"
date: "2026-05-17"
summary: "Retry open/copy with getline; read employee structs from a block-formatted binary-style file."
tags: ["fstream","getline","structs","file-io"]
week: 7
---
# Week 7: Line copying and structured file blocks

**Lab 07** exercises **textual** copy: open source/destination with `std::ifstream` / `std::ofstream`, recover from bad paths, and preserve newlines with `getline`. **Program 07** advances to **binary-friendly struct blocks** (`employee` layout in the PDF): read consecutive records, accumulate totals, append a short summary to an output log.

## Concepts

- **RAII with streams**: Construct `ifstream`/`ofstream` with `std::ios::binary` when the spec says so; otherwise default text mode is fine for line copy assignments.
- **Retry pattern**: If either stream fails, `close()` the partial success, `clear()` state flags, and prompt again—don’t leak half-open files.
- **`getline` loop structure**: Prime-read vs. end-of-file testing—follow the lab’s warning about “EOF only after a failed read.”
- **Struct sizing & padding**: Binary layouts depend on alignment; don’t reinterpret random structs as text.

Line-echo pattern with explicit newline restoration:

```cpp
std::string buffer;
while (std::getline(input, buffer)) {
  output << buffer << '\n';
}
```

## Pitfalls checklist

- **Mixing `>>` and `getline`** without consuming the trailing newline—when you later add interactive prompts, flush or ignore appropriately.
- **Wrong `open` mode**: Using truncate when you meant append will erase prior logs—**Program 07** calls for append on the sink file.
- **Off-by-one employees**: Decide whether sentinel `id == 0` marks end-of-batch vs. skipping interior zeros according to instructions.

## Bridge to Lab 07 & Program 07

- **Lab 07**: Evidence of refusal/retry pathways in `Lab07Test.txt`.
- **Program 07**: Accumulate running hours + headcount strictly as defined—then emit the three-line report template.
