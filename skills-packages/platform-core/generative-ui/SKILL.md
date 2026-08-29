---
name: generative-ui
description: Render custom, rich, interactive user interfaces and inline HTML widgets directly in the chat or side pane. Use when creating interactive visualizations, custom dashboards, educational widgets, plots, simulations, or prototypes.
---

# Generative UI

Render custom, rich, interactive HTML/Tailwind widgets directly within chat conversations or standalone artifact side panes.

## 🔄 Standard Workflow

1. **Create HTML Artifact**: Write a self-contained `.html` file with Tailwind CSS and inline JavaScript to the artifact directory.
2. **Set Artifact Metadata**: Specify `UserFacing: true` when writing the artifact file.
3. **Embed Inline (Optional)**: If the widget is compact (<500px height), embed it inline in your chat response using `<agent-embed>`:
   ```html
   <agent-embed src="file:///<artifact_path>/widget.html"></agent-embed>
   ```

---

## 🎨 Core Theming & CSP Rules

- **Allowed Tailwind CDN**: Use only the official allowlisted Tailwind script in `<head>`:
  ```html
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  ```
- **Semantic Theme Variables**: Use host variables (`bg-[var(--card)]`, `text-[var(--foreground)]`, `text-[var(--muted-foreground)]`, `border-[var(--border)]`) rather than hardcoded colors (`bg-slate-900`, `text-white`).
- **No Local Fallbacks**: Do not define `:root` fallbacks in `<style>` blocks; host dynamically injects semantic tokens.

---

## 📐 Layout & Viewport Sizing

- **Inline Chat Widgets**:
  - Always set `<body class="bg-transparent ...">` so the widget blends into the chat feed.
  - Wrap content in a card container: `<div class="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 shadow-sm">`.
  - **Height Budget**: Keep widgets strictly under **500px** height.
  - **NO Viewport Units**: Never use `h-screen`, `min-h-screen`, `100vh`, or `height: 100%` on top containers (causes collapse).
- **Standalone Artifacts**: Use `bg-[var(--background)]` for full-height side-pane dashboards.

---

## 📚 References & Examples

- **CSS Variables & Theming**: [references/theming-and-css.md](./references/theming-and-css.md)
- **Inline vs Standalone Placement**: [references/inline-vs-standalone.md](./references/inline-vs-standalone.md)
- **Sample Widget Boilerplate**: [examples/sample-widget.html](./examples/sample-widget.html)
