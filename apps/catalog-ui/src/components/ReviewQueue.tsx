import { AlertTriangle, CircleCheck, ChevronDown, Database } from "lucide-react";
import type { ReviewItem, SourceAdoptionCandidate } from "../types";

export const demoReviewQueue: ReviewItem[] = [
  {
    lineage: { id: "lineage_testing", skill_name: "Testing" },
    severity: "medium",
    latest_source_revision_id: "revision_demo",
    reasons: [
      {
        code: "unevaluated_current_revision",
        severity: "medium",
        detail: "The latest source revision has no recorded active-case evaluation.",
      },
    ],
  },
  {
    lineage: { id: "lineage_ui", skill_name: "UI Design" },
    severity: "low",
    latest_source_revision_id: "revision_demo",
    reasons: [
      {
        code: "unreviewed_profile",
        severity: "medium",
        detail: "The skill profile has not been reviewed.",
      },
    ],
  },
];

export function ReviewQueue({ items, remote }: { items: ReviewItem[]; remote: boolean }) {
  const queue = remote ? items : demoReviewQueue;
  return (
    <section className="review-queue" aria-labelledby="review-queue-title">
      <div className="review-title">
        <div>
          <h2 id="review-queue-title">Review queue</h2>
          <p>Evidence that needs a human decision. No policy is changed automatically.</p>
        </div>
        <span>{queue.length} open</span>
      </div>
      {queue.length === 0 ? (
        <div className="review-empty">
          <CircleCheck size={22} className="mint" />
          <span>No current review signals.</span>
        </div>
      ) : (
        <div className="review-list">
          {queue.map((item) => (
            <article className="review-row" key={item.lineage.id}>
              <AlertTriangle size={21} className={`review-icon ${item.severity}`} />
              <div className="review-skill">
                <strong>{item.lineage.skill_name}</strong>
                <small>
                  {item.latest_source_revision_id
                    ? `Pinned revision · ${item.latest_source_revision_id.slice(0, 12)}`
                    : "No source revision recorded"}
                </small>
              </div>
              <div className="review-reasons">
                {item.reasons.map((reason) => (
                  <span key={reason.code} title={reason.detail}>
                    {reason.code.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
              <span className={`severity ${item.severity}`}>{item.severity}</span>
              <ChevronDown size={20} className="row-chevron" aria-hidden="true" />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function SourceChangeQueue({
  candidates,
  summaries,
  actionId,
  onSummaryChange,
  onReview,
  onAdopt,
}: {
  candidates: SourceAdoptionCandidate[];
  summaries: Record<string, string>;
  actionId: string | null;
  onSummaryChange: (sourceRevisionId: string, summary: string) => void;
  onReview: (candidate: SourceAdoptionCandidate, decision: "approved" | "rejected") => void;
  onAdopt: (candidate: SourceAdoptionCandidate, presetId: string) => void;
}) {
  return (
    <section className="source-changes" aria-labelledby="source-changes-title">
      <div className="review-title">
        <div>
          <h2 id="source-changes-title">Source change decisions</h2>
          <p>
            Imported revisions stay isolated until reviewed, then create a new template version only
            when adopted.
          </p>
        </div>
        <span>
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        </span>
      </div>
      {candidates.length === 0 ? (
        <div className="review-empty">
          <CircleCheck size={22} className="mint" />
          <span>No imported revision is waiting to replace a pinned template skill.</span>
        </div>
      ) : (
        <div className="source-change-list">
          {candidates.map((candidate) => {
            const busy =
              actionId === candidate.source_revision_id ||
              actionId?.startsWith(`${candidate.registry_skill_id}:`) === true;
            const approved = candidate.review?.decision === "approved";
            return (
              <article className="source-change" key={candidate.registry_skill_id}>
                <div className="source-change-heading">
                  <Database size={21} className="mint" />
                  <div>
                    <strong>{candidate.skill_name}</strong>
                    <small>
                      Candidate {candidate.source_revision_id.slice(0, 12)} · imported{" "}
                      {new Date(candidate.imported_at).toLocaleDateString()}
                    </small>
                  </div>
                  <span
                    className={
                      candidate.review
                        ? `review-decision ${candidate.review.decision}`
                        : "review-decision pending"
                    }
                  >
                    {candidate.review?.decision ?? "needs review"}
                  </span>
                </div>
                {candidate.review ? (
                  <p className="review-summary">{candidate.review.summary}</p>
                ) : (
                  <label className="review-summary-input">
                    <span>Decision note</span>
                    <input
                      value={summaries[candidate.source_revision_id] ?? ""}
                      onChange={(event) =>
                        onSummaryChange(candidate.source_revision_id, event.target.value)
                      }
                      placeholder="What changed and why this decision is safe"
                    />
                  </label>
                )}
                {!candidate.review ? (
                  <div className="source-actions">
                    <button
                      className="source-button approve"
                      type="button"
                      disabled={busy}
                      onClick={() => onReview(candidate, "approved")}
                    >
                      {busy ? "Saving…" : "Approve revision"}
                    </button>
                    <button
                      className="source-button reject"
                      type="button"
                      disabled={busy}
                      onClick={() => onReview(candidate, "rejected")}
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
                <div className="compatible-presets">
                  <span>Can replace</span>
                  {candidate.compatible_presets.map((preset) => (
                    <div key={preset.id} className="compatible-preset">
                      <div>
                        <strong>{preset.name}</strong>
                        <small>
                          Current template v{preset.selected_version} · pinned revision{" "}
                          {preset.current_source_revision_id.slice(0, 10)}
                        </small>
                      </div>
                      {approved ? (
                        <button
                          className="adopt-button"
                          type="button"
                          disabled={busy}
                          onClick={() => onAdopt(candidate, preset.id)}
                        >
                          {busy ? "Adopting…" : "Adopt as new version"}
                        </button>
                      ) : (
                        <small className="adopt-hint">Approve before adoption</small>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
