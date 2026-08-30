# 🧬 Evolution Plane & Stagnation Supervisor

## 1. Evolution Plane State ($X_t$)

The Evolution Plane is activated only when quality optimization is requested beyond minimal contract satisfaction:

$$
X_t = (L,\ H,\ F,\ G,\ Q)
$$

* **`L` Lineage**: DAG of evaluated and promoted candidate versions.
* **`H` Hypothesis**: Explicit optimization hypotheses (e.g. latency, memory, token density).
* **`F` Fitness**: Pareto evaluation score across multi-dimensional metrics.
* **`G` Promotion Gate**: Hard invariant gates that candidates must pass before baseline promotion.
* **`Q` Search Control**: Search budget and exploration bounds.

---

## 2. Pareto Promotion Rule

A candidate $x'$ is promoted to become the new baseline $x^*$ if and only if:

$$
\text{Promote}(x') = \text{Correct}(x') \land \text{ContractSatisfied}(x') \land \text{NoCriticalRegression}(x') \land \text{Better}(x', x^*)
$$

### Tie-Breakers:
1. Smaller diff change scope
2. Lower algorithmic complexity
3. Lower runtime latency / resource cost

---

## 3. Stagnation Detection & Supervisor Intervention

The Stagnation Supervisor intervenes when any of the following triggers fire:
* **Consecutive Non-Promotions**: $\ge 5$ attempts without fitness improvement.
* **Score Plateau**: Metric delta $\Delta F < 0.001$ across sliding window.
* **Repeated Failure Signature**: Same error code or stack trace occurring $\ge 2$ times.
* **Prompt/Context Churn**: Rewriting context without generating novel candidate diffs.
