---
name: pose-video-correction
description: Correct and review sparse human-pose landmarks extracted from video before retargeting or OpenPose rendering. Use for single-camera motion-reference workflows, not marker-based motion-capture cleanup.
---

# Pose Video Correction

Prepare a reviewable pose stream while preserving the source landmarks and their
timing. Treat single-camera depth as an estimate: use it for broad gesture, but
do not present it as anatomically measured 3D motion.

1. Keep the raw extraction immutable and write a separate corrected JSON.
2. Calculate quality indicators before modifying poses: detection coverage,
   landmark visibility, temporal discontinuities, and left/right limb-length
   stability.
3. Interpolate only short gaps with neighbouring reliable samples. Smooth only
   high-confidence landmarks, and retain original values where smoothing would
   bridge a likely occlusion or a fast, intentional motion.
4. Preserve foot contacts when the downstream rig or render requires a grounded
   pose. Make contact decisions visible in the corrected data and report.
5. Produce a compact machine-readable report plus representative rendered-frame
   review. Flag frames rather than silently forcing implausible torso twists,
   extreme reaches, or inferred depth changes.

For an OpenPose delivery, use the corrected **image-space** points to retain
alignment with the source video. For rig retargeting, use corrected world-space
directions only as a preview and keep the original mesh or character hidden
when the requested output is a pose guide.
