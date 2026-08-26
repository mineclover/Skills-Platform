import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Copy,
  Cpu,
  Download,
  FileCode,
  FileDown,
  FileUp,
  FolderGit2,
  Layers,
  Play,
  RefreshCw,
  Sparkles,
  Terminal,
  UploadCloud,
  User,
  X,
  Zap,
} from "lucide-react";
import {
  applyRecipeApi,
  copyText,
  downloadRecipeJson,
  exportRecipeApi,
  inspectRecipeApi,
} from "../api/catalog-api";
import {
  DeliveryPathIndicator,
  INVOCATION_MODE_INFO,
  InvocationBadge,
  ProviderBadge,
  Tooltip,
} from "../visual-identity";
import type {
  CatalogSkill,
  RecipeApplyResult,
  RecipeInspectionResult,
  RemotePreset,
  RemoteProject,
  SkillRecipe,
} from "../types";

export interface RecipeWorkspaceProps {
  projects: RemoteProject[];
  presets: RemotePreset[];
  catalogSkills: CatalogSkill[];
  selectedProjectId: string | null;
  onSelectProject?: (projectId: string) => void;
}

const SAMPLE_RECIPE: SkillRecipe = {
  schema_version: 1,
  recipe_id: "recipe_starter_bundle",
  name: "Full Stack AI Engineer Starter Bundle",
  description:
    "Curated multi-provider skill recipe with reflex reasoning, automated testing, and human steering tools.",
  created_at: new Date().toISOString(),
  created_by: "Skills Platform Catalog",
  sources: [
    {
      source_id: "skills-platform-core",
      type: "git",
      locator: "https://github.com/skills-platform/core-skills.git",
      ref: "v2.4.0",
      resolved_commit: "e4d3c2b1a09876543210fedcba9876543210fedc",
    },
    {
      source_id: "skills-platform-community",
      type: "git",
      locator: "https://github.com/skills-platform/community-skills.git",
      ref: "main",
      resolved_commit: "0123456789abcdef0123456789abcdef01234567",
    },
  ],
  skills: [
    {
      name: "planning",
      artifact_type: "skill",
      invocation_mode: "model_invoked",
      source_id: "skills-platform-core",
      source_relative_path: "skills/planning",
      content_digest: "sha256:4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b",
      description: "Autonomous reasoning and step-by-step task breakdown routines.",
    },
    {
      name: "modelchk",
      artifact_type: "skill",
      invocation_mode: "model_invoked",
      source_id: "skills-platform-core",
      source_relative_path: "skills/modelchk",
      content_digest: "sha256:5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c",
      description: "Invariant verification and automated precondition check reflexes.",
    },
    {
      name: "testing",
      artifact_type: "skill",
      invocation_mode: "user_invoked",
      source_id: "skills-platform-core",
      source_relative_path: "skills/testing",
      content_digest: "sha256:6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d",
      description: "Destructive unit and integration test suite orchestrator.",
    },
    {
      name: "macrothink",
      artifact_type: "skill",
      invocation_mode: "user_invoked",
      source_id: "skills-platform-community",
      source_relative_path: "skills/macrothink",
      content_digest: "sha256:7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e",
      description: "Human-triggered architectural planning and strategic alignment.",
    },
    {
      name: "code-review",
      artifact_type: "skill",
      invocation_mode: "hybrid",
      source_id: "skills-platform-core",
      source_relative_path: "skills/code-review",
      content_digest: "sha256:8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
      description: "Autonomous style linting and human-interactive security evaluation.",
    },
  ],
  presets: [
    {
      id: "ai-engineer-production",
      name: "AI Engineer Production Preset",
      version: 1,
      description: "Complete workflow template with planning, testing, and review",
      purpose: "Production software engineering with autonomous LLM support",
      work_scope_tags: ["planning", "implementation", "review"],
      skills: [
        { skill_name: "planning", artifact_type: "skill", required: true },
        { skill_name: "modelchk", artifact_type: "skill", required: true },
        { skill_name: "testing", artifact_type: "skill", required: false },
        { skill_name: "code-review", artifact_type: "skill", required: true },
      ],
    },
    {
      id: "architect-steering",
      name: "Architect Steering Preset",
      version: 1,
      description: "Human-led steering preset for system architecture design",
      purpose: "Macro design and validation",
      work_scope_tags: ["planning"],
      skills: [
        { skill_name: "macrothink", artifact_type: "skill", required: true },
        { skill_name: "code-review", artifact_type: "skill", required: false },
      ],
    },
  ],
  projects: [
    {
      project_id: "skills-platform-web",
      project_name: "Skills Platform Web",
      provider_id: "antigravity",
      scope: "project",
      default_preset_id: "ai-engineer-production",
      default_preset_version: 1,
      delivery_root_relative: ".agents/skills",
    },
  ],
};

export function RecipeWorkspace({
  projects,
  presets,
  selectedProjectId,
}: RecipeWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"hub" | "export" | "apply">("hub");

  // Export State
  const [exportScope, setExportScope] = useState<"catalog" | "project" | "preset">("catalog");
  const [exportProjectId, setExportProjectId] = useState<string>(selectedProjectId || projects[0]?.id || "");
  const [exportPresetId, setExportPresetId] = useState<string>(presets[0]?.id || "");
  const [exportName, setExportName] = useState<string>("Catalog Skills Recipe");
  const [exportDescription, setExportDescription] = useState<string>(
    "Portable skill recipe bundle matching @skills-platform/contracts schema.",
  );
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportedRecipe, setExportedRecipe] = useState<SkillRecipe | null>(null);
  const [exportCopied, setExportCopied] = useState<boolean>(false);

  // Inspector State
  const [rawJson, setRawJson] = useState<string>("");
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [inspecting, setInspecting] = useState<boolean>(false);
  const [inspectionResult, setInspectionResult] = useState<RecipeInspectionResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply State
  const [targetProjectPath, setTargetProjectPath] = useState<string>(
    projects.find((p) => p.id === selectedProjectId)?.name
      ? `./projects/${selectedProjectId}`
      : "./projects/demo-workspace",
  );
  const [selectedProvider, setSelectedProvider] = useState<"antigravity" | "codex" | "claude">(
    "antigravity",
  );
  const [applying, setApplying] = useState<boolean>(false);
  const [previewResult, setPreviewResult] = useState<RecipeApplyResult | null>(null);
  const [applyConfirmedResult, setApplyConfirmedResult] = useState<RecipeApplyResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Banner Notification
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(
    null,
  );

  // Auto-fill export name based on scope selection
  useEffect(() => {
    if (exportScope === "project") {
      const proj = projects.find((p) => p.id === exportProjectId);
      setExportName(proj ? `Recipe for ${proj.name}` : "Project Skills Recipe");
    } else if (exportScope === "preset") {
      const pres = presets.find((p) => p.id === exportPresetId);
      setExportName(pres ? `Recipe for ${pres.name}` : "Template Preset Recipe");
    } else {
      setExportName("Full Catalog Skills Recipe");
    }
  }, [exportScope, exportProjectId, exportPresetId, projects, presets]);

  // Handle Export Generation
  const handleExportRecipe = useCallback(
    async (triggerDownload = true) => {
      setExporting(true);
      setNotice(null);
      try {
        const params: { projectId?: string; presetId?: string; name?: string; description?: string } = {
          name: exportName,
          description: exportDescription,
        };
        if (exportScope === "project" && exportProjectId) {
          params.projectId = exportProjectId;
        } else if (exportScope === "preset" && exportPresetId) {
          params.presetId = exportPresetId;
        }

        const { recipe } = await exportRecipeApi(params);
        setExportedRecipe(recipe);

        if (triggerDownload) {
          const filename = `${recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
          downloadRecipeJson(recipe, filename);
          setNotice({
            type: "success",
            message: `Downloaded ${filename} successfully (${recipe.skills.length} skills, ${recipe.presets.length} presets).`,
          });
        }
      } catch (err: any) {
        setNotice({ type: "error", message: `Export failed: ${err.message}` });
      } finally {
        setExporting(false);
      }
    },
    [exportScope, exportProjectId, exportPresetId, exportName, exportDescription],
  );

  // Run Recipe Inspection on JSON change
  const inspectContent = useCallback(async (content: string) => {
    if (!content.trim()) {
      setInspectionResult(null);
      return;
    }
    setInspecting(true);
    try {
      const result = await inspectRecipeApi(content);
      setInspectionResult(result);
      if (result.valid) {
        setNotice({
          type: "success",
          message: `Inspected valid recipe "${result.name}" with ${result.summary?.skills_count ?? 0} skills across ${result.summary?.sources_count ?? 0} sources.`,
        });
      }
    } catch (err: any) {
      setInspectionResult({
        valid: false,
        issues: [{ field: "json", message: err.message }],
      });
    } finally {
      setInspecting(false);
    }
  }, []);

  // Handle File Drop & Upload
  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".json")) {
        setNotice({ type: "error", message: "Only .json skill recipe files are supported." });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setRawJson(text);
        void inspectContent(text);
      };
      reader.onerror = () => {
        setNotice({ type: "error", message: "Failed to read uploaded file." });
      };
      reader.readAsText(file);
    },
    [inspectContent],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Load sample recipe into inspector
  const loadSample = useCallback(() => {
    const sampleString = JSON.stringify(SAMPLE_RECIPE, null, 2);
    setRawJson(sampleString);
    void inspectContent(sampleString);
  }, [inspectContent]);

  // Copy raw JSON to clipboard
  const handleCopyRaw = useCallback(async () => {
    if (!rawJson) return;
    try {
      await copyText(rawJson);
      setNotice({ type: "info", message: "Recipe JSON copied to clipboard." });
    } catch {
      setNotice({ type: "error", message: "Could not copy to clipboard." });
    }
  }, [rawJson]);

  // Handle Live Preview of Recipe Apply
  const handleApplyPreview = useCallback(async () => {
    if (!rawJson.trim()) {
      setNotice({ type: "error", message: "Inspect or paste a valid recipe before applying." });
      return;
    }
    setApplying(true);
    setApplyError(null);
    setApplyConfirmedResult(null);
    try {
      const result = await applyRecipeApi({
        recipe: rawJson,
        project_path: targetProjectPath,
        provider_id: selectedProvider,
        confirm: false,
      });
      setPreviewResult(result);
      setNotice({
        type: "info",
        message: `Preview ready: ${result.sources_imported.length} sources and ${result.presets_reconciled.length} presets prepared for ${selectedProvider}.`,
      });
    } catch (err: any) {
      setApplyError(err.message);
      setNotice({ type: "error", message: `Apply preview failed: ${err.message}` });
    } finally {
      setApplying(false);
    }
  }, [rawJson, targetProjectPath, selectedProvider]);

  // Handle Confirmed Recipe Apply Execution
  const handleApplyConfirm = useCallback(async () => {
    if (!rawJson.trim()) {
      setNotice({ type: "error", message: "Inspect or paste a valid recipe before applying." });
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      const result = await applyRecipeApi({
        recipe: rawJson,
        project_path: targetProjectPath,
        provider_id: selectedProvider,
        confirm: true,
      });
      setApplyConfirmedResult(result);
      setNotice({
        type: "success",
        message: `Successfully applied recipe "${result.name}" to target project with ${selectedProvider} delivery bindings!`,
      });
    } catch (err: any) {
      setApplyError(err.message);
      setNotice({ type: "error", message: `Apply failed: ${err.message}` });
    } finally {
      setApplying(false);
    }
  }, [rawJson, targetProjectPath, selectedProvider]);

  // Active Provider Delivery Path preview
  const deliveryPathExample = useMemo(() => {
    const cleanPath = targetProjectPath.replace(/[\\/]+$/, "");
    switch (selectedProvider) {
      case "antigravity":
        return `${cleanPath}/.agents/skills/<skill_name>/`;
      case "claude":
        return `${cleanPath}/.claude/skills/<skill_name>/`;
      case "codex":
      default:
        return `${cleanPath}/skills/<skill_name>/`;
    }
  }, [targetProjectPath, selectedProvider]);

  return (
    <div className="recipe-workspace">
      {/* Workspace Header */}
      <header className="recipe-header">
        <div className="recipe-header-title">
          <div className="recipe-badge-title">
            <Layers className="mint" size={24} />
            <h1>Skill Recipe Hub & Transfer Workspace</h1>
          </div>
          <p>
            Export versioned templates into portable <code>recipe.json</code> manifests, inspect
            external bundles with invocation telemetry, and materialize provider delivery bindings.
          </p>
        </div>

        {/* Action Tabs */}
        <div className="recipe-tab-bar">
          <button
            type="button"
            className={`recipe-tab-btn ${activeTab === "hub" ? "active" : ""}`}
            onClick={() => setActiveTab("hub")}
          >
            <UploadCloud size={16} />
            <span>Inspect & Transfer</span>
          </button>
          <button
            type="button"
            className={`recipe-tab-btn ${activeTab === "export" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("export");
              if (!exportedRecipe) void handleExportRecipe(false);
            }}
          >
            <FileDown size={16} />
            <span>Export Recipe</span>
          </button>
          <button
            type="button"
            className={`recipe-tab-btn ${activeTab === "apply" ? "active" : ""}`}
            onClick={() => setActiveTab("apply")}
          >
            <Play size={16} />
            <span>Apply to Project</span>
          </button>
        </div>
      </header>

      {/* Global Notification Banner */}
      {notice && (
        <div className={`recipe-notice ${notice.type}`}>
          {notice.type === "success" && <CheckCircle2 size={18} className="mint" />}
          {notice.type === "error" && <AlertCircle size={18} className="coral" />}
          {notice.type === "info" && <Sparkles size={18} className="violet" />}
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Tab 1: Hub & Inspector View */}
      {activeTab === "hub" && (
        <div className="recipe-hub-layout">
          {/* Left Column: Dropzone & Raw Editor */}
          <div className="recipe-input-column">
            {/* Drag & Drop Zone */}
            <div
              className={`recipe-dropzone ${isDragging ? "dragging" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
              />
              <div className="dropzone-content">
                <FileUp className="dropzone-icon" size={36} />
                <h3>Drag & Drop recipe.json here</h3>
                <p>or click to browse from local filesystem</p>
                <div className="dropzone-meta">
                  <span>Conforms to @skills-platform/contracts schema v1</span>
                </div>
              </div>
            </div>

            {/* Paste & Raw JSON Area */}
            <div className="recipe-paste-panel">
              <div className="panel-header-row">
                <div className="panel-header-title">
                  <Code2 size={16} className="mint" />
                  <span>Raw Recipe Manifest (JSON)</span>
                </div>
                <div className="panel-header-actions">
                  <button
                    type="button"
                    className="recipe-sm-btn secondary"
                    onClick={loadSample}
                    title="Load an example recipe with reflex and command skills"
                  >
                    <Sparkles size={13} />
                    <span>Load Sample</span>
                  </button>
                  {rawJson && (
                    <>
                      <button
                        type="button"
                        className="recipe-sm-btn secondary"
                        onClick={handleCopyRaw}
                        title="Copy JSON to clipboard"
                      >
                        <Copy size={13} />
                        <span>Copy</span>
                      </button>
                      <button
                        type="button"
                        className="recipe-sm-btn secondary"
                        onClick={() => {
                          setRawJson("");
                          setInspectionResult(null);
                        }}
                        title="Clear JSON"
                      >
                        <X size={13} />
                        <span>Clear</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <textarea
                className="recipe-json-textarea"
                value={rawJson}
                placeholder={`Paste your Skill Recipe JSON manifest here...\n\nExample schema:\n{\n  "schema_version": 1,\n  "recipe_id": "recipe_123",\n  "name": "My Custom Recipe",\n  "sources": [...],\n  "skills": [...],\n  "presets": [...]\n}`}
                onChange={(e) => {
                  setRawJson(e.target.value);
                  void inspectContent(e.target.value);
                }}
                spellCheck={false}
              />
            </div>
          </div>

          {/* Right Column: Inspection Metrics & Breakdown */}
          <div className="recipe-metrics-column">
            {inspecting ? (
              <div className="recipe-loading-state">
                <RefreshCw size={24} className="spin mint" />
                <span>Validating recipe contracts & calculating telemetry...</span>
              </div>
            ) : inspectionResult ? (
              <div className="recipe-inspection-card">
                {/* Inspection Header */}
                <div className="inspection-header">
                  <div>
                    <div className="inspection-status-row">
                      <span
                        className={`inspection-status-pill ${
                          inspectionResult.valid ? "valid" : "invalid"
                        }`}
                      >
                        {inspectionResult.valid ? (
                          <>
                            <Check size={13} /> Schema Valid (v1)
                          </>
                        ) : (
                          <>
                            <AlertCircle size={13} /> Invalid Manifest
                          </>
                        )}
                      </span>
                      {inspectionResult.recipe_id && (
                        <span className="recipe-id-pill">
                          ID: <code>{inspectionResult.recipe_id}</code>
                        </span>
                      )}
                    </div>
                    <h2>{inspectionResult.name || "Untitled Recipe"}</h2>
                    {inspectionResult.description && (
                      <p className="recipe-desc">{inspectionResult.description}</p>
                    )}
                  </div>

                  {inspectionResult.valid && (
                    <button
                      type="button"
                      className="primary-action-btn"
                      onClick={() => setActiveTab("apply")}
                    >
                      <span>Proceed to Apply</span>
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>

                {/* Validation Issues Alert */}
                {inspectionResult.issues && inspectionResult.issues.length > 0 && (
                  <div className="recipe-issues-alert">
                    <div className="issues-title">
                      <AlertCircle size={17} />
                      <strong>Schema Validation Issues ({inspectionResult.issues.length}):</strong>
                    </div>
                    <ul>
                      {inspectionResult.issues.map((issue, idx) => (
                        <li key={idx}>
                          <code>{issue.field}</code>: {issue.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Summary Metrics Grid */}
                {inspectionResult.summary && (
                  <>
                    <div className="recipe-metrics-grid">
                      <div className="recipe-metric-card">
                        <div className="metric-header">
                          <FolderGit2 size={16} className="mint" />
                          <span>Sources</span>
                        </div>
                        <strong className="metric-value">
                          {inspectionResult.summary.sources_count}
                        </strong>
                        <small className="metric-label">Git / Local Registries</small>
                      </div>

                      <div className="recipe-metric-card">
                        <div className="metric-header">
                          <Cpu size={16} className="mint" />
                          <span>Total Skills</span>
                        </div>
                        <strong className="metric-value">
                          {inspectionResult.summary.skills_count}
                        </strong>
                        <small className="metric-label">Declared Artifacts</small>
                      </div>

                      <div className="recipe-metric-card">
                        <div className="metric-header">
                          <Layers size={16} className="violet" />
                          <span>Presets</span>
                        </div>
                        <strong className="metric-value">
                          {inspectionResult.summary.presets_count}
                        </strong>
                        <small className="metric-label">Versioned Templates</small>
                      </div>

                      <div className="recipe-metric-card">
                        <div className="metric-header">
                          <Terminal size={16} className="amber" />
                          <span>Projects</span>
                        </div>
                        <strong className="metric-value">
                          {inspectionResult.summary.projects_count}
                        </strong>
                        <small className="metric-label">Target Bindings</small>
                      </div>
                    </div>

                    {/* Invocation Mode Breakdown */}
                    <div className="recipe-breakdown-section">
                      <div className="section-title-row">
                        <Zap size={16} className="amber" />
                        <h3>Invocation Mode Breakdown</h3>
                      </div>
                      <div className="invocation-breakdown-grid">
                        <Tooltip content={INVOCATION_MODE_INFO.model_invoked.tooltip}>
                          <div className="invocation-mode-card model has-tooltip">
                            <div className="mode-title-row">
                              <Bot size={15} />
                              <strong>🤖 Model-invoked (Reflex)</strong>
                            </div>
                            <span className="mode-count">
                              {inspectionResult.summary.by_invocation_mode.model_invoked}
                            </span>
                            <small>Autonomous reasoning routines</small>
                          </div>
                        </Tooltip>

                        <Tooltip content={INVOCATION_MODE_INFO.user_invoked.tooltip}>
                          <div className="invocation-mode-card user has-tooltip">
                            <div className="mode-title-row">
                              <User size={15} />
                              <strong>👤 User-invoked (Command)</strong>
                            </div>
                            <span className="mode-count">
                              {inspectionResult.summary.by_invocation_mode.user_invoked}
                            </span>
                            <small>Human-steered destructive tasks</small>
                          </div>
                        </Tooltip>

                        <Tooltip content={INVOCATION_MODE_INFO.hybrid.tooltip}>
                          <div className="invocation-mode-card hybrid has-tooltip">
                            <div className="mode-title-row">
                              <Sparkles size={15} />
                              <strong>🔀 Hybrid Mode</strong>
                            </div>
                            <span className="mode-count">
                              {inspectionResult.summary.by_invocation_mode.hybrid}
                            </span>
                            <small>Dual reflex & command support</small>
                          </div>
                        </Tooltip>

                        <Tooltip content={INVOCATION_MODE_INFO.unspecified.tooltip}>
                          <div className="invocation-mode-card unspecified has-tooltip">
                            <div className="mode-title-row">
                              <Code2 size={15} />
                              <strong>⚙️ Unspecified</strong>
                            </div>
                            <span className="mode-count">
                              {inspectionResult.summary.by_invocation_mode.unspecified}
                            </span>
                            <small>Default legacy classification</small>
                          </div>
                        </Tooltip>
                      </div>
                    </div>

                    {/* Presets List */}
                    {inspectionResult.presets && inspectionResult.presets.length > 0 && (
                      <div className="recipe-presets-section">
                        <div className="section-title-row">
                          <Layers size={16} className="mint" />
                          <h3>Included Preset Templates ({inspectionResult.presets.length})</h3>
                        </div>
                        <div className="recipe-preset-list">
                          {inspectionResult.presets.map((preset) => (
                            <div key={preset.id} className="recipe-preset-item">
                              <div className="preset-item-info">
                                <strong>{preset.name}</strong>
                                <span>
                                  ID: <code>{preset.id}</code> · Version: <code>v{preset.version}</code>
                                </span>
                              </div>
                              <span className="preset-item-badge">
                                {preset.skills_count} skills included
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="recipe-empty-inspector">
                <FileCode size={48} className="muted" />
                <h3>No Recipe Loaded for Inspection</h3>
                <p>
                  Drag and drop a <code>recipe.json</code> onto the dropzone or click "Load Sample"
                  to inspect metrics, invocation breakdown, and preset templates.
                </p>
                <button type="button" className="recipe-sample-btn" onClick={loadSample}>
                  <Sparkles size={16} />
                  <span>Explore Sample Recipe</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Export Recipe Panel */}
      {activeTab === "export" && (
        <div className="recipe-export-panel">
          <div className="export-config-column">
            <h2>Configure Recipe Export</h2>
            <p>
              Package local skills, presets, and project configurations into a portable schema-compliant
              manifest for export.
            </p>

            <div className="export-form">
              {/* Scope Selector */}
              <div className="form-group">
                <label>Export Scope</label>
                <div className="scope-radio-group">
                  <label className={`scope-radio-label ${exportScope === "catalog" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="exportScope"
                      value="catalog"
                      checked={exportScope === "catalog"}
                      onChange={() => setExportScope("catalog")}
                    />
                    <div>
                      <strong>Full Catalog</strong>
                      <small>All templates and managed skills</small>
                    </div>
                  </label>

                  <label className={`scope-radio-label ${exportScope === "project" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="exportScope"
                      value="project"
                      checked={exportScope === "project"}
                      onChange={() => setExportScope("project")}
                    />
                    <div>
                      <strong>Project Configuration</strong>
                      <small>Assigned presets and project bindings</small>
                    </div>
                  </label>

                  <label className={`scope-radio-label ${exportScope === "preset" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="exportScope"
                      value="preset"
                      checked={exportScope === "preset"}
                      onChange={() => setExportScope("preset")}
                    />
                    <div>
                      <strong>Preset Template</strong>
                      <small>Selected versioned template</small>
                    </div>
                  </label>
                </div>
              </div>

              {/* Conditional Project Picker */}
              {exportScope === "project" && (
                <div className="form-group">
                  <label>Select Project</label>
                  <div className="select-wrapper">
                    <select
                      value={exportProjectId}
                      onChange={(e) => setExportProjectId(e.target.value)}
                    >
                      {projects.map((proj) => (
                        <option key={proj.id} value={proj.id}>
                          {proj.name} ({proj.id})
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </div>
              )}

              {/* Conditional Preset Picker */}
              {exportScope === "preset" && (
                <div className="form-group">
                  <label>Select Preset Template</label>
                  <div className="select-wrapper">
                    <select
                      value={exportPresetId}
                      onChange={(e) => setExportPresetId(e.target.value)}
                    >
                      {presets.map((pres) => (
                        <option key={pres.id} value={pres.id}>
                          {pres.name} (v{pres.selected_version})
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </div>
              )}

              {/* Manifest Metadata */}
              <div className="form-group">
                <label>Recipe Manifest Name</label>
                <input
                  type="text"
                  value={exportName}
                  onChange={(e) => setExportName(e.target.value)}
                  placeholder="e.g. Production AI Toolchain"
                />
              </div>

              <div className="form-group">
                <label>Description (Optional)</label>
                <textarea
                  rows={2}
                  value={exportDescription}
                  onChange={(e) => setExportDescription(e.target.value)}
                  placeholder="Describe the purpose and target environment for this recipe..."
                />
              </div>

              {/* Action Buttons */}
              <div className="export-action-row">
                <button
                  type="button"
                  className="download-action-btn"
                  disabled={exporting}
                  onClick={() => void handleExportRecipe(true)}
                >
                  {exporting ? (
                    <RefreshCw size={18} className="spin" />
                  ) : (
                    <Download size={18} />
                  )}
                  <span>1-Click Download Recipe (.json)</span>
                </button>

                <button
                  type="button"
                  className="preview-action-btn"
                  disabled={exporting}
                  onClick={() => void handleExportRecipe(false)}
                >
                  <Code2 size={16} />
                  <span>Update Live Preview</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Generated Preview */}
          <div className="export-preview-column">
            <div className="preview-header">
              <div className="preview-title">
                <Code2 size={16} className="mint" />
                <span>Generated Schema Preview</span>
              </div>
              {exportedRecipe && (
                <button
                  type="button"
                  className="recipe-sm-btn secondary"
                  onClick={async () => {
                    await copyText(JSON.stringify(exportedRecipe, null, 2));
                    setExportCopied(true);
                    setTimeout(() => setExportCopied(false), 2000);
                  }}
                >
                  {exportCopied ? <Check size={14} className="mint" /> : <Copy size={14} />}
                  <span>{exportCopied ? "Copied!" : "Copy JSON"}</span>
                </button>
              )}
            </div>

            <pre className="recipe-code-preview">
              {exportedRecipe
                ? JSON.stringify(exportedRecipe, null, 2)
                : '// Click "Update Live Preview" or "1-Click Download" to generate manifest...'}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 3: Apply to Project Workflow */}
      {activeTab === "apply" && (
        <div className="recipe-apply-panel">
          <div className="apply-config-card">
            <div className="card-header-row">
              <div>
                <h2>Apply Recipe to Target Project</h2>
                <p>
                  Reconcile preset definitions and materialize provider symlinks directly into your
                  assistant delivery root.
                </p>
              </div>
              <span className="schema-pill">v1 Delivery Adapter</span>
            </div>

            {/* Target Path Configuration */}
            <div className="apply-form-grid">
              <div className="form-group">
                <label>Target Project Directory Path</label>
                <input
                  type="text"
                  value={targetProjectPath}
                  onChange={(e) => setTargetProjectPath(e.target.value)}
                  placeholder="e.g. C:\Users\minec\Skills-Platform\projects\my-app"
                />
                <small className="field-hint">
                  Absolute or workspace-relative path where delivery symlinks will be created.
                </small>
              </div>

              {/* Provider Selection */}
              <div className="form-group">
                <label>Assistant Provider Platform</label>
                <div className="provider-options-grid">
                  <label
                    className={`provider-card-option ${
                      selectedProvider === "antigravity" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value="antigravity"
                      checked={selectedProvider === "antigravity"}
                      onChange={() => setSelectedProvider("antigravity")}
                    />
                    <div className="provider-option-content">
                      <div className="provider-title">
                        <Sparkles size={16} className="mint" />
                        <strong>Antigravity (AGY)</strong>
                      </div>
                      <span className="delivery-root-tag">.agents/skills/</span>
                    </div>
                  </label>

                  <label
                    className={`provider-card-option ${
                      selectedProvider === "codex" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value="codex"
                      checked={selectedProvider === "codex"}
                      onChange={() => setSelectedProvider("codex")}
                    />
                    <div className="provider-option-content">
                      <div className="provider-title">
                        <Terminal size={16} className="amber" />
                        <strong>Codex CLI</strong>
                      </div>
                      <span className="delivery-root-tag">skills/</span>
                    </div>
                  </label>

                  <label
                    className={`provider-card-option ${
                      selectedProvider === "claude" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value="claude"
                      checked={selectedProvider === "claude"}
                      onChange={() => setSelectedProvider("claude")}
                    />
                    <div className="provider-option-content">
                      <div className="provider-title">
                        <Cpu size={16} className="violet" />
                        <strong>Claude Desktop</strong>
                      </div>
                      <span className="delivery-root-tag">.claude/skills/</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Path Resolution Box */}
            <div className="resolved-delivery-preview">
              <span className="delivery-label">Active Provider Delivery Root:</span>
              <code>{deliveryPathExample}</code>
            </div>

            {/* Action Bar */}
            <div className="apply-actions-row">
              <button
                type="button"
                className="preview-btn"
                disabled={applying || !rawJson.trim()}
                onClick={handleApplyPreview}
              >
                {applying ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
                <span>Live Preview Operations</span>
              </button>

              <button
                type="button"
                className="confirm-apply-btn"
                disabled={applying || !rawJson.trim()}
                onClick={handleApplyConfirm}
              >
                {applying ? <RefreshCw size={16} className="spin" /> : <CheckCircle2 size={16} />}
                <span>Confirm & Materialize Recipe</span>
              </button>
            </div>

            {/* Error Display */}
            {applyError && (
              <div className="apply-error-banner">
                <AlertCircle size={18} />
                <span>{applyError}</span>
              </div>
            )}

            {/* Preview Results Display */}
            {previewResult && !applyConfirmedResult && (
              <div className="apply-result-card preview">
                <div className="result-header">
                  <Play size={18} className="amber" />
                  <strong>Live Preview Prepared: {previewResult.name}</strong>
                </div>
                <div className="result-stats">
                  <div>
                    <span>Sources:</span>{" "}
                    <strong>{previewResult.sources_imported.length} imported</strong>
                  </div>
                  <div>
                    <span>Presets:</span>{" "}
                    <strong>{previewResult.presets_reconciled.length} reconciled</strong>
                  </div>
                  {previewResult.delivery && (
                    <div>
                      <span>Delivery Status:</span>{" "}
                      <strong>{previewResult.delivery.message || "Ready for confirmation"}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Confirmed Results Display */}
            {applyConfirmedResult && (
              <div className="apply-result-card confirmed">
                <div className="result-header">
                  <CheckCircle2 size={20} className="mint" />
                  <strong>Successfully Applied: {applyConfirmedResult.name}</strong>
                </div>
                <p className="confirmed-desc">
                  All recipe sources were imported, preset templates updated, and symbolic delivery
                  bindings materialized into <code>{targetProjectPath}</code> for provider{" "}
                  <code>{selectedProvider}</code>.
                </p>
                <div className="result-stats">
                  <div>
                    <span>Sources:</span>{" "}
                    <strong>{applyConfirmedResult.sources_imported.length} active</strong>
                  </div>
                  <div>
                    <span>Presets Reconciled:</span>{" "}
                    <strong>{applyConfirmedResult.presets_reconciled.length} templates</strong>
                  </div>
                  {applyConfirmedResult.delivery?.message && (
                    <div>
                      <span>Delivery:</span>{" "}
                      <strong>{applyConfirmedResult.delivery.message}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
