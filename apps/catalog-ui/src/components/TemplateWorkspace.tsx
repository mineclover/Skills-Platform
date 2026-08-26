import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import { downloadRecipeJson, exportRecipeApi } from "../api/catalog-api";
import { FilterToolbar, type InvocationFilterMode } from "./FilterToolbar";
import {
  DeliveryPathIndicator,
  InvocationBadge,
  ProjectStatusPill,
  ProviderBadge,
  getProviderInfo,
} from "../visual-identity";
import type { RegistrySkill, RemotePreset } from "../types";

export function TemplateWorkspace({
  presets,
  skills,
  selectedTemplateId,
  onSelectTemplate,
  onSave,
  onCreate,
  saving,
  onExportRecipe,
  providerId = "antigravity",
}: {
  presets: RemotePreset[];
  skills: RegistrySkill[];
  selectedTemplateId: string | null;
  onSelectTemplate: (id: string) => void;
  onSave: (presetId: string, skillIds: string[]) => void;
  onCreate: (id: string, name: string, skillIds: string[]) => Promise<boolean>;
  saving: boolean;
  onExportRecipe?: (presetId: string, name: string) => void;
  providerId?: string;
}) {
  const template =
    presets.find((item) => item.id === selectedTemplateId) ??
    presets.find((item) => item.id !== "builtin-pristine") ??
    null;

  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [invocationFilter, setInvocationFilter] = useState<InvocationFilterMode>("all");
  const [exportingRecipe, setExportingRecipe] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!creating) setSelectedSkillIds(template?.registry_skill_ids ?? []);
  }, [creating, template?.id, template?.selected_version]);

  const toggleSkill = useCallback((skillId: string) => {
    setSelectedSkillIds((current) =>
      current.includes(skillId) ? current.filter((id) => id !== skillId) : [...current, skillId],
    );
  }, []);

  const selectAllFiltered = useCallback((skillList: RegistrySkill[]) => {
    setSelectedSkillIds((current) => {
      const set = new Set(current);
      for (const s of skillList) set.add(s.id);
      return Array.from(set);
    });
  }, []);

  const deselectAllFiltered = useCallback((skillList: RegistrySkill[]) => {
    const toRemove = new Set(skillList.map((s) => s.id));
    setSelectedSkillIds((current) => current.filter((id) => !toRemove.has(id)));
  }, []);

  const editable = creating || (template !== null && template.id !== "builtin-pristine");

  // Check for unsaved/dirty edits
  const isDirty = useMemo(() => {
    if (creating) return selectedSkillIds.length > 0 || newTemplateId.trim().length > 0;
    if (!template) return false;
    const originalIds = new Set(template.registry_skill_ids || []);
    if (originalIds.size !== selectedSkillIds.length) return true;
    for (const id of selectedSkillIds) {
      if (!originalIds.has(id)) return true;
    }
    return false;
  }, [creating, template, selectedSkillIds, newTemplateId]);

  const beginCreate = () => {
    setCreating(true);
    setNewTemplateId("");
    setNewTemplateName("");
    setSelectedSkillIds([]);
    setExportNotice(null);
  };

  const cancelCreate = () => {
    setCreating(false);
    setSelectedSkillIds(template?.registry_skill_ids ?? []);
    setExportNotice(null);
  };

  // Filter skills by invocation mode and search query
  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      if (invocationFilter !== "all") {
        const mode = skill.invocation_mode ?? "unspecified";
        if (mode !== invocationFilter) return false;
      }

      const needle = searchQuery.trim().toLowerCase();
      if (!needle) return true;

      const searchable = [skill.skill_name, skill.description, skill.source_revision_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(needle);
    });
  }, [skills, invocationFilter, searchQuery]);

  const handleExportRecipe = async () => {
    if (!template) return;
    if (onExportRecipe) {
      onExportRecipe(template.id, template.name);
      return;
    }
    setExportingRecipe(true);
    setExportNotice(null);
    try {
      const result = await exportRecipeApi({
        presetId: template.id,
        name: `${template.name} Recipe`,
        description: `Exported preset recipe for ${template.name} (v${template.selected_version}) with ${template.registry_skill_ids.length} skills.`,
      });
      downloadRecipeJson(result.recipe, `${template.id}-recipe.json`);
      setExportNotice(`Exported "${template.name}" as recipe.json successfully!`);
    } catch (err: any) {
      setExportNotice(`Export failed: ${err.message || "Unknown error"}`);
    } finally {
      setExportingRecipe(false);
    }
  };

  return (
    <section className="template-workspace">
      <header className="template-header">
        <div>
          <h1>Templates</h1>
          <p>
            Versioned skill membership. Saving creates a new template version; project pins stay
            unchanged.
          </p>
        </div>
        {creating ? (
          <button className="quiet-action template-new" type="button" onClick={cancelCreate}>
            Cancel
          </button>
        ) : (
          <div className="template-header-actions">
            <ProviderBadge providerId={providerId} showDeliveryPath={false} showTooltip={true} />
            <label className="template-picker">
              <span>Template</span>
              <select
                value={template?.id ?? ""}
                onChange={(event) => {
                  onSelectTemplate(event.target.value);
                  setExportNotice(null);
                }}
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} · v{preset.selected_version}
                  </option>
                ))}
              </select>
            </label>
            <button className="quiet-action template-new" type="button" onClick={beginCreate}>
              New template
            </button>
          </div>
        )}
      </header>

      {exportNotice ? (
        <div
          className={`recipe-notice ${exportNotice.includes("failed") ? "error" : "success"}`}
          role="status"
        >
          <span>{exportNotice}</span>
          <button type="button" onClick={() => setExportNotice(null)} aria-label="Dismiss notice">
            <X size={14} />
          </button>
        </div>
      ) : null}

      {!template && !creating ? (
        <div className="review-empty">
          <AlertTriangle size={22} className="review-icon" />
          <span>No editable template is registered.</span>
        </div>
      ) : (
        <div className="template-editor">
          <div className="template-editor-summary">
            <FileText size={25} className="mint" />
            <div className="summary-info">
              {creating ? (
                <>
                  <label className="template-field">
                    Template ID
                    <input
                      value={newTemplateId}
                      onChange={(event) => setNewTemplateId(event.target.value)}
                      placeholder="frontend-review"
                    />
                  </label>
                  <label className="template-field">
                    Template name
                    <input
                      value={newTemplateName}
                      onChange={(event) => setNewTemplateName(event.target.value)}
                      placeholder="Frontend review"
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="template-title-row">
                    <strong>{template!.name}</strong>
                    <span className="template-version-badge">v{template!.selected_version}</span>
                    {template!.id === "builtin-pristine" ? (
                      <span className="status-pill pristine" title="Built-in clean slate baseline">
                        Pristine Baseline
                      </span>
                    ) : isDirty ? (
                      <span className="status-pill dirty" title="Unsaved membership edits">
                        Unsaved Edits
                      </span>
                    ) : (
                      <span className="status-pill insync" title="Template saved and in sync">
                        In Sync
                      </span>
                    )}
                  </div>
                  <small>
                    {editable
                      ? `${selectedSkillIds.length} selected skill${
                          selectedSkillIds.length === 1 ? "" : "s"
                        } · next save creates v${template!.selected_version + 1}`
                      : "Pristine intentionally contains no managed skills"}
                  </small>
                </>
              )}
            </div>

            {!creating && template && template.id !== "builtin-pristine" ? (
              <div className="template-export-action">
                <button
                  type="button"
                  className="export-recipe-btn"
                  onClick={handleExportRecipe}
                  disabled={exportingRecipe}
                  title="1-Click export template configuration as a portable recipe.json"
                >
                  {exportingRecipe ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  <span>{exportingRecipe ? "Exporting…" : "Export as Recipe"}</span>
                </button>
              </div>
            ) : null}
          </div>

          {/* Quick-Filter Toolbar for Skills */}
          <div className="template-filter-section">
            <FilterToolbar
              invocationMode={invocationFilter}
              onInvocationModeChange={setInvocationFilter}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              totalCount={skills.length}
              filteredCount={filteredSkills.length}
              entityName="skills"
              showInvocationChips={true}
              showProviderFilter={false}
              showViewToggle={false}
              searchPlaceholder="Filter registry skills by name or keyword..."
              extraActions={
                editable ? (
                  <div className="template-bulk-actions">
                    <button
                      type="button"
                      className="quiet-btn-sm"
                      onClick={() => selectAllFiltered(filteredSkills)}
                      title="Select all visible skills"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="quiet-btn-sm"
                      onClick={() => deselectAllFiltered(filteredSkills)}
                      title="Deselect all visible skills"
                    >
                      Clear
                    </button>
                  </div>
                ) : null
              }
            />
          </div>

          {filteredSkills.length === 0 ? (
            <div className="review-empty">
              <span>No registry skills match the filter criteria.</span>
            </div>
          ) : (
            <div className="template-skill-list">
              {filteredSkills.map((skill) => {
                const selected = selectedSkillIds.includes(skill.id);
                const invMode = skill.invocation_mode ?? "unspecified";

                return (
                  <label
                    className={selected ? "template-skill selected" : "template-skill"}
                    key={skill.id}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!editable || saving}
                      onChange={() => toggleSkill(skill.id)}
                    />
                    <div>
                      <div className="template-skill-title">
                        <strong>{skill.skill_name}</strong>
                        <InvocationBadge mode={invMode} showTooltip={true} />
                        <DeliveryPathIndicator
                          providerId={providerId}
                          skillName={skill.skill_name}
                          showTooltip={true}
                        />
                      </div>
                      <small>
                        {skill.description ?? `Revision ${skill.source_revision_id.slice(0, 12)}`}
                      </small>
                    </div>
                    <span>{selected ? "Included" : "Available"}</span>
                  </label>
                );
              })}
            </div>
          )}

          {editable ? (
            <button
              className="primary-action template-save"
              type="submit"
              disabled={
                saving ||
                selectedSkillIds.length === 0 ||
                (creating && (!newTemplateId.trim() || !newTemplateName.trim()))
              }
              onClick={() => {
                if (creating) {
                  onCreate(newTemplateId, newTemplateName, selectedSkillIds).then((created) => {
                    if (created) setCreating(false);
                  });
                } else {
                  onSave(template!.id, selectedSkillIds);
                }
              }}
            >
              {saving ? <LoaderCircle size={20} className="spin" /> : <Check size={20} />}{" "}
              {saving
                ? "Saving template…"
                : creating
                  ? "Create template v1"
                  : `Save template v${template!.selected_version + 1}`}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
