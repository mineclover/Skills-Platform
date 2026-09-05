---
name: svg-authoring
description: >-
  Expert guide, mathematical formulas, recipes, and validation procedures for authoring,
  generating, and debugging raw SVG vector graphics, diagrams, and data visualizations.
  Grounded in W3C SVG 1.1 (2nd Edition) and SVG 2 specifications.
  Use whenever creating or modifying SVG graphics, charts (pie, donut, bar, scatter, radar),
  curves (bezier, sankey, streamgraph), topological diagrams, gauge needles, or visual elements.
version: 1.0.0

---

# SVG Authoring & Vector Engineering Standard Guide
> **표준 규격 근거**: [W3C Scalable Vector Graphics (SVG) 1.1 (Second Edition)](https://www.w3.org/TR/SVG11/) & [W3C SVG 2 Recommendation Draft](https://www.w3.org/TR/SVG2/)

이 스킬은 순수 SVG(Scalable Vector Graphics) 벡터 그래픽, 차트, 다이어그램, 계측 기호를 기하학적·수학적으로 정밀하게 작성하고, 브라우저 렌더링 결함(호 왜곡, 핀 찌그러짐, 회전 피벗 이탈, 텍스트 잘림, 필터 클리핑, 테마 부적응)을 사전에 원천 차단하기 위한 전문가 엔지니어링 표준 가이드입니다.

---

## 1. W3C 표준 문법 및 XML 정형성 규격 (Core XML Well-Formedness)

SVG는 W3C XML 1.0 권고안을 엄격히 준수하는 벡터 마크업 언어입니다.

### 1.1 루트 `<svg>` 태그 4대 필수 속성
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" width="100%" height="100%">
```
- `xmlns="http://www.w3.org/2000/svg"` (W3C Section 5.1.2): XML 네임스페이스 선언 누락 시 단독 `.svg` 파일 렌더링 및 `<img>` 태그 로드 실패.
- `viewBox="min-x min-y width height"` (W3C Section 7.7): 사용자 좌표계(User Space)를 정의하는 불변 기준 프레임.
- `width="100%"`, `height="100%"`: 뷰포트 반응형 스케일링 보장.

### 1.2 셀프 클로징(Self-Closing) 및 태그 완결성
- 내용이 없는 단일 요소는 반드시 `/>`로 닫아야 합니다:
  - ✅ `<rect x="10" y="10" width="100" height="50" rx="4" fill="#fff" />`
  - ✅ `<circle cx="50" cy="50" r="20" fill="#000" />`
  - ✅ `<path d="M 0 0 L 10 10 Z" fill="none" stroke="#ccc" />`
  - ❌ `<rect ... >` (닫는 태그 누락 $\to$ XML 파서 오류 및 렌더링 중단)
- 내용이 있는 요소는 반드시 짝을 맞추어 닫습니다:
  - `<text x="50" y="50">라벨</text>`, `<g id="group"> ... </g>`

### 1.3 XML 엔티티 이스케이프 (W3C XML 1.0 Section 4.6)
- 텍스트 노드 및 속성 값에 예약 문자가 포함될 경우 반드시 엔티티로 치환:
  - `&` $\to$ `&amp;`
  - `<` $\to$ `&lt;`
  - `>` $\to$ `&gt;`
  - `"` $\to$ `&quot;` (속성 값 내부)
- *(참고: `<!-- ... -->` XML 주석 내부의 `&`는 리터럴 데이터로 허용됨)*

### 1.4 프레젠테이션 어트리뷰트 우선 원칙 (W3C Section 6.4)
- 인라인 `style="fill: red; stroke: blue;"` 대신 네이티브 프레젠테이션 어트리뷰트(`fill="red"` `stroke="blue"`)를 사용합니다.
- 파싱 오버헤드가 적고, 디자인 시스템 테마 토큰(`T.cardBg`, `T.rose` 등) 주입 및 정규식 무결성 검증에 유리합니다.

---

## 2. W3C 좌표계 및 아핀 변환 행렬 (Coordinate Systems & Transforms)

### 2.1 화면 좌표계와 12시 기준 회전각 (W3C Section 7.2)
- SVG는 $Y$축이 **아래쪽으로 증가**합니다 (3시 $= 0^\circ$, 6시 $= 90^\circ$, 9시 $= 180^\circ$, 12시 $= 270^\circ$ 또는 $-90^\circ$).
- 차트(파이/도넛/게이지)는 통상 **12시 방향**에서 시작하므로 $-90^\circ$ 오프셋을 적용합니다:
  $$\theta_{\text{rad}} = (\text{deg} - 90) \times \frac{\pi}{180}$$
  $$x = c_x + R \cdot \cos(\theta_{\text{rad}}), \quad y = c_y + R \cdot \sin(\theta_{\text{rad}})$$

### 2.2 ⚠️ 회전 변환 `rotate(angle, cx, cy)` 피벗 중심 3-인자 필수화 (W3C Section 7.5)
- `transform="rotate(deg)"` (1개 인자): **원점 $(0, 0)$ 기준 회전**입니다!
  - ❌ **치명적 결함**: 게이지 바늘, 회전 포인터에서 `rotate(45)`만 쓰면 화면 좌상단 $(0,0)$을 축으로 회전하여 바늘이 화면 밖으로 날아갑니다.
- ✅ **W3C 표준 문법**: 반드시 **회전 피벗 중심점 $(cx, cy)$를 함께 지정**합니다:
  $$\mathbf{M}_{\text{rotate}} = \mathbf{T}(cx, cy) \cdot \mathbf{R}(\theta) \cdot \mathbf{T}(-cx, -cy)$$
  ```xml
  <!-- 중심 (180, 155)를 피벗으로 35도 회전 -->
  <g transform="rotate(35, 180, 155)">
    <path d="M 177.5 155 L 179.5 95 L 180 92 L 180.5 95 L 182.5 155 Z" fill="${T.rose}" />
    <circle cx="180" cy="155" r="5" fill="${T.ink}" />
  </g>
  ```

---

## 3. Path 명령어 문법 및 파라미터 규격 (W3C Section 8.3.8)

Path 데이터 `d="..."`는 명령어별로 고유한 수치 인자 수(Arity)를 엄격히 요구합니다:

명령어 | 이름 | 인자 수 (Arity) | 파라미터 규격 | 설명
:---|:---|:---:|:---|:---
`M` / `m` | Move To | **2** | `x y` | 펜 이동 (새 서브패스 개시)
`L` / `l` | Line To | **2** | `x y` | 현재 위치에서 $(x, y)$까지 직선
`H` / `h` | Horizontal Line | **1** | `x` | 현재 $Y$ 고정 수평선
`V` / `v` | Vertical Line | **1** | `y` | 현재 $X$ 고정 수직선
`C` / `c` | Cubic Bezier | **6** | `x1 y1 x2 y2 x y` | 3차 베지에 (시작 제어점, 끝 제어점, 종착점)
`S` / `s` | Smooth Cubic | **4** | `x2 y2 x y` | 매끄러운 3차 베지에 (이전 제어점 대칭 반사)
`Q` / `q` | Quadratic Bezier | **4** | `x1 y1 x y` | 2차 베지에 (단일 제어점, 종착점)
`T` / `t` | Smooth Quad | **2** | `x y` | 매끄러운 2차 베지에 (이전 제어점 대칭 반사)
`A` / `a` | Elliptical Arc | **7** | `rx ry x-rot fA fS x y` | 타원 호 (반지름2, 회전각1, 대호플래그1, 스윕플래그1, 종점2)
`Z` / `z` | Close Path | **0** | 없음 | 서브패스 시작점(`M`)으로 직선을 그어 닫음

> [!WARNING]
> 인자 수가 일치하지 않으면 W3C 명세에 따라 브라우저 SVG 파서가 해당 패스 전체의 렌더링을 드롭(중단)합니다.

---

## 4. W3C 타원 호(Elliptical Arc) 정복 (W3C Appendix F.6)

### 4.1 파라미터 구조
```
A rx ry x-axis-rotation large-arc-flag sweep-flag x y
```
- `rx, ry`: 타원 가로/세로 반지름 (원형 호는 `rx = ry = R`).
- `x-axis-rotation`: 타원의 회전 각도 (원형 호는 항상 `0`).
- `large-arc-flag` ($f_A$): 각도 차이 $\Delta\theta > 180^\circ$이면 `1`, $\le 180^\circ$이면 `0`.
- `sweep-flag` ($f_S$): 시계 방향(Clockwise)이면 `1`, 반시계 방향(Counter-CW)이면 `0`.
- `x, y`: 호의 종착점 좌표.

### 4.2 ⚠️ 호 결함 방지 핵심 수칙
1. **도넛 링(Ring Sector) 작성 시 내경 호는 `sweep=0` 필수 반전!**
   - 외경 호(바깥쪽 전개): 시계 방향 $\to$ `sweep = 1`
   - 내경 호(안쪽 복귀): 반시계 방향 $\to$ `sweep = 0`
   - ❌ **오류**: 내경 호에도 `sweep = 1`을 주면 아치가 안쪽으로 오목하게 파고드는 '역호(Inverted Arc)' 결함 발생.
2. **$\Lambda$-반지름 스케일링 안전율 (W3C Section F.6.6)**:
   - 두 점 사이의 현의 길이가 $2R$을 미세하게 초과하면 타원이 깨질 수 있으므로, 반지름 $R$은 기하학적 계산값과 일치하거나 $0.01$ 여유를 둡니다.

---

## 5. 실전 검증된 수학적 기하 레시피 (Battle-Tested Recipes)

### 5.1 위치 핀 / 마커 정규 공식 (Teardrop Location Pin) — PE-002 표준
상단 원형 돔과 하단 침 끝이 매끄럽게 연결되는 해석기하학 접선 공식:

- **기하 조건**: 바닥 침 끝 $(tipX, tipY)$, 원형 헤드 중심 $(tipX, tipY - L)$, 헤드 반경 $R$.
- **접선 반각**: $\sin\alpha = \frac{R}{L}$, $\cos\alpha = \sqrt{1 - \sin^2\alpha}$.
- **표준 치수 ($L = 32, R = 14$)**:
  - $dx = R \cos\alpha \approx 12.6$, $dy = R \sin\alpha \approx 6.1$
  - 접점: $(\pm 12.6, -32 + 6.1) = (\pm 12.6, -25.9)$
- **완성된 정규 Path 수식**:
  ```xml
  <path d="M 0 0 L -12.6 -25.9 A 14 14 0 1 1 12.6 -25.9 Z" fill="${T.rose}" />
  <circle cx="0" cy="-32" r="8.5" fill="${T.cardBg}" />
  <text x="0" y="-28.5" font-size="10.5" font-weight="900" fill="${T.rose}" text-anchor="middle">3</text>
  ```
> [!CAUTION]
> 베지에 곡선(`C -15 -15 ...`)으로 어설프게 흉내 내면 상단 돔이 불꽃처럼 뾰족하게 찌그러지는 '양파/불꽃 결함'이 발생합니다. 반드시 위 원호 접선 공식을 사용하십시오.

---

### 5.2 반원 게이지 차트 및 회전 바늘 (Gauge Chart & Needle) — PE-154, PE-155 표준
- **게이지 호 트랙**: 중심 $(180, 155)$, 외경 $65$, 내경 $50$, $-90^\circ \sim +90^\circ$ ($180^\circ$ 반원):
  ```xml
  <!-- 배경 트랙 -->
  <path d="M 115 155 A 65 65 0 0 1 245 155 L 230 155 A 50 50 0 0 0 130 155 Z" fill="${T.border}" />
  <!-- 값 채우기 (예: 60% 활성 게이지) -->
  <path d="M 115 155 A 65 65 0 0 1 226.7 109.8 L 215.9 120.2 A 50 50 0 0 0 130 155 Z" fill="${T.primary}" />
  ```
- **회전 바늘**:
  ```xml
  <g transform="rotate(35, 180, 155)">
    <path d="M 177.5 155 L 179.5 95 L 180 92 L 180.5 95 L 182.5 155 Z" fill="${T.rose}" />
    <circle cx="180" cy="155" r="5" fill="${T.ink}" />
    <circle cx="180" cy="155" r="2" fill="#ffffff" />
  </g>
  ```

---

### 5.3 도넛 링 아치 (Donut Ring Arch) 생성 수식
```javascript
function createDonutArch(cx, cy, Ro, Ri, startDeg, endDeg) {
  const toRad = deg => (deg - 90) * Math.PI / 180;
  const delta = (endDeg - startDeg + 360) % 360;
  const fA = delta > 180 ? 1 : 0;

  const xo1 = (cx + Ro * Math.cos(toRad(startDeg))).toFixed(1);
  const yo1 = (cy + Ro * Math.sin(toRad(startDeg))).toFixed(1);
  const xo2 = (cx + Ro * Math.cos(toRad(endDeg))).toFixed(1);
  const yo2 = (cy + Ro * Math.sin(toRad(endDeg))).toFixed(1);

  const xi1 = (cx + Ri * Math.cos(toRad(startDeg))).toFixed(1);
  const yi1 = (cy + Ri * Math.sin(toRad(startDeg))).toFixed(1);
  const xi2 = (cx + Ri * Math.cos(toRad(endDeg))).toFixed(1);
  const yi2 = (cy + Ri * Math.sin(toRad(endDeg))).toFixed(1);

  return `M ${xo1} ${yo1} A ${Ro} ${Ro} 0 ${fA} 1 ${xo2} ${yo2} L ${xi2} ${yi2} A ${Ri} ${Ri} 0 ${fA} 0 ${xi1} ${yi1} Z`;
}
```

---

### 5.4 생키/알루비얼 부드러운 가중 흐름 밴드 (Sankey Bezier Ribbon)
수평 노드 사이를 잇는 3차 베지에 리본:
```javascript
function createSankeyRibbon(x1, y1Top, y1Bot, x2, y2Top, y2Bot) {
  const mx = ((x1 + x2) / 2).toFixed(1);
  return `M ${x1} ${y1Top} C ${mx} ${y1Top}, ${mx} ${y2Top}, ${x2} ${y2Top} ` +
         `L ${x2} ${y2Bot} C ${mx} ${y2Bot}, ${mx} ${y1Bot}, ${x1} ${y1Bot} Z`;
}
```

---

## 6. 도메인 시맨틱 및 메타데이터 정합성 원칙 (Semantic Grounding)

시각 요소 설계 시 요소의 이름만 보고 연상되는 일반적 아이콘(예: 지도 핀)을 그리는 것을 금지합니다. `catalog.json`의 4대 필드를 반영하여 작성해야 합니다:

1. `representation_target` (표현 대상):
   - "화면·도면 안의 위치" $\to$ GIS 지도가 아닌 웹/앱 UI 와이어프레임 캔버스를 배경으로 제공.
2. `information_encoding` (정보 인코딩):
   - "핀 끝이 실제 참조 좌표이고 몸체는 번호·상태 정보를 담는다" $\to$ 핀 몸체에 번호 배지 삽입, 핀 끝은 대상 UI 요소를 조준.
3. `example` (가상 예시 시나리오):
   - "긴 페이지의 오류 위치를 핀 3번으로 저장 클릭 후 메모 입력" $\to$ 대상 요소("오류 버튼") 및 말풍선 주석 카드(`📌 핀 #3`, `우측 마진 오버플로`) 결합.
4. `distinction_from_related` (유사 요소 구별):
   - "위치 픽토그램은 장소 개념 표시이고 위치 핀은 특정 좌표에 부착된 참조다" $\to$ 단순 장소 아이콘 사용 금지.

---

## 7. 텍스트 정렬 및 세이프존(Safe Zone) 레이아웃

### 7.1 W3C 텍스트 정렬 표준 (W3C Section 10.9)
- **가로 중앙 정렬**: `text-anchor="middle"`을 지정하고 $X$를 컨테이너 중심에 정렬.
- **세로 중앙 정렬**: `dominant-baseline="central"`을 사용하거나 폰트 크기의 약 $35\%$를 $Y$에 가산.

### 7.2 세이프존 마진 가이드 ($360 \times 240$ 뷰박스)
- 카드 외곽 테두리: `x="40" y="35" width="280" height="170" rx="8"`
- 상단 타이틀 텍스트: `x="60" y="55"`
- 내부 컨텐츠 세이프존: $X \in [55, 305]$, $Y \in [65, 195]$.
- 필터 그림자 영역(`feDropShadow`)은 잘림 방지를 위해 `x="-20%" y="-20%" width="140%" height="140%"` 권장.

---

## 8. 다중 테마(Light/Dark/Blueprint) 색상 시스템

모든 SVG는 하드코딩된 색상 대신 디자인 시스템 시맨틱 테마 토큰(`T.*`)을 완벽하게 수용합니다:

토큰 | Light | Dark | Blueprint | 용도
:---|:---|:---|:---|:---
`T.cardBg` | `#ffffff` | `#1e293b` | `#0f3156` | 카드/컴포넌트/팝오버 배경
`T.canvasBg` | `#f8fafc` | `#1e293b` | `#081e35` | 캔버스 바탕
`T.border` | `#e2e8f0` | `#334155` | `#20548a` | 일반 구분선
`T.borderStrong` | `#cbd5e1` | `#475569` | `#3277be` | 강조 외곽선
`T.ink` | `#0f172a` | `#f8fafc` | `#e2f1ff` | 본문 텍스트/헤더
`T.inkMuted` | `#64748b` | `#94a3b8` | `#8ab8e6` | 보조 설명/단위
`T.primary` | `#0f766e` | `#14b8a6` | `#38bdf8` | 주 지표/완료
`T.accent` | `#3b82f6` | `#60a5fa` | `#38bdf8` | 보조 지표/진행
`T.rose` | `#ef4444` | `#f87171` | `#fca5a5` | 오류/위험/핀
`T.roseLight` | `#fee2e2` | `#7f1d1d` | `#7f1d1d` | 위험/오류 배경
`T.amber` | `#f59e0b` | `#fbbf24` | `#fcd34d` | 경고/주의
`T.emerald` | `#10b981` | `#34d399` | `#6ee7b7` | 성공/안전

---

## 9. 자동 검증 도구 및 알고리즘 모듈

본 스킬은 W3C 명세를 기반으로 개발된 자동 검증 및 기하 연산 스크립트와 레퍼런스를 내장하고 있습니다:

1. **W3C 기하 계산 모듈**:
   - [W3C SVG Math Utils](./scripts/svg_math_utils.cjs): W3C Appendix F.6 호 변환, 정규 위치 핀, 게이지 바늘, 베지에 보간 함수 제공.
2. **문법 및 기하 무결성 검증기**:
   - [SVG Math & Geometry Validator](./scripts/verify_svg_math.cjs): 전체 SVG 에셋의 XML 유효성, Path Arity, Arc 플래그, Rotate 구문 일괄 검증.
   ```bash
   node .agents/skills/svg-authoring/scripts/verify_svg_math.cjs assets/svg
   ```
3. **상세 W3C 기술 명세 및 치트시트 레퍼런스**:
   - [W3C SVG Specification Technical Reference](./references/w3c_svg_specification_reference.md): W3C 1.1 2nd Ed & SVG 2 챕터별 공식 수식과 알고리즘 분석서.
   - [SVG Mathematics & Path Syntax Cheat Sheet](./references/svg_math_cheatsheet.md): Path 명령어, 삼각함수, 각도 변환 요약표.

---

## 10. 스킬 거버넌스 및 유지보수 워크플로 (Skills Platform Maintenance & Golden Path)

본 스킬은 Skills Platform의 불변 레지스트리 및 참조 링크(`symlink`) 아키텍처에 의해 관리됩니다:

- **원본 패키지 (Canonical Source)**: `~/workflow/Skills-Platform/skills-packages/platform-core/svg-authoring/`
- **배포 및 관리 방식**: Skills Platform Registry 불변 스냅샷 $\to$ Skills Manager 어댑터 참조 링크(`symlink`) 배포
- **업데이트 사이클 (Golden Path)**:
  1. **원본 수정**: 기능 추가 및 수식 보완 시 원본 패키지(`skills-packages/platform-core/svg-authoring/`)를 편집합니다.
  2. **정적 거버넌스 검증**:
     ```bash
     node apps/skills-catalog/src/cli.js skill validate skills-packages/platform-core/svg-authoring --provider antigravity
     ```
  3. **새 불변 리비전 임포트**:
     ```bash
     node apps/skills-catalog/src/cli.js import-local skills-packages/platform-core/svg-authoring
     ```
  4. **참조 링크 최신화 (Skills Manager Adapter)**:
     ```bash
     node apps/skills-catalog/src/cli.js project skill information-ui-catalog enable lineage_e95b938b1f1be8fc3d30 --skill <new_skill_id>
     node apps/skills-catalog/src/cli.js project-plan information-ui-catalog --enabled-only --out /tmp/plan.json
     node packages/skills-manager-adapter/src/cli.js apply /tmp/plan.json --confirm
     ```
  5. **참조 링크 직접 수정 시의 동기화**: 프로젝트 작업 중 심볼릭 링크를 통해 직접 수정한 경우라도, 작업 완료 후 원본 패키지에 변경 사항을 반영하고 위 절차를 통해 레지스트리 해시 무결성을 최신화합니다.
