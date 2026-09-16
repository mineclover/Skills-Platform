import React, { useState } from "react";
import {
  Bug,
  Compass,
  Layers,
  Code2,
  Paintbrush,
  Sparkles,
  CheckCircle2,
  Shield,
  ArrowRight,
  Search,
  Lock,
  Globe,
  Users,
  ExternalLink,
  ChevronRight,
  Terminal,
  FileCode,
  Zap,
} from "lucide-react";
import {
  EXPERT_PERSONAS,
  COMMON_ROUTING_SCENARIOS,
  type ExpertPersona,
  type PersonaSkill,
  type KnowledgeType,
} from "../personas-data";

const ICON_MAP: Record<string, React.ElementType> = {
  Bug,
  Compass,
  Layers,
  Code2,
  Paintbrush,
  Sparkles,
  CheckCircle2,
};

function renderIcon(iconName: string, size = 18, color?: string) {
  const IconComponent = ICON_MAP[iconName] || Users;
  return <IconComponent size={size} color={color} />;
}

export function PersonaWorkspace() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("debugging-specialist");
  const [viewMode, setViewMode] = useState<"persona" | "matrix" | "advisor">("persona");
  const [knowledgeFilter, setKnowledgeFilter] = useState<"all" | "specialized" | "general">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScenarioIdx, setSelectedScenarioIdx] = useState<number>(0);

  const selectedPersona =
    EXPERT_PERSONAS.find((p) => p.id === selectedPersonaId) || EXPERT_PERSONAS[0];

  const filteredSkills = selectedPersona.skills.filter((skill) => {
    if (knowledgeFilter !== "all" && skill.knowledgeType !== knowledgeFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        skill.skillName.toLowerCase().includes(q) ||
        skill.skillId.toLowerCase().includes(q) ||
        skill.routingReason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const specializedSkills = filteredSkills.filter((s) => s.knowledgeType === "specialized");
  const generalSkills = filteredSkills.filter((s) => s.knowledgeType === "general");

  const currentScenario = COMMON_ROUTING_SCENARIOS[selectedScenarioIdx];
  const scenarioPersona = EXPERT_PERSONAS.find((p) => p.id === currentScenario.recommendedPersonaId);
  const secondaryPersona = currentScenario.secondaryPersonaId
    ? EXPERT_PERSONAS.find((p) => p.id === currentScenario.secondaryPersonaId)
    : null;

  // Extract all unique skills across all personas for the matrix view
  const allUniqueSkills = Array.from(
    new Map(
      EXPERT_PERSONAS.flatMap((p) =>
        p.skills.map((s) => [s.skillId, { id: s.skillId, name: s.skillName }])
      )
    ).values()
  );

  return (
    <div className="persona-workspace">
      {/* 1. Header & Navigation Controls */}
      <header className="persona-header">
        <div className="persona-header-title-block">
          <div className="persona-header-badge">
            <Users size={14} />
            <span>Expert Persona Network</span>
          </div>
          <h1>전문가 페르소나 연계 스킬 카탈로그</h1>
          <p className="persona-header-description">
            스킬을 7대 특화 전문가의 <strong>직무 고유 지식 (Domain-Specific)</strong>과{" "}
            <strong>범용 공유 지식 (Cross-Functional)</strong>으로 체계화하여,
            <br />
            <em>“아, 이 스킬은 이 전문가에게 가면 훨씬 더 전문적으로 분석받을 수 있구나!”</em>를 명확히
            판별하고 협업을 강화합니다.
          </p>
        </div>

        <div className="persona-header-controls">
          <div className="persona-view-toggle">
            <button
              type="button"
              className={`toggle-btn ${viewMode === "persona" ? "active" : ""}`}
              onClick={() => setViewMode("persona")}
            >
              <Users size={15} />
              <span>페르소나 심층 탐색</span>
            </button>
            <button
              type="button"
              className={`toggle-btn ${viewMode === "advisor" ? "active" : ""}`}
              onClick={() => setViewMode("advisor")}
            >
              <Zap size={15} />
              <span>전문가 라우팅 어드바이저</span>
            </button>
            <button
              type="button"
              className={`toggle-btn ${viewMode === "matrix" ? "active" : ""}`}
              onClick={() => setViewMode("matrix")}
            >
              <Layers size={15} />
              <span>전체 지식 매트릭스</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Persona Showcase Ribbon (Visible in persona mode) */}
      {viewMode === "persona" && (
        <div className="persona-ribbon-container">
          <div className="persona-ribbon">
            {EXPERT_PERSONAS.map((persona) => {
              const isSelected = persona.id === selectedPersona.id;
              const specCount = persona.skills.filter((s) => s.knowledgeType === "specialized").length;
              const genCount = persona.skills.filter((s) => s.knowledgeType === "general").length;

              return (
                <button
                  key={persona.id}
                  type="button"
                  className={`persona-ribbon-card ${isSelected ? "selected" : ""}`}
                  style={{
                    borderColor: isSelected ? persona.color : "transparent",
                    background: isSelected ? persona.badgeBg : "var(--card-bg, #1a1e24)",
                  }}
                  onClick={() => setSelectedPersonaId(persona.id)}
                >
                  <div
                    className="persona-card-icon-wrap"
                    style={{ background: persona.color + "22", color: persona.color }}
                  >
                    {renderIcon(persona.avatarIcon, 20, persona.color)}
                  </div>
                  <div className="persona-card-meta">
                    <div className="persona-card-name" style={{ color: isSelected ? persona.color : undefined }}>
                      {persona.name}
                    </div>
                    <div className="persona-card-tagline">{persona.primaryDomain}</div>
                    <div className="persona-card-counts">
                      <span className="count-spec" title="직무 고유 지식">
                        🔒 고유 {specCount}
                      </span>
                      <span className="count-gen" title="범용 공유 지식">
                        🌐 범용 {genCount}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Main Body based on View Mode */}
      {viewMode === "persona" && (
        <div className="persona-detail-container">
          {/* Persona Hero Profile Banner */}
          <div
            className="persona-hero-card"
            style={{
              borderLeft: `4px solid ${selectedPersona.color}`,
              background: `linear-gradient(135deg, ${selectedPersona.badgeBg} 0%, rgba(20, 24, 30, 0.7) 100%)`,
            }}
          >
            <div className="persona-hero-header">
              <div
                className="persona-hero-avatar"
                style={{ background: selectedPersona.color + "26", color: selectedPersona.color }}
              >
                {renderIcon(selectedPersona.avatarIcon, 28, selectedPersona.color)}
              </div>
              <div className="persona-hero-titles">
                <div className="persona-hero-tagline-badge" style={{ color: selectedPersona.color }}>
                  {selectedPersona.primaryDomain}
                </div>
                <h2>{selectedPersona.name}</h2>
                <span className="persona-english-title">{selectedPersona.englishTitle}</span>
              </div>
            </div>

            <p className="persona-mission-statement">{selectedPersona.mission}</p>

            <div className="persona-collaborators-row">
              <span className="collaborators-label">🤝 주요 연계 협력 전문가:</span>
              <div className="collaborators-list">
                {selectedPersona.collaboratesWith.map((collabId) => {
                  const target = EXPERT_PERSONAS.find((p) => p.id === collabId);
                  if (!target) return null;
                  return (
                    <button
                      key={collabId}
                      type="button"
                      className="collaborator-chip"
                      onClick={() => setSelectedPersonaId(collabId)}
                      title={`${target.name} 프로필로 이동`}
                    >
                      {renderIcon(target.avatarIcon, 13, target.color)}
                      <span>{target.name}</span>
                      <ArrowRight size={11} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="persona-filter-bar">
            <div className="knowledge-type-filters">
              <button
                type="button"
                className={`filter-pill ${knowledgeFilter === "all" ? "active" : ""}`}
                onClick={() => setKnowledgeFilter("all")}
              >
                전체 스킬 ({selectedPersona.skills.length})
              </button>
              <button
                type="button"
                className={`filter-pill spec ${knowledgeFilter === "specialized" ? "active" : ""}`}
                onClick={() => setKnowledgeFilter("specialized")}
              >
                🔒 직무 고유 지식 (
                {selectedPersona.skills.filter((s) => s.knowledgeType === "specialized").length})
              </button>
              <button
                type="button"
                className={`filter-pill gen ${knowledgeFilter === "general" ? "active" : ""}`}
                onClick={() => setKnowledgeFilter("general")}
              >
                🌐 범용 공유 지식 (
                {selectedPersona.skills.filter((s) => s.knowledgeType === "general").length})
              </button>
            </div>

            <div className="persona-search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="스킬명 또는 연계 이유 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Skills Split Sections */}
          <div className="skills-split-layout">
            {/* 1. 직무 고유 지식 Section */}
            {(knowledgeFilter === "all" || knowledgeFilter === "specialized") && (
              <section className="knowledge-section specialized-section">
                <div className="section-header">
                  <div className="section-title">
                    <Lock size={16} className="text-amber" />
                    <h3>직무 고유 지식 (Domain-Specific Knowledge)</h3>
                  </div>
                  <span className="section-badge spec-badge">
                    {specializedSkills.length}개 정본 스킬
                  </span>
                </div>
                <p className="section-desc">
                  이 전문가 페르소나만이 보유하고 있는 독보적이고 깊이 있는 도메인 정본 지식입니다.
                  복합 이슈 해결 시 이 전문가에게 라우팅해야 깊은 진단과 무손실 처리를 받을 수 있습니다.
                </p>

                {specializedSkills.length === 0 ? (
                  <div className="empty-skills-msg">검색 조건에 맞는 직무 고유 지식이 없습니다.</div>
                ) : (
                  <div className="skills-grid">
                    {specializedSkills.map((skill) => (
                      <SkillCard
                        key={skill.skillId}
                        skill={skill}
                        personaColor={selectedPersona.color}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 2. 범용 공유 지식 Section */}
            {(knowledgeFilter === "all" || knowledgeFilter === "general") && (
              <section className="knowledge-section general-section">
                <div className="section-header">
                  <div className="section-title">
                    <Globe size={16} className="text-cyan" />
                    <h3>범용 공유 지식 (Cross-Functional Knowledge)</h3>
                  </div>
                  <span className="section-badge gen-badge">{generalSkills.length}개 공유 스킬</span>
                </div>
                <p className="section-desc">
                  다른 여러 전문가들과 공통으로 차용하며 프로젝트 기본선(Baseline)을 유지하기 위해
                  상호 운용되는 기반 스킬입니다.
                </p>

                {generalSkills.length === 0 ? (
                  <div className="empty-skills-msg">검색 조건에 맞는 범용 공유 지식이 없습니다.</div>
                ) : (
                  <div className="skills-grid">
                    {generalSkills.map((skill) => (
                      <SkillCard
                        key={skill.skillId}
                        skill={skill}
                        personaColor={selectedPersona.color}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {/* 4. Expert Routing Advisor View */}
      {viewMode === "advisor" && (
        <div className="routing-advisor-container">
          <div className="advisor-hero">
            <Zap size={24} className="text-amber" />
            <div>
              <h2>전문가 연계 라우팅 어드바이저 (Expert Routing Advisor)</h2>
              <p>
                작업 맥락과 난제(Challenge)를 선택하면, 최적의 깊이 있는 분석을 제공할 수 있는
                <strong>주관 전문가 페르소나</strong>와 <strong>협업 페르소나</strong>를 자동으로
                추천합니다.
              </p>
            </div>
          </div>

          <div className="advisor-grid">
            <div className="scenario-selector-panel">
              <h3>대표적 복합 작업 시나리오 선택</h3>
              <div className="scenario-buttons-list">
                {COMMON_ROUTING_SCENARIOS.map((scenario, idx) => {
                  const isCurrent = idx === selectedScenarioIdx;
                  return (
                    <button
                      key={scenario.taskKeyword}
                      type="button"
                      className={`scenario-btn ${isCurrent ? "active" : ""}`}
                      onClick={() => setSelectedScenarioIdx(idx)}
                    >
                      <span className="scenario-number">{idx + 1}</span>
                      <span className="scenario-text">{scenario.taskKeyword}</span>
                      <ChevronRight size={15} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="advisor-result-card">
              <div className="advisor-result-badge">
                <Shield size={14} />
                <span>추천 전문가 연계 가이드</span>
              </div>

              <div className="advisor-task-header">
                <span className="task-label">해결 대상 문제:</span>
                <h4 className="task-title">“{currentScenario.taskKeyword}”</h4>
              </div>

              <div className="recommended-pair-container">
                {/* Primary Specialist */}
                {scenarioPersona && (
                  <div
                    className="lead-specialist-box"
                    style={{ borderColor: scenarioPersona.color, background: scenarioPersona.badgeBg }}
                  >
                    <div className="lead-tag" style={{ background: scenarioPersona.color }}>
                      👑 1순위 주관 전문가
                    </div>
                    <div className="specialist-avatar" style={{ color: scenarioPersona.color }}>
                      {renderIcon(scenarioPersona.avatarIcon, 24, scenarioPersona.color)}
                    </div>
                    <h4>{scenarioPersona.name}</h4>
                    <span className="specialist-role">{scenarioPersona.englishTitle}</span>
                    <button
                      type="button"
                      className="inspect-persona-btn"
                      onClick={() => {
                        setSelectedPersonaId(scenarioPersona.id);
                        setViewMode("persona");
                      }}
                    >
                      프로필 및 스킬 보기 <ArrowRight size={12} />
                    </button>
                  </div>
                )}

                {/* Secondary Collaborator */}
                {secondaryPersona && (
                  <div className="secondary-specialist-box">
                    <div className="secondary-tag">🤝 2순위 협업 전문가</div>
                    <div className="specialist-avatar" style={{ color: secondaryPersona.color }}>
                      {renderIcon(secondaryPersona.avatarIcon, 24, secondaryPersona.color)}
                    </div>
                    <h4>{secondaryPersona.name}</h4>
                    <span className="specialist-role">{secondaryPersona.englishTitle}</span>
                    <button
                      type="button"
                      className="inspect-persona-btn"
                      onClick={() => {
                        setSelectedPersonaId(secondaryPersona.id);
                        setViewMode("persona");
                      }}
                    >
                      프로필 및 스킬 보기 <ArrowRight size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Rationale Callout */}
              <div className="advisor-rationale-box">
                <div className="rationale-header">
                  <Sparkles size={16} className="text-amber" />
                  <span>왜 이 전문가에게 가야 하는가? (Expert Advantage Rationale)</span>
                </div>
                <p>{currentScenario.expertAdvantageRationale}</p>
                <div className="recommended-skill-pill">
                  <FileCode size={13} />
                  <span>핵심 활용 스킬:</span>
                  <strong>{currentScenario.primarySkillId}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Global Knowledge Matrix View */}
      {viewMode === "matrix" && (
        <div className="knowledge-matrix-container">
          <div className="matrix-header">
            <h3>스킬-페르소나 전역 지식 매트릭스</h3>
            <p>
              어떤 스킬이 특정 전문가의 <strong>직무 고유 지식(🔒)</strong>인지, 여러 전문가가 공유하는{" "}
              <strong>범용 지식(🌐)</strong>인지를 한눈에 대조할 수 있습니다.
            </p>
          </div>

          <div className="matrix-table-wrap">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th className="skill-col">스킬 ID & 명칭</th>
                  {EXPERT_PERSONAS.map((p) => (
                    <th key={p.id} className="persona-col" style={{ borderTop: `3px solid ${p.color}` }}>
                      <div className="col-persona-header">
                        {renderIcon(p.avatarIcon, 14, p.color)}
                        <span>{p.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allUniqueSkills.map((sk) => (
                  <tr key={sk.id}>
                    <td className="skill-meta-cell">
                      <strong>{sk.name}</strong>
                      <span className="skill-id-code">{sk.id}</span>
                    </td>
                    {EXPERT_PERSONAS.map((p) => {
                      const binding = p.skills.find((s) => s.skillId === sk.id);
                      if (!binding) {
                        return (
                          <td key={p.id} className="matrix-cell empty">
                            <span className="empty-dash">-</span>
                          </td>
                        );
                      }
                      const isSpec = binding.knowledgeType === "specialized";
                      return (
                        <td
                          key={p.id}
                          className={`matrix-cell ${isSpec ? "cell-spec" : "cell-gen"}`}
                          title={binding.routingReason}
                        >
                          <div className="matrix-cell-content">
                            <span className={`cell-badge ${isSpec ? "badge-spec" : "badge-gen"}`}>
                              {isSpec ? "🔒 고유" : "🌐 범용"}
                            </span>
                            <span className="level-indicator">L{binding.specializationLevel}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill, personaColor }: { skill: PersonaSkill; personaColor: string }) {
  const isSpec = skill.knowledgeType === "specialized";

  return (
    <div className={`persona-skill-card ${isSpec ? "card-specialized" : "card-general"}`}>
      <div className="card-top-row">
        <span className={`type-tag ${isSpec ? "type-spec" : "type-gen"}`}>
          {isSpec ? "🔒 직무 고유 지식" : "🌐 범용 공유 지식"}
        </span>
        <span className="level-badge" title={`숙련/권위 레벨: Level ${skill.specializationLevel}`}>
          Level {skill.specializationLevel} {skill.specializationLevel === 3 ? "권위" : "숙련"}
        </span>
      </div>

      <h4 className="skill-title">{skill.skillName}</h4>
      <div className="skill-id-sub">{skill.skillId}</div>

      {/* Rationale Callout: 아, 이 스킬은 이 전문가한테 가야 하는구나! */}
      <div className="routing-callout">
        <div className="routing-callout-label" style={{ color: personaColor }}>
          <Sparkles size={12} />
          <span>전문가 연계 핵심 역량</span>
        </div>
        <p className="routing-callout-text">{skill.routingReason}</p>
      </div>

      {/* Companion Hooks or Assets Footer */}
      {(skill.companionHooks?.length || skill.authoritativeAssets?.length) ? (
        <div className="card-assets-footer">
          {skill.companionHooks?.map((h) => (
            <span key={h} className="asset-tag hook-tag" title="연계 컴패니언 훅">
              <Shield size={11} />
              <span>{h}</span>
            </span>
          ))}
          {skill.authoritativeAssets?.map((a) => (
            <span key={a} className="asset-tag file-tag" title="핵심 정본 자산">
              <Terminal size={11} />
              <span>{a.split("/").pop()}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
