import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, FileText, LoaderCircle } from "lucide-react";
import type { RegistrySkill, RemotePreset } from "../types";

export function TemplateWorkspace({
  presets,
  skills,
  selectedTemplateId,
  onSelectTemplate,
  onSave,
  onCreate,
  saving,
}: {
  presets: RemotePreset[];
  skills: RegistrySkill[];
  selectedTemplateId: string | null;
  onSelectTemplate: (id: string) => void;
  onSave: (presetId: string, skillIds: string[]) => void;
  onCreate: (id: string, name: string, skillIds: string[]) => Promise<boolean>;
  saving: boolean;
}) {
  const template =
    presets.find((item) => item.id === selectedTemplateId) ??
    presets.find((item) => item.id !== "builtin-pristine") ??
    null;
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");

  useEffect(() => {
    if (!creating) setSelectedSkillIds(template?.registry_skill_ids ?? []);
  }, [creating, template?.id, template?.selected_version]);

  const toggleSkill = useCallback((skillId: string) => {
    setSelectedSkillIds((current) =>
      current.includes(skillId) ? current.filter((id) => id !== skillId) : [...current, skillId],
    );
  }, []);

  const editable = creating || (template !== null && template.id !== "builtin-pristine");

  const beginCreate = () => {
    setCreating(true);
    setNewTemplateId("");
    setNewTemplateName("");
    setSelectedSkillIds([]);
  };

  const cancelCreate = () => {
    setCreating(false);
    setSelectedSkillIds(template?.registry_skill_ids ?? []);
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
            <label className="template-picker">
              <span>Template</span>
              <select
                value={template?.id ?? ""}
                onChange={(event) => onSelectTemplate(event.target.value)}
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
      {!template && !creating ? (
        <div className="review-empty">
          <AlertTriangle size={22} className="review-icon" />
          <span>No editable template is registered.</span>
        </div>
      ) : (
        <div className="template-editor">
          <div className="template-editor-summary">
            <FileText size={25} className="mint" />
            <div>
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
                  <strong>{template!.name}</strong>
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
          </div>
          <div className="template-skill-list">
            {skills.map((skill) => {
              const selected = selectedSkillIds.includes(skill.id);
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
                      {skill.invocation_mode && skill.invocation_mode !== "unspecified" ? (
                        <span className={`invocation-pill ${skill.invocation_mode === "user_invoked" ? "user" : skill.invocation_mode === "model_invoked" ? "model" : "hybrid"}`}>
                          {skill.invocation_mode === "user_invoked" ? "👤 User" : skill.invocation_mode === "model_invoked" ? "🤖 Model" : "🔀 Hybrid"}
                        </span>
                      ) : null}
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
