import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  Edit3,
  FileCode,
  FileText,
  Layers,
  LayoutGrid,
  List,
  LoaderCircle,
  MessageSquare,
  Shield,
  Sparkles,
  Tag,
  User,
  Zap,
} from "lucide-react";
import { FilterToolbar, type InvocationFilterMode, type ViewMode } from "./FilterToolbar";
import {
  DeliveryPathIndicator,
  InvocationBadge,
  ProviderBadge,
  getInvocationModeInfo,
  getProviderInfo,
  resolveDeliveryPath,
} from "../visual-identity";
import type {
  CatalogSkill,
  EvaluationSummary,
  FeedbackSummary,
  InvocationMode,
  SkillFeedback,
  SkillNote,
} from "../types";

export function SkillCardGrid({
  skills,
  selectedLineageId,
  onSelect,
  providerId = "antigravity",
}: {
  skills: CatalogSkill[];
  selectedLineageId: string | null;
  onSelect: (lineageId: string) => void;
  providerId?: string;
}) {
  return (
    <div className="skill-card-grid" role="list" aria-label="Skills card grid">
      {skills.map((skill) => {
        const isSelected = skill.lineage.id === selectedLineageId;
        const invMode =
          skill.profile.invocation_mode ??
          skill.latest_skill?.invocation_mode ??
          skill.lineage.invocation_mode ??
          "unspecified";
        const reviewState = skill.profile.review_state ?? "unreviewed";
        const skillName = skill.profile.title || skill.lineage.skill_name;

        return (
          <div
            key={skill.lineage.id}
            className={`skill-card ${isSelected ? "selected" : ""} ${reviewState}`}
            onClick={() => onSelect(skill.lineage.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(skill.lineage.id);
              }
            }}
          >
            <div className="skill-card-header">
              <div className="skill-card-title-group">
                <span className={`skill-status-dot ${reviewState}`} />
                <h3 className="skill-card-title">{skillName}</h3>
              </div>
              <span className={`review-state-pill ${reviewState}`}>
                {reviewState.replaceAll("_", " ")}
              </span>
            </div>

            <p className="skill-card-desc">
              {skill.profile.summary ||
                skill.latest_skill?.description ||
                "No description available for this skill."}
            </p>

            <div className="skill-card-meta">
              <InvocationBadge mode={invMode} showTooltip={true} />
              <ProviderBadge providerId={providerId} showDeliveryPath={false} showTooltip={true} />

              {skill.profile.risk_level ? (
                <span className={`risk-badge risk-${skill.profile.risk_level}`}>
                  Risk: {skill.profile.risk_level}
                </span>
              ) : null}
            </div>

            <div className="skill-card-path-row">
              <span className="path-label">Binding Path:</span>
              <DeliveryPathIndicator
                providerId={providerId}
                skillName={skill.lineage.skill_name}
                showTooltip={true}
              />
            </div>

            {skill.profile.use_when && skill.profile.use_when.length > 0 ? (
              <div className="skill-card-tags">
                {skill.profile.use_when.slice(0, 3).map((tag, idx) => (
                  <span key={idx} className="skill-tag">
                    {tag}
                  </span>
                ))}
                {skill.profile.use_when.length > 3 ? (
                  <span className="skill-tag-more">+{skill.profile.use_when.length - 3}</span>
                ) : null}
              </div>
            ) : null}

            <div className="skill-card-footer">
              <span className="skill-lineage-id">
                {skill.latest_skill?.source_revision_id
                  ? `rev: ${skill.latest_skill.source_revision_id.slice(0, 8)}`
                  : skill.lineage.id}
              </span>
              <button
                type="button"
                className="skill-card-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(skill.lineage.id);
                }}
              >
                {isSelected ? "Editing" : "Configure"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  providerId = "antigravity",
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
  providerId?: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [invocationFilter, setInvocationFilter] = useState<InvocationFilterMode>("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [purpose, setPurpose] = useState("");
  const [useWhen, setUseWhen] = useState("");
  const [reviewState, setReviewState] = useState<"unreviewed" | "reviewed" | "deprecated">(
    "unreviewed",
  );
  const [invocationMode, setInvocationMode] = useState<InvocationMode>("unspecified");
  const [feedbackOutcome, setFeedbackOutcome] = useState("success");
  const [feedbackEvidence, setFeedbackEvidence] = useState("manual");
  const [feedbackText, setFeedbackText] = useState("");
  const [noteKind, setNoteKind] = useState("usage");
  const [noteText, setNoteText] = useState("");
  const [injectNote, setInjectNote] = useState(false);

  // Filter skills
  const visible = useMemo(() => {
    return skills.filter((skill) => {
      // 1. Invocation mode filter
      if (invocationFilter !== "all") {
        const mode =
          skill.profile.invocation_mode ??
          skill.latest_skill?.invocation_mode ??
          skill.lineage.invocation_mode ??
          "unspecified";
        if (mode !== invocationFilter) return false;
      }

      // 2. Provider filter
      if (providerFilter !== "all") {
        const tags = (skill.profile.tags || []).map((t) => t.toLowerCase());
        const desc = (skill.latest_skill?.description || "").toLowerCase();
        const prov = providerFilter.toLowerCase();
        const matchesProvider =
          tags.some((t) => t.includes(prov)) || desc.includes(prov) || skill.lineage.id.includes(prov);
        if (!matchesProvider) return false;
      }

      // 3. Keyword / tag search
      const needle = searchQuery.trim().toLowerCase();
      if (!needle) return true;

      const searchable = [
        skill.lineage.skill_name,
        skill.profile.title,
        skill.profile.summary,
        skill.profile.purpose,
        skill.latest_skill?.description,
        resolveDeliveryPath(providerId, skill.lineage.skill_name),
        ...(skill.profile.tags || []),
        ...(skill.profile.use_when || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(needle);
    });
  }, [skills, invocationFilter, providerFilter, searchQuery, providerId]);

  const selected =
    visible.find((skill) => skill.lineage.id === selectedLineageId) ??
    skills.find((skill) => skill.lineage.id === selectedLineageId) ??
    visible[0] ??
    skills[0] ??
    null;

  useEffect(() => {
    setPurpose(selected?.profile.purpose ?? "");
    setUseWhen(selected?.profile.use_when.join(", ") ?? "");
    setReviewState(selected?.profile.review_state ?? "unreviewed");
    setInvocationMode(
      selected?.profile.invocation_mode ??
        selected?.latest_skill?.invocation_mode ??
        selected?.lineage.invocation_mode ??
        "unspecified",
    );
  }, [
    selected?.lineage.id,
    selected?.profile.purpose,
    selected?.profile.review_state,
    selected?.profile.use_when,
    selected?.profile.invocation_mode,
    selected?.latest_skill?.invocation_mode,
    selected?.lineage.invocation_mode,
  ]);

  const renderDetailPanel = () => {
    if (!selected) return null;
    return (
      <div className="skill-detail-panel">
        <form
          className="skill-detail inline-profile-form"
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
                <InvocationBadge mode={selected.profile.invocation_mode} showTooltip={true} />
                <ProviderBadge providerId={providerId} showDeliveryPath={false} showTooltip={true} />
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
              <dd>{invocationMode.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Risk</dt>
              <dd>{selected.profile.risk_level || "low"}</dd>
            </div>
            <div className="skill-fact-full">
              <dt>Active Delivery Binding</dt>
              <dd>
                <DeliveryPathIndicator
                  providerId={providerId}
                  skillName={selected.lineage.skill_name}
                  showTooltip={true}
                />
              </dd>
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
            Use when
            <input
              value={useWhen}
              onChange={(event) => setUseWhen(event.target.value)}
              placeholder="Before implementation, during review"
            />
            <small>Separate conditions with commas.</small>
          </label>

          <div className="form-row-dual">
            <label className="template-field">
              Invocation mode
              <select
                value={invocationMode}
                onChange={(event) => setInvocationMode(event.target.value as typeof invocationMode)}
              >
                <option value="model_invoked">🤖 Model-invoked (Agent Reflex - Autonomous)</option>
                <option value="user_invoked">👤 User-invoked (Explicit Command - Human Steered)</option>
                <option value="hybrid">🔀 Hybrid (Both Model Reflex & User Command)</option>
                <option value="unspecified">⚙️ Unspecified (Legacy Classification)</option>
              </select>
            </label>

            <label className="template-field">
              Review state
              <select
                value={reviewState}
                onChange={(event) => setReviewState(event.target.value as typeof reviewState)}
              >
                <option value="unreviewed">Unreviewed</option>
                <option value="reviewed">Reviewed</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </label>
          </div>

          <button className="primary-action skill-save" type="submit" disabled={saving}>
            {saving ? <LoaderCircle size={20} className="spin" /> : <Check size={20} />}
            {saving ? "Saving skill…" : "Save skill profile"}
          </button>
        </form>

        {/* Feedback Health History */}
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

        {/* Evaluation Stats */}
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
            {evaluationSummary?.pass_rate === null || evaluationSummary?.pass_rate === undefined
              ? "No completed run"
              : `${Math.round(evaluationSummary.pass_rate * 100)}% pass rate`}{" "}
            · {evaluationSummary?.latest_outcome ?? "No latest outcome"}
          </small>
        </section>

        {/* Usage Notes with Prompt Injection Toggles */}
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
              <select value={noteKind} onChange={(event) => setNoteKind(event.target.value)}>
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
              {recordingNote ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
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
    );
  };

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
        <div className="skills-header-badges">
          <ProviderBadge providerId={providerId} showDeliveryPath={true} showTooltip={true} />
        </div>
      </header>

      {/* Modern FilterToolbar */}
      <FilterToolbar
        invocationMode={invocationFilter}
        onInvocationModeChange={setInvocationFilter}
        providerFilter={providerFilter}
        onProviderFilterChange={setProviderFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalCount={skills.length}
        filteredCount={visible.length}
        entityName="skills"
        showInvocationChips={true}
        showProviderFilter={true}
        showViewToggle={true}
        searchPlaceholder="Search skills by name, tags, description, or delivery path..."
      />

      {skills.length === 0 ? (
        <div className="review-empty">
          <AlertTriangle size={22} className="review-icon" />
          <span>No managed skill is registered yet.</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="review-empty">
          <AlertTriangle size={22} className="review-icon" />
          <span>No skills match the selected filters. Try clearing search or filter chips.</span>
        </div>
      ) : viewMode === "grid" ? (
        <div className="skills-grid-view-layout">
          <SkillCardGrid
            skills={visible}
            selectedLineageId={selected?.lineage.id ?? null}
            onSelect={onSelect}
            providerId={providerId}
          />
          {selected ? (
            <div className="skill-grid-detail-container">
              <div className="grid-detail-header">
                <Edit3 size={18} className="mint" />
                <h3>Configuring Skill: {selected.profile.title || selected.lineage.skill_name}</h3>
              </div>
              {renderDetailPanel()}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="skills-manager-layout">
          <div className="managed-skill-list" aria-label="Managed skills">
            {visible.map((skill) => {
              const mode =
                skill.profile.invocation_mode ??
                skill.latest_skill?.invocation_mode ??
                skill.lineage.invocation_mode;
              return (
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
                      <InvocationBadge mode={mode} showTooltip={true} size="sm" />
                    </span>
                    <small>
                      {skill.latest_skill?.description ?? "No current revision description"}
                    </small>
                  </span>
                  <em>{skill.profile.review_state.replaceAll("_", " ")}</em>
                </button>
              );
            })}
          </div>
          {renderDetailPanel()}
        </div>
      )}
    </section>
  );
}
