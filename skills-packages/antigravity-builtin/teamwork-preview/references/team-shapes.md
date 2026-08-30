# Swarm Team Shapes & Execution Paths

`teamwork_preview` reads the incoming prompt and automatically routes work to one of 5 distinct team topologies.

---

## 👥 Topology Comparison Table

| Team Shape | Workload Match | Selection Mechanism | Agent Composition |
| :--- | :--- | :--- | :--- |
| **Full Team** | Feature builds, system architecture, major migrations | **Default** for all general engineering tasks | Lead Orchestrator + Parallel Explorers + Task Workers + 5-Agent Adversarial Review Panel |
| **Small, Focused Team** | Single localized bugfix, isolated refactor | **Opt-in** (Must specify in prompt opening: *"This is a single self-contained fix; keep it small and focused."*) | Single Implementer + Sequential Adversarial Reviewers |
| **Document Review** | Architectural review, RFC analysis, paper critique | **Automatic** when prompt provides documents to review | Document Analyst + Security Auditor + Synthesis Agent |
| **Proof Pipeline** | Mathematical problem solving, formal logic | **Automatic** for theorem proving | Prover + Step Validator + Counterexample Searcher |
| **Proof, Very Large Team** | Extreme scale search, open conjectures | **Opt-in** (Must specify: *"Use a very large team of agents."*) | 100+ Concurrent Search & Formal Verification Nodes |

---

## 🎯 User Requests for Specific Teams

If the user explicitly requests a specific team:
1. Record it in `Requested team:` in `prompt_draft.md`.
2. State it in the prompt opening in the user's exact words.
3. Inform the user: *"teamwork routes based on the prompt content; your requested team preference has been recorded in the prompt header."*
