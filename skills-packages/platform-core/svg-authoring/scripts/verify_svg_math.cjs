#!/usr/bin/env node
/**
 * verify_svg_math.cjs - SVG Syntax, Path Arity & Vector Geometry Validator
 * Usage:
 *   node verify_svg_math.cjs <file_or_directory_or_string>
 */
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Validate raw SVG string against XML well-formedness, path arity, arc flags, and transforms.
 */
function validateSvgString(svg, name = 'input') {
  const issues = [];

  if (!svg || typeof svg !== 'string') {
    return { valid: false, issues: ['Empty or non-string SVG input'] };
  }

  const trimmed = svg.trim();

  // 1. Root tag & XML namespace checks
  if (!trimmed.startsWith('<svg')) {
    issues.push('Missing opening <svg> tag');
  }
  if (!trimmed.endsWith('</svg>')) {
    issues.push('Missing closing </svg> tag');
  }
  if (!trimmed.includes('xmlns="http://www.w3.org/2000/svg"')) {
    issues.push('Missing xmlns="http://www.w3.org/2000/svg" namespace');
  }

  // 2. ViewBox check
  const vbMatch = trimmed.match(/viewBox=["']\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*["']/);
  if (!vbMatch) {
    issues.push('Missing or invalid viewBox attribute');
  }

  // Strip XML comments before analyzing content/markup
  const withoutComments = trimmed.replace(/<!--[\s\S]*?-->/g, '');

  // 3. Unescaped XML entities check in markup/text (& not followed by valid XML entity)
  const unescapedAmp = withoutComments.match(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g);
  if (unescapedAmp) {
    issues.push(`Found ${unescapedAmp.length} unescaped '&' symbol(s) in SVG text/attributes. Use '&amp;' instead.`);
  }

  // 4. Path command parameter arity verification
  // Match path tags and extract exactly the d attribute value with word boundary
  const pathTagRegex = /<path\b([^>]*?)(?:\/>|>)/gis;
  let pMatch;
  while ((pMatch = pathTagRegex.exec(withoutComments)) !== null) {
    const attrs = pMatch[1];
    const dMatch = attrs.match(/\bd=(["'])(.*?)\1/is);
    if (!dMatch) continue;
    const d = dMatch[2];

    // Split into command segments: e.g. M 0 0, L 10 20, A ..., C ..., etc.
    const cmdRegex = /([a-df-z])([^a-df-z]*)/gi;
    let cmdMatch;
    while ((cmdMatch = cmdRegex.exec(d)) !== null) {
      const cmd = cmdMatch[1];
      const cmdUpper = cmd.toUpperCase();
      const rawArgs = cmdMatch[2].trim();
      if (!rawArgs && cmdUpper !== 'Z') continue;

      // Tokenize numbers (handling scientific notation, negative numbers, decimals)
      const numMatches = rawArgs.match(/-?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?/g);
      const nums = numMatches ? numMatches.map(Number) : [];

      // Check command arities
      switch (cmdUpper) {
        case 'Z':
          if (nums.length > 0) {
            issues.push(`Command 'Z' expects 0 parameters, got ${nums.length}`);
          }
          break;

        case 'H':
        case 'V':
          if (nums.length === 0 || nums.length % 1 !== 0) {
            issues.push(`Command '${cmd}' expects multiple of 1 parameter, got ${nums.length}`);
          }
          break;

        case 'M':
        case 'L':
        case 'T':
          if (nums.length === 0 || nums.length % 2 !== 0) {
            issues.push(`Command '${cmd}' expects multiple of 2 parameters (x, y), got ${nums.length} in: "${cmdMatch[0].slice(0, 30)}"`);
          }
          break;

        case 'S':
        case 'Q':
          if (nums.length === 0 || nums.length % 4 !== 0) {
            issues.push(`Command '${cmd}' expects multiple of 4 parameters, got ${nums.length} in: "${cmdMatch[0].slice(0, 30)}"`);
          }
          break;

        case 'C':
          if (nums.length === 0 || nums.length % 6 !== 0) {
            issues.push(`Command '${cmd}' (Cubic Bezier) expects multiple of 6 parameters (x1 y1 x2 y2 x y), got ${nums.length} in: "${cmdMatch[0].slice(0, 40)}"`);
          }
          break;

        case 'A':
          if (nums.length === 0 || nums.length % 7 !== 0) {
            issues.push(`Command '${cmd}' (Arc) expects multiple of 7 parameters (rx ry rot fA fS x y), got ${nums.length} in: "${cmdMatch[0].slice(0, 40)}"`);
          } else {
            for (let i = 0; i < nums.length; i += 7) {
              const rx = nums[i];
              const ry = nums[i + 1];
              const fA = nums[i + 3];
              const fS = nums[i + 4];
              if (rx <= 0 || ry <= 0) {
                issues.push(`Arc non-positive radius: rx=${rx}, ry=${ry}`);
              }
              if (fA !== 0 && fA !== 1) {
                issues.push(`Invalid large-arc-flag in Arc (must be 0 or 1): ${fA}`);
              }
              if (fS !== 0 && fS !== 1) {
                issues.push(`Invalid sweep-flag in Arc (must be 0 or 1): ${fS}`);
              }
            }
          }
          break;
      }
    }
  }

  // 5. Transform rotate syntax verification
  const rotateRegex = /rotate\(([^)]+)\)/g;
  let rotMatch;
  while ((rotMatch = rotateRegex.exec(withoutComments)) !== null) {
    const rArgs = rotMatch[1].trim().split(/[\s,]+/).filter(Boolean);
    if (rArgs.length !== 1 && rArgs.length !== 3) {
      issues.push(`Malformed rotate transform: expected 1 or 3 arguments (angle [, cx, cy]), got ${rArgs.length}: "${rotMatch[0]}"`);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.log('Usage: node verify_svg_math.cjs <svg_file_path | directory>');
    process.exit(0);
  }

  if (fs.existsSync(target)) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(target).filter(f => f.endsWith('.svg'));
      let passCount = 0;
      let failCount = 0;
      for (const file of files) {
        const fullPath = path.join(target, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        const res = validateSvgString(content, file);
        if (res.valid) {
          passCount++;
        } else {
          failCount++;
          console.error(`❌ [FAIL] ${file}:`);
          res.issues.forEach(i => console.error(`   - ${i}`));
        }
      }
      console.log(`\nVerified ${files.length} SVG files: ${passCount} PASSED, ${failCount} FAILED.`);
      if (failCount > 0) process.exit(1);
    } else {
      const content = fs.readFileSync(target, 'utf8');
      const res = validateSvgString(content, target);
      if (res.valid) {
        console.log(`✅ [PASS] ${target}: Valid SVG XML, path arity, and arc geometry.`);
      } else {
        console.error(`❌ [FAIL] ${target} issues:`);
        res.issues.forEach(i => console.error(`  - ${i}`));
        process.exit(1);
      }
    }
  } else {
    // Treat as raw SVG string
    const res = validateSvgString(target);
    console.log(JSON.stringify(res, null, 2));
  }
}

module.exports = { validateSvgString };
