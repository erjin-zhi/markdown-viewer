# Project quickstart

A clear guide to fetching documents, reviewing changes, and keeping your work organized.

```javascript
const response = await fetch("/api/documents/42");
const document = await response.json();
console.log(document.title, document.updatedAt);
```

| Field | Type | Description |
| --- | --- | --- |
| `title` | string | A readable document name |
| `body` | string | Content in Markdown format |
| `updatedAt` | string | Last update in ISO 8601 format |

## API reference

Use the document ID to request the latest version from your API.

## Review your changes

Make a small edit, compare it with the original, and save the version you want to keep.

## Before you publish

- [x] Check headings and code examples
- [x] Verify links and table values
- [ ] Save a copy for the team

## Keep a local copy

Store the final Markdown alongside your project so it is easy to find and update later.
