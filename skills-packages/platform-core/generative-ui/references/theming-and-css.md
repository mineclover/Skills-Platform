# Generative UI Theming & CSS Variable Reference

Semantic tokens injected by the host environment for dynamic dark/light mode compatibility.

## 1. Semantic Token Palette

| Token Variable | Purpose / Usage | Recommended Tailwind Class |
| :--- | :--- | :--- |
| `--background` | Main application background | `bg-[var(--background)]` |
| `--card` | Elevated card container background | `bg-[var(--card)]` |
| `--sidebar` | Sidebar surface background | `bg-[var(--sidebar)]` |
| `--border` | Card & container borders | `border-[var(--border)]` |
| `--foreground` | Primary body text | `text-[var(--foreground)]` |
| `--muted-foreground` | Secondary / muted text | `text-[var(--muted-foreground)]` |
| `--placeholder` | Form placeholder text | `text-[var(--placeholder)]` |
| `--primary` | Main accent / brand color | `bg-[var(--primary)] text-[var(--primary-foreground)]` |
| `--secondary` | Secondary action buttons | `bg-[var(--secondary)] text-[var(--secondary-foreground)]` |
| `--accent` | Highlight accents | `text-[var(--accent)]` |

## 2. Canvas Adaptations

For HTML5 `<canvas>` rendering, detect light mode dynamically:
```javascript
const isLight = document.documentElement.classList.contains('light');
ctx.fillStyle = isLight ? '#0f172a' : '#f8fafc';
```
