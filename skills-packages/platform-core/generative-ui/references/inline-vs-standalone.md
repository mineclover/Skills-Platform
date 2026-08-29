# Inline vs Standalone Placement Guide

Guidance on choosing between inline chat embeds and side-pane artifacts.

## 1. Decision Matrix

| Content Type | Height / Complexity | Recommended Placement | Tag Syntax |
| :--- | :--- | :--- | :--- |
| **Interactive Plot / Metric Chart** | < 400px | **Inline Chat Embed** | `<agent-embed src="file:///..."></agent-embed>` |
| **Compact Control Panel / Toggle** | < 300px | **Inline Chat Embed** | `<agent-embed src="file:///..."></agent-embed>` |
| **Multi-tab Analytics Dashboard** | > 500px | **Standalone Artifact** | Markdown link in response text |
| **Complex App Simulation / Prototype** | Full-screen | **Standalone Artifact** | Markdown link in response text |

## 2. Viewport Constraint Rules

1. **500px Viewport Limit**: Inline frames scroll internally if content exceeds 500px. Always design compact cards.
2. **Never Set Height on `<agent-embed>`**: `<agent-embed height="...">` is ignored by the host.
3. **No 100vh / h-screen**: Viewport sizing causes circular layout dependency and renders widgets as collapsed slivers. Use padding and flex layout instead.
