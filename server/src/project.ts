import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const loadFromHere = nodeModule.createRequire(import.meta.url);
const helper = resolve(dirname(fileURLToPath(import.meta.url)), '../../skills/_shared/project-settings.js');

/** CLI and MCP use the same validation, locking and file operations. */
export function manageProject(args: unknown): Record<string, unknown> {
  const project = loadFromHere(helper) as { manageProject(input: unknown): Record<string, unknown> };
  return project.manageProject(args);
}

type ReadyProject = { workspace: string; paths: { episodes: string } };

/** Resolve the work's own directory before writing a storyboard or starting production. */
export function requireReadyProject(target: string): ReadyProject {
  const project = loadFromHere(helper) as { requireReadyProject(path: string): ReadyProject };
  return project.requireReadyProject(resolve(target));
}

type Handoff = { FORMAT?: string; PRODUCTION?: Record<string, unknown>; LANGUAGES?: { speech?: string }; sns?: Record<string, { enabled?: boolean }> };
/** The new-board handoff (FORMAT, PRODUCTION, LANGUAGES) from an episode's saved snapshot, or undefined when it has none. */
export function episodeHandoff(episode: string): Handoff | undefined {
  const file = join(episode, '.work/model-settings.json');
  if (!existsSync(file)) return undefined;
  const project = loadFromHere(helper) as { handoff(snapshot: unknown): Handoff };
  try { return project.handoff({ ...JSON.parse(readFileSync(file, 'utf8')), file }); } catch { return undefined; }
}
