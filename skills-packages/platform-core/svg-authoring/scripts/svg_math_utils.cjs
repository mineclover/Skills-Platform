/**
 * svg_math_utils.cjs - W3C Standard SVG Mathematical Engine & Geometry Toolkit
 * 
 * Implements exact mathematical formulas from W3C SVG 1.1 (2nd Ed) & SVG 2:
 * - Appendix F.6: Elliptical Arc Center/Endpoint Parameterization & Lambda Scaling
 * - Section 7.5: Transform Rotate with Arbitrary Pivot Matrices
 * - Analytical Geometry: Teardrop Location Pins, Gauges, Bézier Extrema
 */
'use strict';

/**
 * Convert degree to radian.
 */
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Convert radian to degree.
 */
function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Angle between two 2D vectors in radians.
 */
function vectorAngle(ux, uy, vx, vy) {
  const dot = ux * vx + uy * vy;
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (len === 0) return 0;
  let ratio = dot / len;
  if (ratio > 1) ratio = 1;
  if (ratio < -1) ratio = -1;
  const angle = Math.acos(ratio);
  return (ux * vy - uy * vx < 0) ? -angle : angle;
}

/**
 * W3C Section F.6.5 & F.6.6: Convert Endpoint Parameterization to Center Parameterization.
 * Handles out-of-range radii scaling (Lambda correction).
 */
function endpointToCenterArc(x1, y1, rx, ry, phiDeg, fA, fS, x2, y2) {
  // Degenerate case: identical endpoints
  if (x1 === x2 && y1 === y2) {
    return null;
  }

  // Radii must be positive
  let rX = Math.abs(rx);
  let rY = Math.abs(ry);
  if (rX === 0 || rY === 0) {
    return null; // Line segment degenerate
  }

  const phi = degToRad(phiDeg % 360);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: Compute (x1', y1')
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1Prime = cosPhi * dx2 + sinPhi * dy2;
  const y1Prime = -sinPhi * dx2 + cosPhi * dy2;

  // Step 2: Ensure radii are large enough (F.6.6 Lambda scaling)
  const lambda = (x1Prime * x1Prime) / (rX * rX) + (y1Prime * y1Prime) / (rY * rY);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rX *= sqrtLambda;
    rY *= sqrtLambda;
  }

  // Step 3: Compute (cx', cy')
  const rx2 = rX * rX;
  const ry2 = rY * rY;
  const x1p2 = x1Prime * x1Prime;
  const y1p2 = y1Prime * y1Prime;

  let numerator = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
  if (numerator < 0) numerator = 0; // Floating-point guard
  const denominator = rx2 * y1p2 + ry2 * x1p2;
  const factor = (fA === fS ? -1 : 1) * Math.sqrt(numerator / denominator);

  const cxPrime = factor * (rX * y1Prime / rY);
  const cyPrime = factor * (-rY * x1Prime / rX);

  // Step 4: Compute center (cx, cy) in user space
  const cx = cosPhi * cxPrime - sinPhi * cyPrime + (x1 + x2) / 2;
  const cy = sinPhi * cxPrime + cosPhi * cyPrime + (y1 + y2) / 2;

  // Step 5: Compute theta1 and deltaTheta
  const ux = (x1Prime - cxPrime) / rX;
  const uy = (y1Prime - cyPrime) / rY;
  const vx = (-x1Prime - cxPrime) / rX;
  const vy = (-y1Prime - cyPrime) / rY;

  let theta1 = vectorAngle(1, 0, ux, uy);
  let deltaTheta = vectorAngle(ux, uy, vx, vy) % (2 * Math.PI);

  if (!fS && deltaTheta > 0) {
    deltaTheta -= 2 * Math.PI;
  } else if (fS && deltaTheta < 0) {
    deltaTheta += 2 * Math.PI;
  }

  return {
    cx,
    cy,
    rx: rX,
    ry: rY,
    phiRad: phi,
    theta1,
    deltaTheta,
    theta1Deg: radToDeg(theta1),
    deltaThetaDeg: radToDeg(deltaTheta)
  };
}

/**
 * W3C Section F.6.4: Convert Center to Endpoint Parameterization.
 */
function centerToEndpointArc(cx, cy, rx, ry, phiDeg, theta1Deg, deltaThetaDeg) {
  const phi = degToRad(phiDeg);
  const theta1 = degToRad(theta1Deg);
  const deltaTheta = degToRad(deltaThetaDeg);
  const theta2 = theta1 + deltaTheta;

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const x1 = cx + cosPhi * rx * Math.cos(theta1) - sinPhi * ry * Math.sin(theta1);
  const y1 = cy + sinPhi * rx * Math.cos(theta1) + cosPhi * ry * Math.sin(theta1);

  const x2 = cx + cosPhi * rx * Math.cos(theta2) - sinPhi * ry * Math.sin(theta2);
  const y2 = cy + sinPhi * rx * Math.cos(theta2) + cosPhi * ry * Math.sin(theta2);

  const fA = Math.abs(deltaTheta) > Math.PI ? 1 : 0;
  const fS = deltaTheta > 0 ? 1 : 0;

  return {
    x1,
    y1,
    x2,
    y2,
    fA,
    fS,
    pathSegment: `A ${rx} ${ry} ${phiDeg} ${fA} ${fS} ${x2.toFixed(2)} ${y2.toFixed(2)}`
  };
}

/**
 * Analytical Teardrop Location Pin Path Generator.
 * Calculates exact tangent contact points between bottom tip and circular dome.
 * 
 * @param {number} tipX - X coordinate of bottom needle tip
 * @param {number} tipY - Y coordinate of bottom needle tip
 * @param {number} headR - Radius of circular pin head
 * @param {number} length - Distance from tip to center of head (must be > headR)
 * @returns {string} SVG path d attribute string
 */
function createTeardropPinPath(tipX = 0, tipY = 0, headR = 14, length = 32) {
  if (length <= headR) {
    throw new Error(`Pin length (${length}) must be strictly greater than head radius (${headR})`);
  }

  // Head center is at (tipX, tipY - length)
  const cy = tipY - length;
  const sinAlpha = headR / length;
  const cosAlpha = Math.sqrt(1 - sinAlpha * sinAlpha);

  // Tangent contact points on circle relative to head center:
  // Left contact: (-headR * cosAlpha, headR * sinAlpha) -> in user coords: (tipX - dx, cy + dy)
  // Right contact: (+headR * cosAlpha, headR * sinAlpha) -> in user coords: (tipX + dx, cy + dy)
  const dx = headR * cosAlpha;
  const dy = headR * sinAlpha;

  const leftX = (tipX - dx).toFixed(1);
  const leftY = (cy + dy).toFixed(1);
  const rightX = (tipX + dx).toFixed(1);
  const rightY = (cy + dy).toFixed(1);

  return `M ${tipX} ${tipY} L ${leftX} ${leftY} A ${headR} ${headR} 0 1 1 ${rightX} ${rightY} Z`;
}

/**
 * Donut / Gauge Arch Sector Path Generator with W3C Sweep Reversal.
 */
function createDonutArch(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const toRad = deg => (deg - 90) * Math.PI / 180;
  const delta = (endDeg - startDeg + 360) % 360;
  const fA = delta > 180 ? 1 : 0;

  const xo1 = (cx + rOuter * Math.cos(toRad(startDeg))).toFixed(1);
  const yo1 = (cy + rOuter * Math.sin(toRad(startDeg))).toFixed(1);
  const xo2 = (cx + rOuter * Math.cos(toRad(endDeg))).toFixed(1);
  const yo2 = (cy + rOuter * Math.sin(toRad(endDeg))).toFixed(1);

  const xi1 = (cx + rInner * Math.cos(toRad(startDeg))).toFixed(1);
  const yi1 = (cy + rInner * Math.sin(toRad(startDeg))).toFixed(1);
  const xi2 = (cx + rInner * Math.cos(toRad(endDeg))).toFixed(1);
  const yi2 = (cy + rInner * Math.sin(toRad(endDeg))).toFixed(1);

  return `M ${xo1} ${yo1} A ${rOuter} ${rOuter} 0 ${fA} 1 ${xo2} ${yo2} L ${xi2} ${yi2} A ${rInner} ${rInner} 0 ${fA} 0 ${xi1} ${yi1} Z`;
}

/**
 * Pivot-Centered Gauge Needle Element Generator with W3C 3-arg Rotate Syntax.
 */
function createGaugeNeedle(cx, cy, needleLength, angleDeg, color = '#ef4444', pivotR = 5) {
  const tipY = cy - needleLength;
  const baseW = 2.5;
  const pathD = `M ${(cx - baseW).toFixed(1)} ${cy} ` +
                `L ${(cx - 0.5).toFixed(1)} ${(tipY + 4).toFixed(1)} ` +
                `L ${cx} ${tipY.toFixed(1)} ` +
                `L ${(cx + 0.5).toFixed(1)} ${(tipY + 4).toFixed(1)} ` +
                `L ${(cx + baseW).toFixed(1)} ${cy} Z`;

  return `<g transform="rotate(${angleDeg}, ${cx}, ${cy})">
  <path d="${pathD}" fill="${color}" />
  <circle cx="${cx}" cy="${cy}" r="${pivotR}" fill="#0f172a" />
  <circle cx="${cx}" cy="${cy}" r="${(pivotR * 0.4).toFixed(1)}" fill="#ffffff" />
</g>`;
}

/**
 * Smooth Cubic Bézier Ribbon (Sankey / Alluvial Flow Generator).
 */
function createSankeyRibbon(x1, y1Top, y1Bot, x2, y2Top, y2Bot) {
  const mx = ((x1 + x2) / 2).toFixed(1);
  return `M ${x1} ${y1Top} ` +
         `C ${mx} ${y1Top}, ${mx} ${y2Top}, ${x2} ${y2Top} ` +
         `L ${x2} ${y2Bot} ` +
         `C ${mx} ${y2Bot}, ${mx} ${y1Bot}, ${x1} ${y1Bot} Z`;
}

/**
 * Evaluate Cubic Bézier point at t (0 <= t <= 1).
 */
function evalCubicBezier(t, p0, p1, p2, p3) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
  };
}

module.exports = {
  degToRad,
  radToDeg,
  vectorAngle,
  endpointToCenterArc,
  centerToEndpointArc,
  createTeardropPinPath,
  createDonutArch,
  createGaugeNeedle,
  createSankeyRibbon,
  evalCubicBezier
};
