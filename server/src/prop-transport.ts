import { propContract, type Board } from './storyboard.js';
import { evaluateWindowScript } from './scenes-vm.js';

/** Old portals require a fixed owner. Preserve the versioned sheet in opaque metadata
 * instead of inventing an owner or allowing their legacy registry to overwrite it.
 * Native portal prop forms are not the temporal editor; the plugin restores this envelope.
 */
export function encodePropTransport(board: Board): Board {
  const doc = board.SB_DOC as Record<string, unknown> | undefined;
  if (!doc?.propContinuity) return board;
  const findings = propContract().check(board).filter(f => f.level === 'bad');
  if (findings.length) throw new Error('Invalid prop continuity: ' + findings.map(f => f.what).join('; '));
  const shots = board.SCENES ?? [];
  if (shots.some(s => !s.id)) throw new Error('Prop transport requires stable shot ids');
  const bindings = shots.map(s => ({ shotId: s.id, props: (s.visual as Record<string, unknown> | undefined)?.props }));
  return { ...board, SB_DOC: { ...doc, props: [], propSheetTransport: {
    version: 1, props: doc.props, continuity: doc.propContinuity, bindings,
  } }, SCENES: shots.map(s => {
    if (!s.visual) return s;
    const { props: _props, ...visual } = s.visual;
    return { ...s, visual };
  }) };
}

export function decodePropTransport(board: Board): Board {
  const doc = board.SB_DOC as Record<string, unknown> | undefined;
  const envelope = doc?.propSheetTransport as { version?: number; props?: unknown[];
    continuity?: Record<string, unknown>; bindings?: Array<{shotId: string; props?: string[]}> } | undefined;
  if (!envelope) return board;
  if (envelope.version !== 1 || !Array.isArray(envelope.props) || !Array.isArray(envelope.bindings))
    throw new Error('Unsupported prop transport envelope; preserve the original before upgrading');
  const { propSheetTransport: _transport, ...rest } = doc!;
  const bindings = new Map(envelope.bindings.map(b => [b.shotId, b.props]));
  return { ...board, SB_DOC: { ...rest, props: envelope.props, propContinuity: envelope.continuity },
    SCENES: (board.SCENES ?? []).map(s => bindings.has(s.id!) ? {
      ...s, visual: { ...(s.visual || {}), props: bindings.get(s.id!) },
    } : s) };
}

/** Preserve source bytes for legacy boards and approval comments for restored boards. */
export function restorePropSource(source: string): string {
  if (!source.includes('propSheetTransport')) return source;
  const board = evaluateWindowScript(source) as Board;
  const decoded = decodePropTransport(board);
  if (decoded === board) return source;
  const failures = propContract().check(decoded).filter(f => f.level === 'bad');
  if (failures.length) throw new Error('Invalid restored props: ' + failures.map(f => f.what).join('; '));
  const header = source.match(/^(?:\s*\/\/[^\n]*\n)*/)?.[0] || '';
  return header + '\n' + Object.entries(decoded).map(([key, value]) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error('Invalid board global: ' + key);
    return `window.${key} = ${JSON.stringify(value, null, 2)};`;
  }).join('\n') + '\n';
}
