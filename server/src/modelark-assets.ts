import { createHash, createHmac, randomUUID } from 'node:crypto';
import { existsSync, statSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import lockfile from 'proper-lockfile';
import { verifyImageFile } from './image-media.js';
import { z } from 'zod';
import { publishFiles } from './media-publish.js';

const region = 'ap-southeast-1';
const host = 'ark.ap-southeast-1.byteplusapi.com';
const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const groupType = z.enum(['AIGC', 'LivenessFace']);
export const portraitAssetSchema = z
  .object({
    identityPath: z.string().min(1),
    panel: z.string().min(1).default('face'),
    groupType: groupType.optional(),
    verifiedGroupId: z
      .string()
      .regex(/^group-[\w-]+$/)
      .optional(),
  })
  .strict();
type Input = z.input<typeof portraitAssetSchema>;
type GroupType = z.infer<typeof groupType>;
interface Asset {
  Id?: string;
  Name?: string;
  GroupId?: string;
  Status?: string;
  AssetType?: string;
  GroupType?: string;
  Error?: { Code?: string };
}
interface Result extends Asset {
  Items?: Asset[];
  NextToken?: string;
}
type Action = 'ListAssetGroups' | 'CreateAssetGroup' | 'ListAssets' | 'CreateAsset' | 'GetAsset';
type Row = { id?: string; name: string; status: string; sha256: string };
interface Shelf {
  groupType: GroupType;
  groupId?: string;
  groupPending?: boolean;
  project: string;
  assets: Record<string, Row>;
}

export class PortraitError extends Error {
  readonly report: Record<string, unknown>;
  constructor(cause: unknown) {
    const e = cause as Error & { providerCode?: string; httpStatus?: number; requestId?: string };
    const message = String(e?.message || cause).replace(/https?:\/\/[^\s]+/g, '[media host]');
    super(message);
    const code =
      e?.providerCode === 'SubscriptionRequired'
        ? 'modelark_asset_entitlement_required'
        : e?.httpStatus === 401 || e?.httpStatus === 403
          ? 'modelark_asset_access_denied'
          : message.match(/^modelark_[a-z_]+/)?.[0] || 'modelark_asset_registration_error';
    const guidance: Record<string, string> = {
      modelark_asset_entitlement_required:
        'Ask the account owner to verify an eligible enterprise account and activate the free Advanced Creation Rights (Entry) in ModelArk. SubscriptionRequired identifies a missing entitlement; enterprise verification status must be checked in the console. Resume the same plan after activation.',
      modelark_asset_access_denied:
        'Check the management key, project and IAM asset permissions. This response does not establish the account subscription status.',
      modelark_asset_credentials:
        'Set the project management access key and secret securely; video inference uses a separate key.',
      modelark_asset_ambiguous:
        'Select the reference directly from its owning character sheet and update the shot. Plan the edited shot again.',
      modelark_asset_registration_required: 'Register this character’s face panel with modelark_portrait_register and wait for Active before planning the video.',
      modelark_asset_stale: 'Register the current panel and plan again with its reviewed asset.',
      modelark_asset_sheet_required:
        'Select the character sheet image that owns the face reference and plan the edited shot again.',
      modelark_asset_kind_required:
        'Confirm the portrait type on the character sheet and call modelark_portrait_register.',
      modelark_asset_liveness_required:
        'The real person must complete verification and authorize their portrait. Supply the returned group ID.',
      modelark_asset_processing: 'Poll the same asset ID by calling the registration tool again.',
      modelark_asset_failed: 'Inspect the rejected asset in ModelArk before submitting a revised image.',
      modelark_asset_busy: 'Wait for the current registration to finish, then resume the same plan.',
      modelark_asset_unknown: 'Look up the existing upload receipt before retrying. Do not create a duplicate.',
      modelark_group_unknown: 'Reconcile the previous group creation before requesting another group.',
    };
    this.report = {
      stage: 'modelark_portrait',
      code,
      videoSubmitted: false,
      message,
      nextAction: guidance[code] || 'Inspect the registration error, then resume the approved plan.',
      ...(e?.providerCode ? { providerCode: e.providerCode } : {}),
      ...(e?.httpStatus ? { httpStatus: e.httpStatus } : {}),
      ...(e?.requestId ? { requestId: e.requestId } : {}),
      ...(code === 'modelark_asset_entitlement_required'
        ? {
            consoleUrl:
              'https://ai.byteplus.com/ark/region:ap-southeast-1/openManagement?advancedActiveKey=mediaAsset',
          }
        : {}),
    };
  }
}

function credentials() {
  const access = process.env.BYTEPLUS_ACCESS_KEY_ID,
    secret = process.env.BYTEPLUS_SECRET_ACCESS_KEY;
  if (!access || !secret)
    throw new Error(
      'modelark_asset_credentials: set BYTEPLUS_ACCESS_KEY_ID and BYTEPLUS_SECRET_ACCESS_KEY for this project',
    );
  return { access, secret, project: process.env.BYTEPLUS_PROJECT_NAME || 'default' };
}

function libraryScope() {
  const {access, project} = credentials();
  return {project, scope:sha(access + '\n' + project).slice(0, 20)};
}

/** Read the registration receipt without uploading a file or starting review during video planning. */
export function approvedPortrait(identityPath: string, panel: string, digest: string) {
  const doc = identityBlock(sheetFile(identityPath)).doc;
  if (!doc.modelArk?.libraries) throw new Error('modelark_asset_registration_required: no reviewed sheet asset');
  const {project, scope} = libraryScope();
  const shelf: Shelf | undefined = doc.modelArk.libraries[scope];
  const row = shelf?.assets[path.basename(portraitImage(identityPath, panel))];
  if (!shelf?.groupId || shelf.project !== project || !row)
    throw new Error('modelark_asset_registration_required: no registration for this account, project and panel');
  if (row.sha256 !== digest) throw new Error('modelark_asset_stale: registered sheet bytes changed');
  if (row.status === 'Failed') throw new Error('modelark_asset_failed: ' + row.id);
  if (row.status === 'Processing') throw new Error('modelark_asset_processing: ' + row.id);
  if (row.status === 'Submitting') throw new Error('modelark_asset_unknown: reconcile the existing upload');
  if (row.status !== 'Active' || !row.id) throw new Error('modelark_asset_registration_required: no active registration');
  return {assetId:row.id, groupId:shelf.groupId, project, region, scope, name:'sf-' + digest.slice(0,48)};
}

export async function verifyApprovedPortrait(pin: ReturnType<typeof approvedPortrait>) {
  const {scope, project} = libraryScope();
  if (scope !== pin.scope || project !== pin.project) throw new Error('modelark_asset_identity_conflict: account or project changed');
  const asset = await arkAssetCall('GetAsset', {Id:pin.assetId});
  if (asset.Id !== pin.assetId || asset.Name !== pin.name || asset.GroupId !== pin.groupId || asset.AssetType !== 'Image')
    throw new Error('modelark_asset_identity_conflict: wrong asset returned');
  if (asset.Status !== 'Active') throw new Error((asset.Status === 'Failed' ? 'modelark_asset_failed' :
    asset.Status === 'Processing' ? 'modelark_asset_processing' : 'modelark_asset_status') + ': ' + pin.assetId);
}

/** BytePlus OpenAPI v4 signature. ModelArk's inference bearer token cannot sign control-plane requests. */
export async function arkAssetCall(action: Action, params: Record<string, unknown>): Promise<Result> {
  const { access, secret, project } = credentials();
  const body = JSON.stringify({ ...params, ProjectName: project });
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
    day = date.slice(0, 8);
  const query = 'Action=' + action + '&Version=2024-01-01',
    scope = [day, region, 'ark', 'request'].join('/');
  const names = 'content-type;host;x-content-sha256;x-date',
    digest = sha(body);
  const headers =
    'content-type:application/json\nhost:' + host + '\nx-content-sha256:' + digest + '\nx-date:' + date + '\n';
  const canonical = ['POST', '/', query, headers, names, digest].join('\n');
  let key: Buffer = Buffer.from(secret);
  for (const value of scope.split('/')) key = createHmac('sha256', key).update(value).digest();
  const signature = createHmac('sha256', key)
    .update(['HMAC-SHA256', date, scope, sha(canonical)].join('\n'))
    .digest('hex');
  const res = await fetch('https://' + host + '/?' + query, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-Date': date,
      'X-Content-Sha256': digest,
      Authorization:
        'HMAC-SHA256 Credential=' + access + '/' + scope + ', SignedHeaders=' + names + ', Signature=' + signature,
    },
  });
  const json = (await res.json()) as {
    Result?: Result;
    ResponseMetadata?: { Error?: { Code?: string }; RequestId?: string };
  };
  if (!res.ok || json.ResponseMetadata?.Error || !json.Result)
    throw Object.assign(
      new Error(
        'ModelArk ' +
          action +
          ' HTTP ' +
          res.status +
          ' ' +
          (json.ResponseMetadata?.Error?.Code || '') +
          ' request ' +
          (json.ResponseMetadata?.RequestId || 'unknown'),
      ),
      {
        providerCode: json.ResponseMetadata?.Error?.Code,
        httpStatus: res.status,
        requestId: json.ResponseMetadata?.RequestId,
        definite: res.status >= 400 && res.status < 500 && res.status !== 408,
      },
    );
  return json.Result;
}

async function findNamed(
  action: 'ListAssetGroups' | 'ListAssets',
  filter: Record<string, string | string[]>,
  name: string,
) {
  let token: string | undefined;
  const seen = new Set<string>(),
    matches = new Map<string, Asset>();
  do {
    const page = await arkAssetCall(action, {
      Filter: { ...filter, Name: name },
      MaxResults: 100,
      ...(token ? { NextToken: token } : {}),
    });
    for (const item of page.Items ?? []) if (item.Name === name && item.Id) matches.set(item.Id, item);
    token = page.NextToken;
    if (token && seen.has(token)) throw new Error('modelark_asset_pagination: repeated continuation token');
    if (token) seen.add(token);
  } while (token);
  if (matches.size > 1) throw new Error('modelark_asset_ambiguous: multiple matching resources for ' + name);
  return [...matches.values()][0];
}

function identityBlock(file: string) {
  const source = readFileSync(file, 'utf8');
  const blocks = [...source.matchAll(/^```json[^\S\n]*\r?\n([\s\S]*?)^```/gm)].filter((b) => {
    try {
      return !!JSON.parse(b[1]).character;
    } catch {
      return false;
    }
  });
  if (blocks.length !== 1) throw new Error('modelark_asset_sheet: expected one character JSON block in ' + file);
  const block = blocks[0],
    start = block.index! + block[0].indexOf(block[1]);
  return { source, start, end: start + block[1].length, doc: JSON.parse(block[1]) };
}

function sheetFile(input: string) {
  const file = realpathSync(input),
    folder = path.dirname(file);
  if (
    path.basename(file) !== 'identity.md' ||
    path.basename(path.dirname(folder)) !== 'characters' ||
    path.basename(path.dirname(path.dirname(folder))) !== 'assets'
  )
    throw new Error('modelark_asset_sheet: use assets/characters/<id>/identity.md');
  return file;
}

export function portraitImage(identityPath: string, panel: string) {
  const folder = path.dirname(sheetFile(identityPath));
  const manifest = JSON.parse(readFileSync(path.join(folder, 'panels.json'), 'utf8'));
  const name = manifest.panels?.[panel]?.file ?? panel;
  if (path.basename(name) !== name || !/\.(png|jpe?g|webp)$/i.test(name))
    throw new Error('modelark_asset_panel: select a sheet image');
  const file = realpathSync(path.join(folder, name));
  if (path.dirname(file) !== folder) throw new Error('modelark_asset_panel: selected image escaped its sheet');
  return file;
}

export async function ensurePortrait(raw: Input, expectedSha256?: string) {
  try {
    return await register(raw, expectedSha256);
  } catch (error) {
    throw new PortraitError(error);
  }
}

async function register(raw: Input, expectedSha256?: string) {
  const args = portraitAssetSchema.parse(raw),
    identity = sheetFile(args.identityPath),
    folder = path.dirname(identity);
  const image = portraitImage(identity, args.panel),
    fileName = path.basename(image);
  if (statSync(image).size >= 30 * 1024 * 1024)
    throw new Error('modelark_asset_panel: the image must be smaller than 30 MB');
  const metadata = verifyImageFile(image),
    digest = metadata.sha256,
    ratio = metadata.width / metadata.height;
  if (
    Math.min(metadata.width, metadata.height) <= 300 ||
    Math.max(metadata.width, metadata.height) >= 6000 ||
    ratio <= 0.4 ||
    ratio >= 2.5
  )
    throw new Error('modelark_asset_panel: the image must meet the asset library dimensions and aspect ratio');
  if (expectedSha256 && expectedSha256 !== digest)
    throw new Error('modelark_asset_stale: the sheet no longer matches the approved image');
  const { project, scope } = libraryScope();
  const lock = path.join(folder, '.modelark-portrait.lock');
  const release = await lockfile
    .lock(identity, { lockfilePath: lock, stale: 120000, update: 10000, retries: 0 })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ELOCKED') throw new Error('modelark_asset_busy: another registration holds ' + lock);
      throw error;
    });
  try {
    const existing = identityBlock(identity).doc.modelArk;
    const shelf: Shelf = existing?.libraries?.[scope] ?? {
      groupType: args.groupType ?? existing?.kind,
      project,
      assets: {},
    };
    if (!groupType.safeParse(shelf.groupType).success)
      throw new Error(
        'modelark_asset_kind_required: identify this character as AIGC or supply its consent-verified LivenessFace group',
      );
    if (
      (args.groupType && args.groupType !== shelf.groupType) ||
      (args.verifiedGroupId && shelf.groupId && args.verifiedGroupId !== shelf.groupId)
    )
      throw new Error('modelark_asset_identity_conflict: group does not match this character');
    const save = () => {
      const { source, start, end, doc } = identityBlock(identity);
      doc.modelArk = {
        ...doc.modelArk,
        kind: shelf.groupType,
        libraries: { ...doc.modelArk?.libraries, [scope]: shelf },
      };
      const tmp = path.join(folder, '.modelark-' + randomUUID() + '.tmp');
      try {
        writeFileSync(tmp, source.slice(0, start) + JSON.stringify(doc, null, 2) + '\n' + source.slice(end), {
          flag: 'wx',
        });
        renameSync(tmp, identity);
      } finally {
        rmSync(tmp, { force: true });
      }
    };
    const channel = path.basename(path.resolve(folder, '../../..')),
      character = path.basename(folder);
    const groupName = 'sf-' + character.slice(0, 35) + '-' + sha(channel + '/' + character).slice(0, 12);
    if (!shelf.groupId) {
      if (shelf.groupType === 'LivenessFace') {
        if (!args.verifiedGroupId)
          throw new Error(
            'modelark_asset_liveness_required: complete the subject verification and provide its group ID',
          );
        const check = await arkAssetCall('ListAssetGroups', {
          Filter: { GroupType: 'LivenessFace', GroupIds: [args.verifiedGroupId] },
          MaxResults: 1,
        });
        if (!check.Items?.some((group) => group.Id === args.verifiedGroupId && group.GroupType === 'LivenessFace'))
          throw new Error(
            'modelark_asset_liveness_required: group was not found among this project’s verified real-person groups',
          );
        shelf.groupId = args.verifiedGroupId;
      } else {
        if (args.verifiedGroupId)
          throw new Error('modelark_asset_group_type: verifiedGroupId is for LivenessFace');
        const found = await findNamed('ListAssetGroups', { GroupType: shelf.groupType }, groupName);
        if (found) shelf.groupId = found.Id;
        else {
          if (shelf.groupPending)
            throw new Error(
              'modelark_group_unknown: creation unconfirmed; reconcile the prior group before retrying',
            );
          shelf.groupPending = true;
          save();
          try {
            shelf.groupId = (await arkAssetCall('CreateAssetGroup', { Name: groupName, GroupType: 'AIGC' })).Id;
          } catch (error) {
            if ((error as { definite?: boolean }).definite) {
              delete shelf.groupPending;
              save();
            }
            throw error;
          }
          if (!shelf.groupId) throw new Error('modelark_group_unknown: no group ID returned');
        }
      }
      delete shelf.groupPending;
      save();
    }
    const name = 'sf-' + digest.slice(0, 48);
    let row = shelf.assets[fileName];
    if (!row || row.sha256 !== digest) row = { name, sha256: digest, status: 'New' };
    const resource = () => ({
      assetId: row.id!,
      uri: 'asset://' + row.id,
      groupId: shelf.groupId,
      status: row.status,
      sha256: digest,
      project,
    });
    if (row.status === 'Failed')
      throw new Error(
        'modelark_asset_failed: ' + row.id + ' failed review; inspect the asset or choose a revised panel',
      );
    let published: Awaited<ReturnType<typeof publishFiles>> | undefined;
    try {
      if (!row.id) {
        const found = await findNamed(
          'ListAssets',
          { GroupIds: [shelf.groupId!], GroupType: shelf.groupType },
          name,
        );
        if (found) row.id = found.Id;
        else {
          if (row.status === 'Submitting')
            throw new Error('modelark_asset_unknown: reconcile the pending upload before submitting again');
          published = await publishFiles([image]);
          if (digest !== sha(readFileSync(image)))
            throw new Error('modelark_asset_stale: sheet image changed before submission');
          row.status = 'Submitting';
          shelf.assets[fileName] = row;
          save();
          try {
            row.id = (
              await arkAssetCall('CreateAsset', {
                Name: name,
                URL: published.urls[0],
                AssetType: 'Image',
                GroupId: shelf.groupId,
              })
            ).Id;
          } catch (error) {
            if ((error as { definite?: boolean }).definite) {
              row.status = 'New';
              save();
            }
            throw error;
          }
          if (!row.id) throw new Error('modelark_asset_unknown: no asset ID returned');
        }
        row.status = 'Processing';
        shelf.assets[fileName] = row;
        save();
      }
      for (let attempt = 0; attempt < 30; attempt++) {
        const asset = await arkAssetCall('GetAsset', { Id: row.id });
        if (asset.Id !== row.id || asset.GroupId !== shelf.groupId || asset.AssetType !== 'Image')
          throw new Error('modelark_asset_identity_conflict: wrong asset returned');
        if (asset.Status === 'Active' || asset.Status === 'Failed') {
          if (row.status !== asset.Status) {
            row.status = asset.Status;
            save();
          }
          if (sha(readFileSync(image)) !== digest)
            throw new Error('modelark_asset_stale: reference image changed during review');
          if (row.status === 'Failed')
            throw new Error('modelark_asset_failed: ' + row.id + ' ' + (asset.Error?.Code ?? 'review failed'));
          return resource();
        }
        if (asset.Status !== 'Processing') throw new Error('modelark_asset_status: ' + String(asset.Status));
        if (attempt < 29) await delay(2000);
      }
      throw new Error('modelark_asset_processing: retry registration to resume polling ' + row.id);
    } finally {
      await published?.close();
    }
  } finally {
    await release();
  }
}

/** Resolve the actual sheet or an exact storyboard copy. A different shot image keeps its authored role. */
function usesPortraitLibrary(identity: string, file: string, faceDeclared?: boolean): boolean {
  const doc = identityBlock(identity).doc;
  const libraries: Shelf[] = Object.values(doc.modelArk?.libraries ?? {});
  if (libraries.some((library) => Object.hasOwn(library.assets, file))) return true;
  const manifest = path.join(path.dirname(identity), 'panels.json');
  const panels = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).panels : {};
  const facePanel = [panels?.face?.file, panels?.msr?.file].includes(file);
  // The shot-level declaration also accompanies ordinary fitting panels in a mixed request.
  if (!facePanel && [panels?.front?.file, panels?.back?.file].includes(file)) return false;
  if (faceDeclared === true) return true;
  return facePanel;
}

export function portraitForImage(file: string, output?: string, faceDeclared?: boolean): Input | undefined {
  try {
    return matchPortrait(file, output, faceDeclared);
  } catch (error) {
    throw error instanceof PortraitError ? error : new PortraitError(error);
  }
}

function matchPortrait(file: string, output?: string, faceDeclared?: boolean): Input | undefined {
  const image = realpathSync(file),
    folder = path.dirname(image);
  if (
    path.basename(path.dirname(folder)) === 'characters' &&
    path.basename(path.dirname(path.dirname(folder))) === 'assets' &&
    existsSync(path.join(folder, 'identity.md'))
  ) {
    const identity = path.join(folder, 'identity.md'),
      filename = path.basename(image);
    return usesPortraitLibrary(identity, filename, faceDeclared)
      ? { identityPath: identity, panel: filename }
      : undefined;
  }
  if (!output) return;
  let dir = path.resolve(output);
  while (!existsSync(path.join(dir, 'storyboard', 'cast.json'))) {
    if (dir === path.dirname(dir)) return;
    dir = path.dirname(dir);
  }
  const board = path.join(dir, 'storyboard'),
    cast = JSON.parse(readFileSync(path.join(board, 'cast.json'), 'utf8')).characters;
  const characters = Array.isArray(cast) ? cast : Object.values(cast ?? {});
  const digest = sha(readFileSync(image));
  const matches: Input[] = [];
  for (const member of characters) {
    if (!member?.source || typeof member.source !== 'string') continue;
    const identity = sheetFile(path.resolve(board, member.source));
    if (path.basename(path.dirname(identity)) !== member.id)
      throw new Error('modelark_asset_cast: character does not own its sheet');
    const manifest = path.join(path.dirname(identity), 'panels.json');
    if (!existsSync(manifest)) continue;
    const panels = JSON.parse(readFileSync(manifest, 'utf8')).panels ?? {};
    for (const panel of Object.keys(panels)) {
      const entry = panels[panel];
      if (typeof entry?.file === 'string' && !existsSync(path.join(path.dirname(identity), entry.file))) continue;
      const source = portraitImage(identity, panel);
      if (
        sha(readFileSync(source)) === digest &&
        usesPortraitLibrary(identity, path.basename(source), faceDeclared)
      ) {
        matches.push({ identityPath: identity, panel });
        break;
      }
    }
  }
  if (matches.length > 1)
    throw new Error(
      'modelark_asset_ambiguous: identical copied reference belongs to several cast members; use its canonical sheet file',
    );
  return matches[0];
}
