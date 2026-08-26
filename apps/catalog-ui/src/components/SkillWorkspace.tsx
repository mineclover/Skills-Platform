import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import type {
  CatalogSkill,
  EvaluationSummary,
  FeedbackSummary,
  InvocationMode,
  SkillFeedback,
  SkillNote,
} from "../types";

export function SkillWorkspace({
  skills,
  selectedLineageId,
  onSelect,
  onSave,
  saving,
  feedback,
  feedbackSummary,
  notes,
  evaluationSummary,
  loadingEvidence,
  recordingFeedback,
  recordingNote,
  onRecordFeedback,
  onAddNote,
}: {
  skills: CatalogSkill[];
  selectedLineageId: string | null;
  onSelect: (lineageId: string) => void;
  onSave: (
    lineageId: string,
    patch: {
      purpose: string | null;
      use_when: string[];
      review_state: "unreviewed" | "reviewed" | "deprecated";
      invocation_mode?: InvocationMode;
    },
  ) => void;
  saving: boolean;
  feedback: SkillFeedback[];
  feedbackSummary: FeedbackSummary | null;
  notes: SkillNote[];
  evaluationSummary: EvaluationSummary | null;
  loadingEvidence: boolean;
  recordingFeedback: boolean;
  recordingNote: boolean;
  onRecordFeedback: (
    lineageId: string,
    patch: { outcome: string; evidence_type: string; summary: string },
  ) => void;
  onAddNote: (
    lineageId: string,
    patch: { kind: string; body: string; inject_into_prompt: boolean },
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = skills.find((skill) => skill.lineage.id === selectedLineageId) ?? skills[0] ?? null;
  const [purpose, setPurpose] = useState("");
  const [useWhen, setUseWhen] = useState("");
  const [reviewState, setReviewState] = useState<"unreviewed" | "reviewed" | "deprecated">("unreviewed");
  const [invocationMode, setInvocationMode] = useState<InvocationMode>("unspecified");
  const [feedbackOutcome, setFeedbackOutcome] = useState("success");
  const [feedbackEvidence, setFeedbackEvidence] = useState("manual");
  const [feedbackText, setFeedbackText] = useState("");
  const [noteKind, setNoteKind] = useState("usage");
  const [noteText, setNoteText] = useState("");
  const [injectNote, setInjectNote] = useState(false);

  useEffect(() => {
    setPurpose(selected?.profile.purpose ?? "");
    setUseWhen(selected?.profile.use_when.join(", ") ?? "");
    setReviewState(selected?.profile.review_state ?? "unreviewed");
    setInvocationMode(selected?.profile.invocation_mode ?? selected?.latest_skill?.invocation_mode ?? "unspecified");
  }, [
    selected?.lineage.id,
    selected?.profile.purpose,
    selected?.profile.review_state,
    selected?.profile.use_when,
    selected?.profile.invocation_mode,
    selected?.latest_skill?.invocation_mode,
  ]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) =>
      [skill.lineage.skill_name, skill.profile.summary, skill.profile.purpose, ...skill.profile.tags]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [query, skills]);

  return (
    <section className="skills-workspace">
      <header className="template-header skills-header">
        <div>
          <h1>Skills</h1>
          <p>
            Manage immutable revisions, intended use, and review state. Templates only compose these
            managed skills.
          </p>
        </div>
        <label className="skill-search">
          <span className="sr-only">Search skills</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills"
          />
        </label>
      </header>
      {skills.length === 0 ? (
        <div className="review-empty">
          <AlertTriangle size={22} className="review-icon" />
          <span>No managed skill is registered yet.</span>
        </div>
      ) : (
        <div className="skills-manager-layout">
          <div className="managed-skill-list" aria-label="Managed skills">
            {visible.map((skill) => (
              <button
                type="button"
                key={skill.lineage.id}
                className={
                  skill.lineage.id === selected?.lineage.id
                    ? "managed-skill selected"
                    : "managed-skill"
                }
                onClick={() => onSelect(skill.lineage.id)}
              >
                <span
                  className={
                    skill.profile.review_state === "reviewed"
                      ? "skill-health reviewed"
                      : "skill-health"
                  }
                />
                <span>
                  <span className="managed-skill-title-row">
                    <strong>{skill.profile.title || skill.lineage.skill_name}</strong>
                    {skill.profile.invocation_mode && skill.profile.invocation_mode !== "unspecified" ? (
                      <span className={`invocation-pill ${skill.profile.invocation_mode === "user_invoked" ? "user" : skill.profile.invocation_mode === "model_invoked" ? "model" : "hybrid"}`}>
                        {skill.profile.invocation_mode === "user_invoked" ? "👤 User" : skill.profile.invocation_mode === "model_invoked" ? "🤖 Model" : "🔀 Hybrid"}
                      </span>
                    ) : null}
                  </span>
                  <small>{skill.latest_skill?.description ?? "No current revision description"}</small>
                </span>
                <em>{skill.profile.review_state.replaceAll("_", " ")}</em>
              </button>
            ))}
          </div>
          {selected ? (
            <div className="skill-detail-panel">
              <form
                className="skill-detail"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSave(selected.lineage.id, {
                    purpose: purpose.trim() || null,
                    use_when: useWhen
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                    review_state: reviewState,
                    invocation_mode: invocationMode,
                  });
                }}
              >
                <div className="skill-detail-heading">
                  <div>
                    <p className="section-label">Immutable skill</p>
                    <div className="skill-heading-row">
                      <h2>{selected.profile.title || selected.lineage.skill_name}</h2>
                      {selected.profile.invocation_mode && selected.profile.invocation_mode !== "unspecified" ? (
                        <span className={`invocation-pill ${selected.profile.invocation_mode === "user_invoked" ? "user" : selected.profile.invocation_mode === "model_invoked" ? "model" : "hybrid"}`}>
                          {selected.profile.invocation_mode === "user_invoked" ? "👤 User-invoked" : selected.profile.invocation_mode === "model_invoked" ? "🤖 Model-invoked (Reflex)" : "🔀 Hybrid"}
                        </span>
                      ) : null}
                    </div>
                    <p>
                      {selected.latest_skill?.description ??
                        "No description is available for the latest revision."}
                    </p>
                  </div>
                  <span className={`review-decision ${reviewState}`}>{reviewState}</span>
                </div>
                <dl className="skill-facts">
                  <div>
                    <dt>Lineage</dt>
                    <dd>{selected.lineage.id}</dd>
                  </div>
                  <div>
                    <dt>Latest revision</dt>
                    <dd>{selected.latest_skill?.source_revision_id.slice(0, 12) ?? "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Invoker</dt>
                    <dd>{selected.profile.invocation_mode?.replaceAll("_", " ") ?? "unspecified"}</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>{selected.profile.risk_level}</dd>
                  </div>
                </dl>
                <label className="template-field">
                  Purpose
                  <textarea
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                    placeholder="What this skill is intended to accomplish"
                  />
                </label>
                <label className="template-field">
                  Use when{" "}
                  <input
                    value={useWhen}
                    onChange={(event) => setUseWhen(event.target.value)}
                    placeholder="Before implementation, during review"
                  />
                  <small>Separate conditions with commas.</small>
                </label>
                <label className="template-field">
                  Invocation mode
                  <select
                    value={invocationMode}
                    onChange={(event) =>
                      setInvocationMode(event.target.value as typeof invocationMode)
                    }
                  >
                    <option value="model_invoked">🤖 Model-invoked (Agent Reflex)</option>
                    <option value="user_invoked">👤 User-invoked (Explicit Command)</option>
                    <option value="hybrid">🔀 Hybrid (Both Model & User)</option>
                    <option value="unspecified">Unspecified</option>
                  </select>
                </label>
                <label className="template-field">
                  Review state
                  <select
                    value={reviewState}
                    onChange={(event) =>
                      setReviewState(event.target.value as typeof reviewState)
                    }
                  >
                    <option value="unreviewed">Unreviewed</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="deprecated">Deprecated</option>
                  </select>
                </label>
                <button className="primary-action skill-save" type="submit" disabled={saving}>
                  {saving ? <LoaderCircle size={20} className="spin" /> : <Check size={20} />}
                  {saving ? "Saving skill…" : "Save skill profile"}
                </button>
              </form>
              <section className="skill-feedback">
                <div className="skill-feedback-heading">
                  <div>
                    <p className="section-label">Feedback health</p>
                    <strong>
                      {loadingEvidence
                        ? "Loading evidence…"
                        : feedbackSummary?.health.replaceAll("_", " ") ?? "Unknown"}
                    </strong>
                    <small>
                      {feedbackSummary
                        ? `${feedbackSummary.total_feedback} records${
                            feedbackSummary.success_rate === null
                              ? ""
                              : ` · ${Math.round(feedbackSummary.success_rate * 100)}% success`
                          }`
                        : "No feedback recorded"}
                    </small>
                  </div>
                  <span className={`review-decision ${feedbackSummary?.health ?? "unknown"}`}>
                    {feedbackSummary?.health ?? "unknown"}
                  </span>
                </div>
                <form
                  className="feedback-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!feedbackText.trim()) return;
                    onRecordFeedback(selected.lineage.id, {
                      outcome: feedbackOutcome,
                      evidence_type: feedbackEvidence,
                      summary: feedbackText.trim(),
                    });
                    setFeedbackText("");
                  }}
                >
                  <label className="template-field">
                    Outcome
                    <select
                      value={feedbackOutcome}
                      onChange={(event) => setFeedbackOutcome(event.target.value)}
                    >
                      <option value="success">Success</option>
                      <option value="correction">Correction</option>
                      <option value="scope_mismatch">Scope mismatch</option>
                      <option value="freshness">Freshness</option>
                      <option value="risk">Risk</option>
                      <option value="neutral">Neutral</option>
                    </select>
                  </label>
                  <label className="template-field">
                    Evidence
                    <select
                      value={feedbackEvidence}
                      onChange={(event) => setFeedbackEvidence(event.target.value)}
                    >
                      <option value="manual">Manual</option>
                      <option value="evaluation">Evaluation</option>
                      <option value="activation_report">Activation report</option>
                      <option value="user_feedback">User feedback</option>
                      <option value="incident">Incident</option>
                    </select>
                  </label>
                  <label className="template-field feedback-summary-field">
                    Summary
                    <input
                      value={feedbackText}
                      onChange={(event) => setFeedbackText(event.target.value)}
                      placeholder="What happened and what should be retained"
                    />
                  </label>
                  <button
                    className="quiet-action feedback-save"
                    type="submit"
                    disabled={recordingFeedback || !feedbackText.trim()}
                  >
                    {recordingFeedback ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Check size={16} />
                    )}
                    {recordingFeedback ? "Recording…" : "Record feedback"}
                  </button>
                </form>
                {feedback.length ? (
                  <div className="feedback-history">
                    {feedback.slice(0, 3).map((item) => (
                      <div key={item.id}>
                        <span>{item.outcome.replaceAll("_", " ")}</span>
                        <p>{item.summary}</p>
                        <small>{item.evidence_type.replaceAll("_", " ")}</small>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
              <section className="skill-evaluation">
                <p className="section-label">Latest revision evaluation</p>
                <strong>
                  {loadingEvidence
                    ? "Loading evaluation…"
                    : evaluationSummary
                      ? `${evaluationSummary.evaluated_active_case_count}/${evaluationSummary.active_case_count} active cases evaluated`
                      : "No evaluation data"}
                </strong>
                <small>
                  {evaluationSummary?.pass_rate === null ||
                  evaluationSummary?.pass_rate === undefined
                    ? "No completed run"
                    : `${Math.round(evaluationSummary.pass_rate * 100)}% pass rate`}{" "}
                  · {evaluationSummary?.latest_outcome ?? "No latest outcome"}
                </small>
              </section>
              <section className="skill-notes">
                <div className="skill-feedback-heading">
                  <div>
                    <p className="section-label">Usage notes</p>
                    <strong>{notes.length} active notes</strong>
                  </div>
                </div>
                <form
                  className="note-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!noteText.trim()) return;
                    onAddNote(selected.lineage.id, {
                      kind: noteKind,
                      body: noteText.trim(),
                      inject_into_prompt: injectNote,
                    });
                    setNoteText("");
                    setInjectNote(false);
                  }}
                >
                  <label className="template-field">
                    Kind
                    <select
                      value={noteKind}
                      onChange={(event) => setNoteKind(event.target.value)}
                    >
                      <option value="usage">Usage</option>
                      <option value="caveat">Caveat</option>
                      <option value="dependency">Dependency</option>
                      <option value="migration">Migration</option>
                      <option value="review">Review</option>
                    </select>
                  </label>
                  <label className="template-field note-body-field">
                    Note
                    <input
                      value={noteText}
                      onChange={(event) => setNoteText(event.target.value)}
                      placeholder="Guidance that should accompany this skill"
                    />
                  </label>
                  <label className="note-inject">
                    <input
                      type="checkbox"
                      checked={injectNote}
                      onChange={(event) => setInjectNote(event.target.checked)}
                    />{" "}
                    Include in system prompt
                  </label>
                  <button
                    className="quiet-action feedback-save"
                    type="submit"
                    disabled={recordingNote || !noteText.trim()}
                  >
                    {recordingNote ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Check size={16} />
                    )}
                    {recordingNote ? "Saving…" : "Add note"}
                  </button>
                </form>
                {notes.length ? (
                  <div className="feedback-history note-history">
                    {notes.slice(0, 3).map((note) => (
                      <div key={note.id}>
                        <span>{note.kind}</span>
                        <p>{note.body}</p>
                        <small>{note.inject_into_prompt ? "Prompt enabled" : "Catalog only"}</small>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
