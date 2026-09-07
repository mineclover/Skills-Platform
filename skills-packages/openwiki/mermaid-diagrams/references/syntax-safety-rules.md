# Mermaid Syntax Safety Rules for OpenWiki

These rules prevent the most common render breakages when embedding diagrams into OpenWiki pages.

---

## 1. General Formatting & Escaping

- **No Semicolons or Pipes**: Never place semicolons (`;`) or pipes (`|`) inside node, message, or edge labels.
- **No Unescaped Angle Brackets**: Never place unescaped angle brackets in labels; write `"returns Promise of User"` instead of `"returns Promise<User>"`.
- **Short Labels**: Keep labels short. Move long explanations into the surrounding prose or caption.

---

## 2. Flowchart Specifics (`flowchart TD` / `flowchart LR`)

- **Double Quotes**: Wrap any label containing parentheses, brackets, colons, or punctuation in double quotes: `A["calls foo(bar)"]`.
- **Reserved Identifier Names**:
  - Never use the bare word `end` as a node ID.
  - Never start a node ID with `o` or `x` followed by a dash (e.g. `o-1`, `x-node` collide with edge marker syntax).

---

## 3. Sequence Diagram Specifics (`sequenceDiagram`)

- **Participant Aliases**: Participant names with spaces or punctuation require an explicit alias:
  ```mermaid
  sequenceDiagram
    participant AS as Auth Service
    participant DB as Database
    AS->>DB: Query User
  ```
- **Reserved Words**: Never use Mermaid reserved words as participant names, aliases, or node IDs:
  `note`, `end`, `loop`, `alt`, `opt`, `par`, `and`, `else`, `activate`, `deactivate`, `class`, `state`, `click`, `link`.
  *Example*: A notification service participant must be `Notifier`, not `Note`.

---

## 4. Entity-Relationship Diagrams (`erDiagram`)

- **Identifier Tokens**: Entity and attribute names must be single identifier-like tokens (`UserAccount`, `created_at`). Put human phrasing in the relationship label.
