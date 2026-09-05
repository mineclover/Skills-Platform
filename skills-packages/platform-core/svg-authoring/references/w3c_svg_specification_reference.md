# W3C Scalable Vector Graphics (SVG) Standard Technical Reference

이 문서는 W3C SVG 1.1 (Second Edition) Recommendation 및 SVG 2 Candidate Recommendation 명세를 바탕으로, SVG 벡터 그래픽의 수학적 모델, 파싱 문법, 기하 변환 및 렌더링 파이프라인을 체계화한 전문가 기술 표준 레퍼런스입니다.

---

## 1. 좌표계 및 기하 변환 (W3C SVG 1.1 Chapter 7)

### 1.1 좌표계 계층 구조 (Coordinate Space Hierarchy)
SVG 렌더링 엔진은 3단계 좌표 변환 파이프라인을 수행합니다:
1. **Viewport Coordinate System**: 브라우저 디스플레이 공간의 물리적 CSS 픽셀 단위.
2. **Current User Coordinate System**: `viewBox` 어트리뷰트에 의해 정의되는 논리적 벡터 공간.
3. **Local Transformed Coordinate System**: 개별 요소의 `transform` 속성에 의해 국소적으로 변형된 공간.

### 1.2 ViewBox-to-Viewport 매핑 변환
`<svg viewBox="min_x min_y width height" preserveAspectRatio="align meetOrSlice">`의 어핀 변환 행렬:

- 스케일 팩터:
  $$s_x = \frac{\text{viewport\_width}}{\text{viewBox\_width}}, \quad s_y = \frac{\text{viewport\_height}}{\text{viewBox\_height}}$$
- `preserveAspectRatio="xMidYMid meet"` (기본값):
  $$s = \min(s_x, s_y)$$
  $$t_x = -\text{min\_x} \cdot s + \frac{\text{viewport\_width} - \text{viewBox\_width} \cdot s}{2}$$
  $$t_y = -\text{min\_y} \cdot s + \frac{\text{viewport\_height} - \text{viewBox\_height} \cdot s}{2}$$
- 어핀 변환:
  $$\begin{pmatrix} x_{\text{viewport}} \\ y_{\text{viewport}} \\ 1 \end{pmatrix} = \begin{pmatrix} s & 0 & t_x \\ 0 & s & t_y \\ 0 & 0 & 1 \end{pmatrix} \begin{pmatrix} x_{\text{user}} \\ y_{\text{user}} \\ 1 \end{pmatrix}$$

### 1.3 `transform` 행렬 표현 및 합성 (W3C Section 7.4)
모든 2D 아핀 변환은 $3 \times 3$ 동차 좌표 행렬 `matrix(a, b, c, d, e, f)`로 표현됩니다:

$$\begin{pmatrix} x' \\ y' \\ 1 \end{pmatrix} = \begin{pmatrix} a & c & e \\ b & d & f \\ 0 & 0 & 1 \end{pmatrix} \begin{pmatrix} x \\ y \\ 1 \end{pmatrix}$$

#### 1) `translate(tx, ty)`
$$\begin{pmatrix} 1 & 0 & tx \\ 0 & 1 & ty \\ 0 & 0 & 1 \end{pmatrix}$$

#### 2) `scale(sx, sy)` (sy 생략 시 sy = sx)
$$\begin{pmatrix} sx & 0 & 0 \\ 0 & sy & 0 \\ 0 & 0 & 1 \end{pmatrix}$$

#### 3) `rotate(angle, cx, cy)` (W3C Section 7.5)
임의의 피벗 중심 $(cx, cy)$ 기준 회전은 행렬 합성으로 정의됩니다:
$$\mathbf{M}_{\text{rotate}} = \mathbf{T}(cx, cy) \cdot \mathbf{R}(\theta) \cdot \mathbf{T}(-cx, -cy)$$

$$\mathbf{M}_{\text{rotate}} = \begin{pmatrix} \cos\theta & -\sin\theta & cx(1-\cos\theta) + cy\sin\theta \\ \sin\theta & \cos\theta & cy(1-\cos\theta) - cx\sin\theta \\ 0 & 0 & 1 \end{pmatrix}$$

> [!CRITICAL]
> **피벗 생략 시 $(0, 0)$ 회전**: $(cx, cy)$를 전달하지 않은 `rotate(deg)`는 $cx=0, cy=0$이 되어 $\mathbf{M} = \begin{pmatrix} \cos\theta & -\sin\theta & 0 \\ \sin\theta & \cos\theta & 0 \\ 0 & 0 & 1 \end{pmatrix}$로 축퇴(Degenerate)됩니다. 이로 인해 중심에서 벗어난 계측기 바늘이나 다이어그램 노드가 화면 외부로 튕겨 나가는 치명적 렌더링 결함이 발생합니다.

---

## 2. 경로 데이터 EBNF 문법 및 파싱 (W3C SVG 1.1 Section 8.3.8)

### 2.1 EBNF 공식 문법 요약
```ebnf
svg-path ::= wsp* moveto-drawto-command-groups? wsp*
moveto-drawto-command-groups ::= moveto-drawto-command-group (wsp* moveto-drawto-command-group)*
drawto-command ::= (closepath | lineto | horizontal-lineto | vertical-lineto | curveto | smooth-curveto | quadratic-bezier-curveto | smooth-quadratic-bezier-curveto | elliptical-arc)
```

### 2.2 암묵적 명령어 반복 규칙 (Implicit Command Repetition)
W3C 명세에 따르면 명령어 문자 뒤에 필요한 수치보다 많은 수치 쌍이 이어질 경우:
- `M x y x2 y2 ...` $\implies$ 첫 좌표는 `moveto`, 이후 좌표 쌍은 암묵적으로 **`lineto` (`L`)**로 처리됩니다.
- `m dx dy dx2 dy2 ...` $\implies$ 첫 좌표는 상대 `moveto`, 이후는 상대 **`lineto` (`l`)**로 처리됩니다.
- `C x1 y1 x2 y2 x y x1b y1b x2b y2b xb yb` $\implies$ 6개씩 묶여 연속된 3차 베지에 곡선 세그먼트 생성.

> [!TIP]
> 코드 가독성과 AST 파서의 일관성을 위해 암묵적 명령 대신 명시적 명령어(`L`, `C` 등)를 기재하는 것이 프로덕션 표준입니다.

---

## 3. W3C 타원 호(Elliptical Arc) 수학 모델 (W3C SVG 1.1 Appendix F.6)

W3C 명세는 타원 호를 **종점 매개변수화 (Endpoint Parameterization)** 방식으로 기술합니다:
$$(x_1, y_1, r_x, r_y, \phi, f_A, f_S, x_2, y_2)$$
하지만 그래픽스 래스터라이저와 충돌 판정기는 **중심 매개변수화 (Center Parameterization)**를 필요로 합니다:
$$(c_x, c_y, r_x, r_y, \phi, \theta_1, \Delta\theta)$$

### 3.1 종점 $\to$ 중심 매개변수화 변환 알고리즘 (W3C Section F.6.5)

#### 1단계: 회전 상쇄된 중간 좌표 $(x_1', y_1')$ 계산
$$\begin{pmatrix} x_1' \\ y_1' \end{pmatrix} = \begin{pmatrix} \cos\phi & \sin\phi \\ -\sin\phi & \cos\phi \end{pmatrix} \begin{pmatrix} \frac{x_1 - x_2}{2} \\ \frac{y_1 - y_2}{2} \end{pmatrix}$$

#### 2단계: 반지름 유효성 보정 ($\Lambda$-스케일링, W3C Section F.6.6)
반지름 $r_x, r_y$는 두 점 사이의 거리를 연결할 수 있을 만큼 충분히 커야 합니다:
$$\Lambda = \frac{{x_1'}^2}{r_x^2} + \frac{{y_1'}^2}{r_y^2}$$
만약 $\Lambda > 1$ 이면 타원이 두 점에 닿지 않으므로 반지름을 강제 확대합니다:
$$r_x \leftarrow \sqrt{\Lambda} \cdot r_x, \quad r_y \leftarrow \sqrt{\Lambda} \cdot r_y$$

#### 3단계: 중간 중심점 $(c_x', c_y')$ 계산
$$c_x' = \pm \sqrt{\frac{r_x^2 r_y^2 - r_x^2 {y_1'}^2 - r_y^2 {x_1'}^2}{r_x^2 {y_1'}^2 + r_y^2 {x_1'}^2}} \cdot \frac{r_x y_1'}{r_y}$$
$$c_y' = \mp \sqrt{\frac{r_x^2 r_y^2 - r_x^2 {y_1'}^2 - r_y^2 {x_1'}^2}{r_x^2 {y_1'}^2 + r_y^2 {x_1'}^2}} \cdot \frac{r_y x_1'}{r_x}$$
부호 규칙: $f_A \ne f_S$ 이면 $+$, $f_A = f_S$ 이면 $-$.

#### 4단계: 원래 사용자 좌표계의 중심점 $(c_x, c_y)$ 복원
$$\begin{pmatrix} c_x \\ c_y \end{pmatrix} = \begin{pmatrix} \cos\phi & -\sin\phi \\ \sin\phi & \cos\phi \end{pmatrix} \begin{pmatrix} c_x' \\ c_y' \end{pmatrix} + \begin{pmatrix} \frac{x_1 + x_2}{2} \\ \frac{y_1 + y_2}{2} \end{pmatrix}$$

#### 5단계: 시작 각도 $\theta_1$ 및 각도 변화량 $\Delta\theta$ 계산
$$\theta_1 = \angle\left(\begin{pmatrix} 1 \\ 0 \end{pmatrix}, \begin{pmatrix} (x_1' - c_x') / r_x \\ (y_1' - c_y') / r_y \end{pmatrix}\right)$$
$$\Delta\theta = \angle\left(\begin{pmatrix} (x_1' - c_x') / r_x \\ (y_1' - c_y') / r_y \end{pmatrix}, \begin{pmatrix} (-x_1' - c_x') / r_x \\ (-y_1' - c_y') / r_y \end{pmatrix}\right) \pmod{2\pi}$$
- $f_S = 0$ 이고 $\Delta\theta > 0$ 이면 $\Delta\theta \leftarrow \Delta\theta - 2\pi$.
- $f_S = 1$ 이고 $\Delta\theta < 0$ 이면 $\Delta\theta \leftarrow \Delta\theta + 2\pi$.

### 3.2 W3C 축퇴 케이스 (Degenerate Cases) 처리 규정 (W3C Section F.6.2)
1. **$x_1 = x_2$ 이고 $y_1 = y_2$**:
   호 세그먼트는 완전히 무시됩니다 (길이가 0이므로 어떤 렌더링도 하지 않음).
2. **$r_x = 0$ 또는 $r_y = 0$**:
   호는 시작점 $(x_1, y_1)$에서 끝점 $(x_2, y_2)$를 잇는 **직선 세그먼트(`L`)**로 처리됩니다.
3. **음수 반지름 ($r_x < 0$ 또는 $r_y < 0$)**:
   절댓값 $|r_x|, |r_y|$로 자동 치환됩니다.

---

## 4. 베지에 곡선 기하학 및 해석 (W3C SVG 1.1 Section 8.3.5 ~ 8.3.6)

### 4.1 3차 베지에 곡선 (Cubic Bézier, `C`)
제어 다각형 $P_0, P_1, P_2, P_3$에 대한 매개변수 방정식 ($t \in [0, 1]$):
$$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t)t^2 P_2 + t^3 P_3$$

- **속도 벡터 (1차 도함수)**:
  $$B'(t) = 3(1-t)^2 (P_1 - P_0) + 6(1-t)t (P_2 - P_1) + 3t^2 (P_3 - P_2)$$
  - $t=0$에서의 접선 기울기: $3(P_1 - P_0)$
  - $t=1$에서의 접선 기울기: $3(P_3 - P_2)$
- **매끄러운 연결 (`S` 명령어)**:
  이전 곡선이 $P_0, P_1, P_2, P_3$일 때 다음 `S`의 첫 번째 제어점 $P_1'$은 이전의 마지막 제어점 $P_2$를 $P_3$에 대해 반사한 점입니다:
  $$P_1' = 2 P_3 - P_2$$
  이를 통해 $G^1$ 연속성(접선 방향 일치)을 보장합니다.

---

## 5. 텍스트 레이아웃 및 폰트 메트릭스 (W3C SVG 1.1 Chapter 10)

### 5.1 텍스트 앵커 (`text-anchor`, W3C Section 10.9)
- `start`: 텍스트의 첫 글자 시작 위치를 지정된 $X$ 좌표에 일치 (기본값).
- `middle`: 텍스트 청크 전체 폭의 기하학적 중심을 지정된 $X$ 좌표에 일치.
- `end`: 텍스트의 마지막 글자 끝 위치를 지정된 $X$ 좌표에 일치.

### 5.2 베이스라인 정렬 (`dominant-baseline`, W3C Section 10.9.2)
텍스트의 수직 정렬을 결정하는 기준선:
- `alphabetic`: 라틴 알파벳 기본 베이스라인 (소문자 하단, 'g', 'p' 디센더 제외).
- `middle`: 폰트 x-height의 중간 높이.
- `central`: 폰트 em-box(어센더 + 디센더 전체 높이)의 완벽한 수학적 기하 중심.

> [!TIP]
> 버튼, 배지, 차트 노드 라벨의 수직 중앙 정렬에는 **`dominant-baseline="central"`**이 가장 정확하며 크로스 브라우저 호환성이 뛰어납니다.

---

## 6. 채우기 규칙 및 스트로크 렌더링 (W3C SVG 1.1 Chapter 11)

### 6.1 `fill-rule`: `nonzero` vs `evenodd` (W3C Section 11.2.2)
도넛 차트, 홀(Hole)이 뚫린 복합 경로, 또는 자기 교차 곡선에서 내부 영역을 결정하는 알고리즘:

- **`nonzero` (기본값)**:
  임의의 점에서 무한대로 광선을 쏠 때, 경로가 좌에서 우로 교차하면 $+1$, 우에서 좌로 교차하면 $-1$을 합산합니다. 결과 합이 $0$이 아니면 채웁니다.
  - 도넛 링에서 외경(시계 방향)과 내경(반시계 방향)의 권선수가 상쇄되어 내부가 정확히 뚫리게 됩니다.
- **`evenodd`**:
  광선이 경로와 교차하는 총 횟수가 홀수이면 채우고, 짝수이면 비웁니다 (경로의 전개 방향에 무관).

### 6.2 스트로크 라인조인 및 마이터 리밋 (W3C Section 11.4)
- `stroke-linejoin="miter"`: 두 선분의 외곽선이 만날 때까지 연장하여 뾰족한 모서리 생성.
- `stroke-miterlimit`: 마이터 길이 대 선 두께의 비율 제한 (W3C 기본값 `4`). 각도가 매우 예리할 때 모서리가 튀어나오는 것을 방지하며, 초과 시 자동으로 `bevel` 처리됩니다.

---

## 7. 필터 효과 서브리전 및 클리핑 방지 (W3C SVG 1.1 Chapter 15)

### 7.1 Filter Primitive Subregion (W3C Section 15.5)
`<filter>` 태그의 기본 바운딩 박스:
- `x="-10%" y="-10%" width="120%" height="120%"`
- **클리핑 결함 주의**: `feDropShadow`의 $dx, dy$ 오프셋과 $3 \times \text{stdDeviation}$ 흐림 반경의 합이 바운딩 박스 여백($10\%$)을 초과하면, 그림자가 네모난 상자 모양으로 잘리는 렌더링 결함이 발생합니다.
- **프로덕션 표준 필터 영역**:
  ```xml
  <filter id="shadow-md" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.12" flood-color="#000" />
  </filter>
  ```
