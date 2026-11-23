#!/usr/bin/env node
'use strict';

// Keep the old command discoverable for scripts upgrading from a shot-based workflow.
async function render() {
  throw new Error('scene_video_scope: submit the complete episode scene with video_plan {episode, sceneNo, requestId}, then video_execute');
}
module.exports = {render};
if (require.main === module) render().catch(error => { console.error(error.message); process.exitCode = 1; });
