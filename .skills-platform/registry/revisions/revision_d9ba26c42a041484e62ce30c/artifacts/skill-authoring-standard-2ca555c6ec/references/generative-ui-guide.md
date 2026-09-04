# Generative UI Design System & Theming Guide

Authoritative guide for building theme-aware HTML widgets and artifacts in Antigravity.

---

## 🎨 1. Theme Variables & Semantic Tokens

Antigravity automatically injects theme variables into the iframe context. Use these CSS variables to guarantee compatibility across light, dark, and custom themes.

| Category | CSS Variable | Tailwind Class | Recommended Usage |
| :--- | :--- | :--- | :--- |
| **Surfaces** | `--background` | `bg-[var(--background)]` | Standalone full-page artifact background |
| | `--card` | `bg-[var(--card)]` | Inline widget cards and elevated containers |
| | `--sidebar` | `bg-[var(--sidebar)]` | Side panels, navigation drawers |
| **Borders** | `--border` | `border-[var(--border)]` | Card borders, dividers, table rows |
| **Text** | `--foreground` | `text-[var(--foreground)]` | Primary headings, main body text |
| | `--muted-foreground` | `text-[var(--muted-foreground)]` | Subtitles, helper text, timestamps |
| | `--placeholder` | `text-[var(--placeholder)]` | Form placeholders, disabled labels |
| **Accents** | `--primary` | `bg-[var(--primary)]` | Primary action buttons, active badges |
| | `--primary-foreground` | `text-[var(--primary-foreground)]` | Text on primary buttons |
| | `--accent` | `bg-[var(--accent)]` | Highlight cards, pills |

---

## 📐 2. Layout & Inline Embed Rules

### `<agent-embed>` Invariants
1. **Root Transparency**:
   Always set `<body class="bg-transparent text-[var(--foreground)] antialiased p-4">`.
2. **Card Container**:
   Wrap contents inside a `<div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 shadow-sm">`.
3. **No Viewport Sizing**:
   - ❌ **NEVER USE**: `h-screen`, `min-h-screen`, `100vh`, or `height: 100%`.
   - ✅ **USE**: Intrinsic height with padding (`p-4`, `p-5`, `space-y-3`).
4. **Height Limit**:
   Keep widgets comfortably below **500px**. If more space is required, keep it as a standalone artifact.

---

## 🧩 3. Standard Boilerplate

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-4">
  <div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-base font-semibold text-[var(--foreground)]">Widget Title</h3>
      <span class="px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-600 font-medium">Status</span>
    </div>
    <p class="text-sm text-[var(--muted-foreground)]">Widget description and content.</p>
  </div>
</body>
</html>
```
