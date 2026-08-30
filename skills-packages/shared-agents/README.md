# Shared Agents & Orca Runtime Skill Bundle

> **Upstream Origin**: Shared Agent Pool (`~/.agents/skills`) & Orca Desktop Runtime Ecosystem  
> **Maintainer**: Skills Platform / Orca Core Team  
> **License**: MIT / Apache-2.0 / Internal  
> **Package ID**: `shared-agents`  

---

## 📦 Bundle Overview

This bundle provides global runtime capabilities shared across local agents and desktop orchestrators, specifically integrating the **Orca Agent Runtime** and the **Open Agent Skills Package Manager (`skills.sh`)**.

---

## 🛠️ Included Skills Directory

### 1. `find-skills` (Open Agent Skills Package Manager)
- **Role**: Discovers, evaluates, and installs skills from the open ecosystem using the Skills CLI (`npx skills find`, `npx skills add`).
- **Hub**: [skills.sh](https://skills.sh/)
- **Trigger**: "find a skill for X", "how do I do X", "install skill".

### 2. `orca-cli` (Orca Worktree, Terminal & Browser Control)
- **Role**: Primary CLI interface to operate Orca-managed worktrees (`orca worktree`), agent terminals (`orca terminal`), embedded browser automation (`orca goto/snapshot/click`), and mobile simulators (`orca emulator`).
- **Trigger**: "use orca cli", "Orca worktree", "spawn codex/claude in a worktree".

### 3. `orchestration` (Orca Inter-Agent Coordination & Task DAGs)
- **Role**: Structured multi-agent orchestration for persistent thread messaging, task DAG dispatch (`orca orchestration dispatch`), blocking ask/reply loops, and `worker_done` decision gates.
- **Trigger**: "orchestrate agents", "task DAG", "dispatch worker".

### 4. `computer-use` (Desktop OS Accessibility & GUI Automation)
- **Role**: Inspects and controls native desktop applications (Slack, Spotify, Browser, macOS/Windows UI) via Orca's accessibility trees and screenshot actions (`orca computer`).
- **Trigger**: "computer use", "orca computer", "read desktop app".
