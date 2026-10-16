export function fixture() {
  const state = { ownerId: 'a', holderId: 'a', location: 'pocket', condition: 'intact' };
  return { SB_DOC: { characters: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    props: [{ id: 'watch', name: 'Silver watch', tracking: 'continuity', description: 'Silver case, one scratch', appearanceVersion: 'v1' }],
    propContinuity: { version: 1, timelineId: 'story-1', initial: [{ propId: 'watch', at: { day: 1, order: 0 }, state }],
      events: [{ id: 'lend-1', kind: 'lend', propId: 'watch', at: { day: 1, order: 2 },
        from: { holderId: 'a', location: 'pocket' }, to: { holderId: 'b', location: 'right hand' },
        reason: 'A lends the watch to B', recordedAt: '2026-10-16T00:00:00Z', recordedBy: 'author', shotIds: ['s0001'] }] } },
    SCENES: [{ id: 's0001', type: 'points', visual: { props: ['watch'], propUsage: [{ propId: 'watch', start: { day: 1, order: 1 }, end: { day: 1, order: 3 } }] } },
      { id: 's0002', type: 'points', visual: { props: ['watch'], propUsage: [{ propId: 'watch', start: { day: 1, order: 0 }, end: { day: 1, order: 0 } }] } }] };
}
