import * as nodeModule from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const loadFromHere = nodeModule.createRequire(import.meta.url);
const helper = resolve(dirname(fileURLToPath(import.meta.url)), '../../skills/_shared/project-settings.js');

/** CLI and MCP use the same validation, locking and file operations. */
export function manageProject(args: unknown): Record<string, unknown> {
  const project = loadFromHere(helper) as { manageProject(input: unknown): Record<string, unknown> };
  return project.manageProject(args);
}
