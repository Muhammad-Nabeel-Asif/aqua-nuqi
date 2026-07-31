# Build Progress Log

> Every phase appends a section here **before** declaring itself complete.
> The next agent reads this file to understand the real state of the codebase.
> Keep it factual and short. Do not delete previous entries.

Template to copy:

```md
## Phase N — <name>
**Date:** YYYY-MM-DD  ·  **Status:** complete / partial

### Built
- …

### Migrations added
- `drizzle/0003_xxx.sql` — tables: …

### IPC channels added
- `customers:list`, `customers:create`, …

### Settings keys added
- …

### Error codes added
- …

### Deviations from the spec
- … (and why)

### What the next phase must know
- …

### Escalations / questions for the human
- …
```

---

<!-- Phase entries go below this line -->
