import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, RefreshCcw, X } from "lucide-react";
import { catalogApi, copyText, readApplyStream } from "./api/catalog-api";
import { LiveActivationStatus } from "./components/LiveActivationStatus";
import {
  PlanHistory,
  SkillTable,
  TemplateInspector,
} from "./components/ProjectWorkspace";
import { ReviewQueue, SourceChangeQueue } from "./components/ReviewQueue";
import { SideNavigation } from "./components/SideNavigation";
import { SkillWorkspace } from "./components/SkillWorkspace";
import { TemplateWorkspace } from "./components/TemplateWorkspace";
import type {
  ApplyProgress,
  CatalogSkill,
  DisplaySkill,
  EvaluationSummary,
  FeedbackSummary,
  InvocationMode,
  RegistrySkill,
  RemoteAssignment,
  RemoteComparison,
  RemoteHistory,
  RemotePreset,
  RemoteProject,
  RemoteSet,
  ReviewItem,
  Scope,
  SkillFeedback,
  SkillNote,
  SkillRow,
  SourceAdoptionCandidate,
  UpstreamStatus,
} from "./types";

const skillRows: SkillRow[] = [
  {
    name: "Planning",
    source: "Build v2",
    defaultEnabled: true,
    defaultReason: "Default inclusion in Build v2",
  },
  {
    name: "Testing",
    source: "Verification v1",
    defaultEnabled: false,
    overlayEnabled: true,
    defaultReason: "Not included by Build v2",
    overlayReason: "Verification overlay includes Testing",
  },
  {
    name: "UI Design",
    source: "Build v2",
    defaultEnabled: false,
    defaultReason: "Not included by Build v2",
  },
];

function statusFor(row: SkillRow, scope: Scope, pristine: boolean) {
  if (pristine) {
    return {
      enabled: false,
      reason: "Pristine baseline disables managed skills",
      source: "Pristine",
    };
  }
  const overlayActive = scope === "implementation" && row.overlayEnabled === true;
  if (overlayActive) {
    return { enabled: true, reason: row.overlayReason!, source: "Verification v1" };
  }
  return { enabled: row.defaultEnabled, reason: row.defaultReason, source: row.source };
}

function sampleSkills(scope: Scope, pristine: boolean): DisplaySkill[] {
  return skillRows.map((row) => {
    const status = statusFor(row, scope, pristine);
    return {
      name: row.name,
      source: status.source,
      enabled: status.enabled,
      reason: status.reason,
    };
  });
}

function presetName(
  assignments: Array<{ role: string; name?: string }>,
  role: string,
  fallback: string,
) {
  return assignments.find((assignment) => assignment.role === role)?.name ?? fallback;
}

export function CatalogApp() {
  const [scope, setScope] = useState<Scope>("implementation");
  const [pristine, setPristine] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [copyingPrompt, setCopyingPrompt] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remoteSet, setRemoteSet] = useState<RemoteSet | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [presets, setPresets] = useState<RemotePreset[]>([]);
  const [registrySkills, setRegistrySkills] = useState<RegistrySkill[]>([]);
  const [catalogSkills, setCatalogSkills] = useState<CatalogSkill[]>([]);
  const [selectedSkillLineageId, setSelectedSkillLineageId] = useState<string | null>(null);
  const [savingSkillProfile, setSavingSkillProfile] = useState(false);
  const [skillFeedback, setSkillFeedback] = useState<SkillFeedback[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummary | null>(null);
  const [skillNotes, setSkillNotes] = useState<SkillNote[]>([]);
  const [evaluationSummary, setEvaluationSummary] = useState<EvaluationSummary | null>(null);
  const [loadingSkillEvidence, setLoadingSkillEvidence] = useState(false);
  const [recordingFeedback, setRecordingFeedback] = useState(false);
  const [recordingNote, setRecordingNote] = useState(false);
  const [projectAssignments, setProjectAssignments] = useState<RemoteAssignment[]>([]);
  const [history, setHistory] = useState<RemoteHistory | null>(null);
  const [comparison, setComparison] = useState<RemoteComparison | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [sourceCandidates, setSourceCandidates] = useState<SourceAdoptionCandidate[]>([]);
  const [sourceReviewSummaries, setSourceReviewSummaries] = useState<Record<string, string>>({});
  const [sourceActionId, setSourceActionId] = useState<string | null>(null);
  const [updatingDefault, setUpdatingDefault] = useState(false);
  const [updatingOverlay, setUpdatingOverlay] = useState(false);
  const [policyVersion, setPolicyVersion] = useState(0);
  const [activePage, setActivePage] = useState("Projects");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<UpstreamStatus | null>(null);
  const [projectStatus, setProjectStatus] = useState<UpstreamStatus | null>(null);
  const [loadingLiveStatus, setLoadingLiveStatus] = useState(false);
  const [liveStatusError, setLiveStatusError] = useState<string | null>(null);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [applyProgress, setApplyProgress] = useState<ApplyProgress | null>(null);

  const refreshSourceCandidates = useCallback(() => {
    if (!catalogApi) return Promise.resolve();
    return fetch(`${catalogApi}/api/source-adoption-candidates`)
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Could not load imported source changes")),
      )
      .then((body: { candidates: SourceAdoptionCandidate[] }) =>
        setSourceCandidates(body.candidates),
      );
  }, []);

  useEffect(() => {
    if (!catalogApi) return;
    let active = true;
    fetch(`${catalogApi}/api/projects`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("Catalog bridge is unavailable")),
      )
      .then((body: { projects: RemoteProject[] }) => {
        if (!active) return;
        setProjects(body.projects);
        setSelectedProjectId(body.projects[0]?.id ?? null);
        setRemoteError(body.projects.length === 0 ? "No catalog projects are registered." : null);
      })
      .catch((error: Error) => active && setRemoteError(error.message));
    return () => {
      active = false;
    };
  }, []);

  const refreshCatalogSkills = useCallback(() => {
    if (!catalogApi) return Promise.resolve();
    return fetch(`${catalogApi}/api/skills`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("Could not load managed skills")),
      )
      .then((body: { skills: CatalogSkill[] }) => setCatalogSkills(body.skills));
  }, []);

  useEffect(() => {
    void refreshCatalogSkills().catch(() => setCatalogSkills([]));
  }, [refreshCatalogSkills]);

  useEffect(() => {
    if (selectedSkillLineageId || catalogSkills.length === 0) return;
    setSelectedSkillLineageId(catalogSkills[0].lineage.id);
  }, [catalogSkills, selectedSkillLineageId]);

  const refreshSkillEvidence = useCallback(() => {
    if (!catalogApi || !selectedSkillLineageId) {
      setSkillFeedback([]);
      setFeedbackSummary(null);
      setSkillNotes([]);
      setEvaluationSummary(null);
      return Promise.resolve();
    }
    const sourceRevisionId = catalogSkills.find(
      (skill) => skill.lineage.id === selectedSkillLineageId,
    )?.latest_skill?.source_revision_id;
    setLoadingSkillEvidence(true);
    return Promise.all([
      fetch(`${catalogApi}/api/skills/${encodeURIComponent(selectedSkillLineageId)}/feedback`).then(
        (response) =>
          response.ok ? response.json() : Promise.reject(new Error("Could not load skill feedback")),
      ),
      fetch(
        `${catalogApi}/api/skills/${encodeURIComponent(selectedSkillLineageId)}/feedback-summary`,
      ).then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("Could not load skill health")),
      ),
      fetch(`${catalogApi}/api/skills/${encodeURIComponent(selectedSkillLineageId)}/notes`).then(
        (response) =>
          response.ok ? response.json() : Promise.reject(new Error("Could not load skill notes")),
      ),
      fetch(
        `${catalogApi}/api/skills/${encodeURIComponent(selectedSkillLineageId)}/evaluation-summary${
          sourceRevisionId ? `?source_revision_id=${encodeURIComponent(sourceRevisionId)}` : ""
        }`,
      ).then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Could not load skill evaluation")),
      ),
    ])
      .then(
        ([feedbackBody, summaryBody, notesBody, evaluationBody]: [
          { feedback: SkillFeedback[] },
          FeedbackSummary,
          { notes: SkillNote[] },
          EvaluationSummary,
        ]) => {
          setSkillFeedback(feedbackBody.feedback);
          setFeedbackSummary(summaryBody);
          setSkillNotes(notesBody.notes);
          setEvaluationSummary(evaluationBody);
        },
      )
      .catch(() => {
        setSkillFeedback([]);
        setFeedbackSummary(null);
        setSkillNotes([]);
        setEvaluationSummary(null);
      })
      .finally(() => setLoadingSkillEvidence(false));
  }, [catalogSkills, selectedSkillLineageId]);

  useEffect(() => {
    void refreshSkillEvidence();
  }, [refreshSkillEvidence]);

  useEffect(() => {
    if (!catalogApi) return;
    let active = true;
    fetch(`${catalogApi}/api/presets`)
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Could not load catalog templates")),
      )
      .then((body: { presets: RemotePreset[] }) => active && setPresets(body.presets))
      .catch(() => active && setPresets([]));
    return () => {
      active = false;
    };
  }, [policyVersion]);

  useEffect(() => {
    if (!catalogApi) return;
    let active = true;
    fetch(`${catalogApi}/api/registry/skills`)
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Could not load registry skills")),
      )
      .then((body: { skills: RegistrySkill[] }) => active && setRegistrySkills(body.skills))
      .catch(() => active && setRegistrySkills([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedTemplateId || presets.length === 0) return;
    setSelectedTemplateId(
      presets.find((preset) => preset.id !== "builtin-pristine")?.id ?? presets[0].id,
    );
  }, [presets, selectedTemplateId]);

  useEffect(() => {
    if (!catalogApi || !selectedProjectId) return;
    let active = true;
    fetch(
      `${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/preset-assignments`,
    )
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Could not load project template assignments")),
      )
      .then(
        (body: { assignments: RemoteAssignment[] }) => active && setProjectAssignments(body.assignments),
      )
      .catch(() => active && setProjectAssignments([]));
    return () => {
      active = false;
    };
  }, [policyVersion, selectedProjectId]);

  useEffect(() => {
    refreshSourceCandidates().catch(() => setSourceCandidates([]));
  }, [refreshSourceCandidates]);

  useEffect(() => {
    if (!catalogApi) return;
    let active = true;
    fetch(`${catalogApi}/api/review-queue`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("Could not load review queue")),
      )
      .then((body: { items: ReviewItem[] }) => active && setReviewItems(body.items))
      .catch(() => active && setReviewItems([]));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!catalogApi || !selectedProjectId) return;
    let active = true;
    const params = new URLSearchParams({ work_scope: scope });
    if (pristine) params.set("preset", "builtin-pristine");
    fetch(
      `${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/effective-set?${params}`,
    )
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Could not resolve the selected project")),
      )
      .then((body: RemoteSet) => {
        if (active) {
          setRemoteSet(body);
          setRemoteError(null);
        }
      })
      .catch((error: Error) => active && setRemoteError(error.message));
    return () => {
      active = false;
    };
  }, [scope, pristine, selectedProjectId, policyVersion]);

  useEffect(() => {
    if (!catalogApi || !selectedProjectId) return;
    let active = true;
    fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/history`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("Could not load project history")),
      )
      .then((body: { history: RemoteHistory[] }) => active && setHistory(body.history[0] ?? null))
      .catch(() => active && setHistory(null));
    return () => {
      active = false;
    };
  }, [selectedProjectId, notice]);

  useEffect(() => {
    if (!catalogApi || !history?.plan_id) {
      setComparison(null);
      return;
    }
    let active = true;
    fetch(
      `${catalogApi}/api/activation-plans/${encodeURIComponent(
        history.plan_id,
      )}/observed-state-comparison`,
    )
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("No observed state is available")),
      )
      .then((body: RemoteComparison) => active && setComparison(body))
      .catch(() => active && setComparison(null));
    return () => {
      active = false;
    };
  }, [history?.plan_id]);

  const refreshLiveStatus = useCallback(() => {
    if (!catalogApi) {
      setGlobalStatus(null);
      setProjectStatus(null);
      setLiveStatusError(null);
      return Promise.resolve();
    }
    setLoadingLiveStatus(true);
    setLiveStatusError(null);
    const global = fetch(`${catalogApi}/api/upstream-status`).then((response) =>
      response.ok
        ? response.json()
        : Promise.reject(new Error("Could not inspect global Skills Manager activation")),
    );
    const project = selectedProjectId
      ? fetch(
          `${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/upstream-status`,
        ).then((response) =>
          response.ok
            ? response.json()
            : Promise.reject(new Error("Could not inspect this project in Skills Manager")),
        )
      : Promise.resolve(null);
    return Promise.all([global, project])
      .then(
        ([globalBody, projectBody]: [
          { status: UpstreamStatus },
          { status: UpstreamStatus } | null,
        ]) => {
          setGlobalStatus(globalBody.status);
          setProjectStatus(projectBody?.status ?? null);
        },
      )
      .catch((error: Error) => setLiveStatusError(error.message))
      .finally(() => setLoadingLiveStatus(false));
  }, [selectedProjectId]);

  useEffect(() => {
    void refreshLiveStatus();
  }, [refreshLiveStatus]);

  const skills = useMemo<DisplaySkill[]>(
    () =>
      remoteSet
        ? remoteSet.skills.map((skill) => {
            const assignment = remoteSet.assignments.find(
              (item) => item.preset_id === skill.selected_by?.preset_id,
            );
            return {
              name: skill.skill_name,
              source: assignment?.name ?? (pristine ? "Pristine" : "Catalog"),
              enabled: skill.desired_state === "enabled",
              reason: skill.reason.replaceAll("_", " "),
              artifact_type: skill.artifact_type,
              invocation_mode: skill.invocation_mode,
            };
          })
        : sampleSkills(scope, pristine),
    [remoteSet, scope, pristine],
  );

  const enabledCount = useMemo(() => skills.filter((skill) => skill.enabled).length, [skills]);
  const defaultTemplate = remoteSet
    ? presetName(remoteSet.assignments, "default", "Pristine")
    : "Build v2";
  const defaultPresetId =
    remoteSet?.assignments.find((assignment) => assignment.role === "default")?.preset_id ?? null;
  const overlayTemplate = remoteSet
    ? presetName(remoteSet.assignments, "work_scope_overlay", "None")
    : "Verification v1";
  const configuredOverlay =
    projectAssignments.find(
      (assignment) =>
        assignment.role === "work_scope_overlay" &&
        assignment.enabled &&
        assignment.work_scope_tags.length === 1 &&
        assignment.work_scope_tags[0] === scope,
    ) ?? null;
  const overlayPresetId = configuredOverlay?.preset_id ?? null;
  const overlayActive = remoteSet ? overlayTemplate !== "None" : scope === "implementation";

  const togglePristine = useCallback(() => {
    setPristine((current) => !current);
    setNotice(null);
  }, []);

  const updateDefaultTemplate = useCallback(
    (presetId: string) => {
      if (!catalogApi || !selectedProjectId || !presetId) return;
      setUpdatingDefault(true);
      setNotice(null);
      fetch(
        `${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/default-preset`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ preset_id: presetId }),
        },
      )
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error("Project default template was rejected")),
        )
        .then(() => {
          setPristine(false);
          setPolicyVersion((current) => current + 1);
          const preset = presets.find((item) => item.id === presetId);
          setNotice(`${preset?.name ?? presetId} is now pinned as this project's default template.`);
        })
        .catch((error: Error) => setNotice(error.message))
        .finally(() => setUpdatingDefault(false));
    },
    [presets, selectedProjectId],
  );

  const updateWorkScopeOverlay = useCallback(
    (presetId: string) => {
      if (!catalogApi || !selectedProjectId) return;
      setUpdatingOverlay(true);
      setNotice(null);
      fetch(
        `${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/work-scope-overlay`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ preset_id: presetId || null, work_scope_tags: [scope] }),
        },
      )
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error("Work-scope overlay was rejected")),
        )
        .then(() => {
          setPolicyVersion((current) => current + 1);
          const preset = presets.find((item) => item.id === presetId);
          setNotice(
            preset
              ? `${preset.name} now applies during ${scope}.`
              : `No template applies during ${scope}.`,
          );
        })
        .catch((error: Error) => setNotice(error.message))
        .finally(() => setUpdatingOverlay(false));
    },
    [presets, scope, selectedProjectId],
  );

  const saveTemplateMembership = useCallback(
    (presetId: string, registrySkillIds: string[]) => {
      if (!catalogApi) return;
      setSavingTemplate(true);
      fetch(`${catalogApi}/api/presets/${encodeURIComponent(presetId)}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registry_skill_ids: registrySkillIds }),
      })
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error("Template membership was rejected")),
        )
        .then((body: { preset: RemotePreset }) => {
          setPresets((current) =>
            current.map((preset) => (preset.id === body.preset.id ? body.preset : preset)),
          );
          setSelectedTemplateId(body.preset.id);
          setNotice(
            `${body.preset.name} v${body.preset.selected_version} saved. Existing project pins were preserved.`,
          );
        })
        .catch((error: Error) => setNotice(error.message))
        .finally(() => setSavingTemplate(false));
    },
    [],
  );

  const createTemplate = useCallback(
    (id: string, name: string, registrySkillIds: string[]) => {
      if (!catalogApi) return Promise.resolve(false);
      setSavingTemplate(true);
      return fetch(`${catalogApi}/api/presets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name, registry_skill_ids: registrySkillIds }),
      })
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error("Template creation was rejected")),
        )
        .then((body: { preset: RemotePreset }) => {
          setPresets((current) => [...current, body.preset]);
          setSelectedTemplateId(body.preset.id);
          setNotice(`${body.preset.name} v1 created.`);
          return true;
        })
        .catch((error: Error) => {
          setNotice(error.message);
          return false;
        })
        .finally(() => setSavingTemplate(false));
    },
    [],
  );

  const saveSkillProfile = useCallback(
    (
      lineageId: string,
      patch: {
        purpose: string | null;
        use_when: string[];
        review_state: "unreviewed" | "reviewed" | "deprecated";
        invocation_mode?: InvocationMode;
      },
    ) => {
      if (!catalogApi) return;
      setSavingSkillProfile(true);
      setNotice(null);
      fetch(`${catalogApi}/api/skills/${encodeURIComponent(lineageId)}/profile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      })
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error("Skill profile was rejected")),
        )
        .then(() => refreshCatalogSkills())
        .then(() =>
          setNotice(
            "Skill profile saved. Template membership and provider delivery were not changed.",
          ),
        )
        .catch((error: Error) => setNotice(error.message))
        .finally(() => setSavingSkillProfile(false));
    },
    [refreshCatalogSkills],
  );

  const recordSkillFeedback = useCallback(
    (
      lineageId: string,
      patch: { outcome: string; evidence_type: string; summary: string },
    ) => {
      if (!catalogApi) return;
      setRecordingFeedback(true);
      fetch(`${catalogApi}/api/skills/${encodeURIComponent(lineageId)}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "global", ...patch }),
      })
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error("Feedback was rejected")),
        )
        .then(() => refreshSkillEvidence())
        .then(() =>
          setNotice(
            "Feedback recorded for this skill. Templates and provider bindings were not changed.",
          ),
        )
        .catch((error: Error) => setNotice(error.message))
        .finally(() => setRecordingFeedback(false));
    },
    [refreshSkillEvidence],
  );

  const addSkillUsageNote = useCallback(
    (
      lineageId: string,
      patch: { kind: string; body: string; inject_into_prompt: boolean },
    ) => {
      if (!catalogApi) return;
      setRecordingNote(true);
      fetch(`${catalogApi}/api/skills/${encodeURIComponent(lineageId)}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "global", ...patch }),
      })
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error("Skill note was rejected")),
        )
        .then(() => refreshSkillEvidence())
        .then(() =>
          setNotice(
            "Skill note saved. It is injected only when explicitly marked for prompts.",
          ),
        )
        .catch((error: Error) => setNotice(error.message))
        .finally(() => setRecordingNote(false));
    },
    [refreshSkillEvidence],
  );

  const previewPlan = useCallback(() => {
    setPreviewing(true);
    setNotice(null);
    if (catalogApi && selectedProjectId) {
      fetch(
        `${catalogApi}/api/projects/${encodeURIComponent(
          selectedProjectId,
        )}/activation-plan/preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            work_scope_tags: [scope],
            preset_id: pristine ? "builtin-pristine" : undefined,
          }),
        },
      )
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error("Preview request was rejected")),
        )
        .then((body: { plan: { operations: unknown[] } }) =>
          setNotice(
            `${body.plan.operations.length} operations were validated. Ready for Skills Manager delivery.`,
          ),
        )
        .catch((error: Error) => setNotice(error.message))
        .finally(() => setPreviewing(false));
      return;
    }
    window.setTimeout(() => {
      setPreviewing(false);
      setNotice(
        `${enabledCount} enabled and ${
          3 - enabledCount
        } disabled operations are ready for preview.`,
      );
    }, 620);
  }, [enabledCount, pristine, scope, selectedProjectId]);

  const applyPlan = useCallback(() => {
    if (!catalogApi || !selectedProjectId) {
      setNotice("Connect the local Catalog bridge before applying through Skills Manager CLI.");
      return;
    }
    if (
      !window.confirm(
        "Apply this immutable plan through Skills Manager CLI? The upstream manager may change provider bindings.",
      )
    ) {
      return;
    }
    setApplyingPlan(true);
    setNotice(null);
    setApplyProgress({
      stage: "record",
      completed: 0,
      total: 1,
      message: "Recording the immutable activation plan",
    });
    fetch(`${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/activation-plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        work_scope_tags: [scope],
        preset_id: pristine ? "builtin-pristine" : undefined,
      }),
    })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Activation plan could not be recorded")),
      )
      .then(async (body: { plan: { plan_id: string; operations: unknown[] } }) => {
        setApplyProgress({
          stage: "inspect",
          completed: 0,
          total: body.plan.operations.length,
          message: "Starting Skills Manager preflight",
        });
        const response = await fetch(
          `${catalogApi}/api/activation-plans/${encodeURIComponent(
            body.plan.plan_id,
          )}/apply/stream`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ confirmed: true }),
          },
        );
        return readApplyStream(response, setApplyProgress);
      })
      .then((body) => {
        const summary = body.report.summary;
        setNotice(
          `Skills Manager CLI ${body.status}: ${summary.applied} applied · ${summary.skipped} skipped · ${summary.failed} failed.`,
        );
        void refreshLiveStatus();
      })
      .catch((error: Error) => {
        setApplyProgress({ stage: "failed", completed: 0, total: 0, message: error.message });
        setNotice(error.message);
      })
      .finally(() => setApplyingPlan(false));
  }, [pristine, refreshLiveStatus, scope, selectedProjectId]);

  const copySystemPrompt = useCallback(() => {
    if (!catalogApi || !selectedProjectId) {
      setNotice("Connect the local Catalog bridge before copying a resolved system prompt.");
      return;
    }
    setCopyingPrompt(true);
    setNotice(null);
    const params = new URLSearchParams({ work_scope: scope, include_notes: "true" });
    if (pristine) params.set("preset", "builtin-pristine");
    fetch(
      `${catalogApi}/api/projects/${encodeURIComponent(selectedProjectId)}/system-prompt?${params}`,
    )
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Could not prepare the system prompt")),
      )
      .then(
        (body: {
          content: string;
          included_skill_ids: string[];
          skipped_skill_ids: string[];
        }) => copyText(body.content).then(() => body),
      )
      .then((body) =>
        setNotice(
          `Copied ${body.included_skill_ids.length} pinned skill prompt${
            body.included_skill_ids.length === 1 ? "" : "s"
          }${body.skipped_skill_ids.length ? `; ${body.skipped_skill_ids.length} skipped` : ""}.`,
        ),
      )
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setCopyingPrompt(false));
  }, [pristine, scope, selectedProjectId]);

  const updateSourceSummary = useCallback((sourceRevisionId: string, summary: string) => {
    setSourceReviewSummaries((current) => ({ ...current, [sourceRevisionId]: summary }));
  }, []);

  const reviewSourceCandidate = useCallback(
    (candidate: SourceAdoptionCandidate, decision: "approved" | "rejected") => {
      const summary = sourceReviewSummaries[candidate.source_revision_id]?.trim();
      if (!summary) {
        setNotice("Add a decision note before approving or rejecting an imported revision.");
        return;
      }
      setSourceActionId(candidate.source_revision_id);
      fetch(
        `${catalogApi}/api/source-revisions/${encodeURIComponent(
          candidate.source_revision_id,
        )}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision, summary }),
        },
      )
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error("Source review was rejected")),
        )
        .then(() => refreshSourceCandidates())
        .then(() =>
          setNotice(
            `Revision ${decision}. It remains isolated until a template adoption is chosen.`,
          ),
        )
        .catch((error: Error) => setNotice(error.message))
        .finally(() => setSourceActionId(null));
    },
    [refreshSourceCandidates, sourceReviewSummaries],
  );

  const adoptSourceCandidate = useCallback(
    (candidate: SourceAdoptionCandidate, presetId: string) => {
      setSourceActionId(`${candidate.registry_skill_id}:${presetId}`);
      fetch(`${catalogApi}/api/presets/${encodeURIComponent(presetId)}/adopt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registry_skill_id: candidate.registry_skill_id }),
      })
        .then((response) =>
          response.ok
            ? response.json()
            : Promise.reject(new Error("Template adoption was rejected")),
        )
        .then((body: { adoption: { selected_version: number } }) =>
          refreshSourceCandidates().then(() => body.adoption),
        )
        .then((adoption) =>
          setNotice(
            `Created template version ${adoption.selected_version}. Existing project pins were not changed.`,
          ),
        )
        .catch((error: Error) => setNotice(error.message))
        .finally(() => setSourceActionId(null));
    },
    [refreshSourceCandidates],
  );

  return (
    <main className="app-shell">
      <SideNavigation activePage={activePage} onNavigate={setActivePage} />
      <div className="workspace">
        {activePage === "Skills" ? (
          <>
            <SkillWorkspace
              skills={catalogSkills}
              selectedLineageId={selectedSkillLineageId}
              onSelect={setSelectedSkillLineageId}
              onSave={saveSkillProfile}
              saving={savingSkillProfile}
              feedback={skillFeedback}
              feedbackSummary={feedbackSummary}
              notes={skillNotes}
              evaluationSummary={evaluationSummary}
              loadingEvidence={loadingSkillEvidence}
              recordingFeedback={recordingFeedback}
              recordingNote={recordingNote}
              onRecordFeedback={recordSkillFeedback}
              onAddNote={addSkillUsageNote}
            />
            <ReviewQueue items={reviewItems} remote={catalogApi !== ""} />
            {catalogApi ? (
              <SourceChangeQueue
                candidates={sourceCandidates}
                summaries={sourceReviewSummaries}
                actionId={sourceActionId}
                onSummaryChange={updateSourceSummary}
                onReview={reviewSourceCandidate}
                onAdopt={adoptSourceCandidate}
              />
            ) : null}
          </>
        ) : activePage === "Templates" ? (
          <TemplateWorkspace
            presets={presets}
            skills={registrySkills}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={setSelectedTemplateId}
            onSave={saveTemplateMembership}
            onCreate={createTemplate}
            saving={savingTemplate}
          />
        ) : (
          <>
            <header className="topbar">
              <button className="back-button" type="button" aria-label="Back to projects">
                <ArrowLeft size={25} />
              </button>
              {catalogApi && projects.length > 0 ? (
                <label className="project-select">
                  <span className="sr-only">Project</span>
                  <select
                    value={selectedProjectId ?? ""}
                    onChange={(event) => {
                      setSelectedProjectId(event.target.value);
                      setPristine(false);
                      setNotice(null);
                    }}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} aria-hidden="true" />
                </label>
              ) : (
                <h1>Acme Web</h1>
              )}
              <label className="scope-select">
                Work scope
                <select
                  value={scope}
                  onChange={(event) => {
                    setScope(event.target.value as Scope);
                    setPristine(false);
                    setNotice(null);
                  }}
                >
                  <option value="planning">planning</option>
                  <option value="implementation">implementation</option>
                  <option value="review">review</option>
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </label>
            </header>
            <div className="project-layout">
              <section className="main-panel">
                <div className="panel-title">
                  <div>
                    <h2 id="effective-set-title">Effective skill set</h2>
                    <p>Resolved from pinned templates and the selected work scope.</p>
                  </div>
                  <button className="pristine-button" onClick={togglePristine} type="button">
                    <RefreshCcw size={18} /> {pristine ? "Restore" : "Pristine"}
                  </button>
                </div>
                <SkillTable skills={skills} />
                <LiveActivationStatus
                  globalStatus={globalStatus}
                  projectStatus={projectStatus}
                  loading={loadingLiveStatus}
                  error={liveStatusError}
                  onRefresh={() => void refreshLiveStatus()}
                />
                {remoteError ? (
                  <div className="plan-notice error">
                    <X size={18} /> <span>{remoteError}</span>
                  </div>
                ) : null}
                {notice ? (
                  <div className="plan-notice">
                    <Check size={18} /> <span>{notice}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                      <X size={16} />
                    </button>
                  </div>
                ) : null}
              </section>
              <TemplateInspector
                scope={scope}
                pristine={pristine}
                defaultTemplate={defaultTemplate}
                defaultPresetId={defaultPresetId}
                presets={presets}
                overlayTemplate={overlayTemplate}
                overlayPresetId={overlayPresetId}
                overlayActive={overlayActive}
                onPristine={togglePristine}
                onDefaultTemplate={updateDefaultTemplate}
                onOverlayTemplate={updateWorkScopeOverlay}
                onPreview={previewPlan}
                onApply={applyPlan}
                onCopyPrompt={copySystemPrompt}
                previewing={previewing}
                applying={applyingPlan}
                applyProgress={applyProgress}
                copyingPrompt={copyingPrompt}
                updatingDefault={updatingDefault}
                updatingOverlay={updatingOverlay}
              />
            </div>
            <PlanHistory
              scope={scope}
              pristine={pristine}
              previewing={previewing}
              skills={skills}
              defaultTemplate={defaultTemplate}
              remote={remoteSet !== null}
              history={history}
              comparison={comparison}
            />
          </>
        )}
      </div>
    </main>
  );
}
