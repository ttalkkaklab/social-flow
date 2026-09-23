### Episode attachment backup

With a portal key, `portal_storyboard_save` and `portal_episode_checkpoint` also sync
files under the episode directory. Check `attachments.complete` and the skipped/error
list before deleting local files. A successful board save does not certify a complete
file backup. Retry files alone with `portal_attachments_sync` (no new board revision).
Each file is limited to 10 MiB; the shared episode/workspace quotas remain 100/500 MiB.
Do not raise limits automatically. Symlinks, `.env`, `.git`, `node_modules`, portal state,
and pull backup directories are excluded. Keep oversized or skipped originals locally
until an owner-approved archive exists.

`portal_storyboard_pull` restores current attachments and their original relative paths;
`mode: side` puts them under `storyboard/.portal-head/attachments/`. Named historical
revision pulls do not mix current attachments into the old board. Existing changed files
receive a local backup. Hash or unsafe-path errors stop restoration.

Audio provenance belongs to the attachment, not to scenes.js. The optional episode-root
`.portal-attachments.json` maps relative paths to `{ provenance: { tool, model, prompt,
generatedAt, planAtGeneration, rightsAtGeneration, originalSha256, license, attribution } }`.
Use ISO8601 dates and the actual generation-time plan/rights; omit unknown values.
Pull restores this metadata. Scene sound design uses the attachment logical id, never
an absolute file path or URL. A rights claim is evidence supplied by the producer,
not an automatic commercial-use approval.


Revision-owned paths are never uploaded or restored as attachments. The shared canonical
pull-path helper covers the five document names, selected `scenario.md`, and any additional
portal documents. Existing legacy attachment records at those paths are retained remotely
and reported as `skipped: canonical`; the revision contents stay in the working directory.
