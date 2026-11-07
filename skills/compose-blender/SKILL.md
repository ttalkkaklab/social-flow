---
name: compose-blender
description: >
  Renders cut compositions in Blender for camera and blocking checks. Use only when the user asks for Blender compositions.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__location_manage", "mcp__plugin_social-flow_social-flow__location_manage"]
---

# Compose Blender

Runs only when the user asks for it (user directive 2026-10-31); no other step waits on it.
Follow [the production order](../_shared/production-workflow.md).

Use [location assets](../storyboard/references/location-assets.md) and the cut plan. This
needs Blender even if the saved optional video previz renderer is three.js; report a missing
Blender rather than substituting another renderer. The cut's images still come from
`shot_image`; these renders check camera and blocking.

Build/reuse the shared set and bind each cut's camera, actors, gaze and prop states. For
each cut render through location_manage action render; it returns compositionReceipt, the
renderer's JSON binding the shot ID, the .blend and the start image hashes. Inspect the
compositions in order against the camera plan and fix the camera plan with `shot_icons` or
`storyboard_apply`. Stop before AI image generation.
