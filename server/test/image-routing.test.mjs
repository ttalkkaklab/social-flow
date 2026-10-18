import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planImage, executeImage, imageStatus, routeLegacyImage } from '../dist/image-routing.js';
import { imageTransaction } from '../dist/image-state.js';
import { config } from '../dist/config.js';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
function fixture(t, image = { engine: 'zimage' }, auth) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-route-'));
  fs.mkdirSync(path.join(dir, 'storyboard'));
  const board = { modelSettings: { models: { image } }, ...(auth ? { imageAuthorization: auth } : {}) };
  const write = () => fs.writeFileSync(path.join(dir, 'storyboard/scenes.js'), 'window.PRODUCTION = ' + JSON.stringify(board));
  write();
  const original = process.env.MFLUX_ZIMAGE_BIN;
  process.env.MFLUX_ZIMAGE_BIN = process.execPath;
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); if (original === undefined) delete process.env.MFLUX_ZIMAGE_BIN; else process.env.MFLUX_ZIMAGE_BIN = original; });
  const plan = (requestId = 'attempt-1', args = {}, extra = {}) => planImage({ directory: dir, assetId: 'shot-1', requestId, operation: 'text', args: { prompt: 'a cup', ...args }, ...extra });
  return { dir, board, write, plan, run: (p, dispatch) => executeImage({ directory: dir, planId: p.id }, dispatch) };
}
function output(args) {
  const file = args.savePath || path.join(args.outputPath, args.filename);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, png);
  return { content: [{ type: 'text', text: 'ok' }] };
}

test('managed success verifies actual image and reuses one receipt without another dispatch', async t => {
  const f = fixture(t); const p = f.plan(); let calls = 0;
  const dispatch = async (_tool, args) => { calls++; return output(args); };
  const first = await f.run(p, dispatch);
  assert.equal(first.imageReceipt.output.width, 1);
  assert.equal(first.imageReceipt.review, 'not_reviewed');
  assert.deepEqual(await f.run(p, dispatch), first); assert.equal(calls, 1);
  const job = imageStatus({ directory: f.dir, requestId: p.requestId });
  assert.equal(job.status, 'completed'); assert.equal(job.reserveUsd, 0);
  fs.writeFileSync(p.outputFile, 'corrupt');
  await assert.rejects(f.run(p, dispatch)); assert.equal(calls, 1);
});

test('plan rejects mismatch, unknown fields, invalid operations and escaped outputs before any dispatch', t => {
  const f = fixture(t);
  assert.throws(() => f.plan('a', { surprise: true }), /argument_unsupported/);
  assert.throws(() => f.plan('a', {}, { tool: 'gpt_image_text2img' }), /selection_mismatch/);
  assert.throws(() => f.plan('a', {}, { operation: 'edit' }), /operation_unsupported/);
  assert.throws(() => f.plan('a', { outputPath: '../outside' }), /output_outside/);
  assert.throws(() => f.plan('a', { filename: 'state.json' }));
  fs.symlinkSync(os.tmpdir(), path.join(f.dir, 'escape'));
  assert.throws(() => f.plan('a', { outputPath: 'escape' }), /output_outside/);
});

test('selection/input changes stale a plan; configured raw calls cannot bypass context', async t => {
  const f = fixture(t, { engine: 'mlx', model: 'Krea-2-Turbo' });
  fs.writeFileSync(path.join(f.dir, 'source.png'), png);
  const p = f.plan('a', { imagePath: 'source.png', strength: 0.5 }, { operation: 'variation' });
  fs.appendFileSync(path.join(f.dir, 'source.png'), 'changed');
  await assert.rejects(f.run(p, async () => assert.fail('must not dispatch')), /plan_stale/);
  await assert.rejects(routeLegacyImage('image_local_generate', { prompt: 'x', outputPath: f.dir }, async () => assert.fail()), /context_required/);
  f.board.modelSettings.models.image = { engine: 'host', host: 'codex', model: 'host-managed' }; f.write();
  await assert.rejects(f.run(p, async () => assert.fail()), /plan_stale/);
  const host = f.plan('host'); assert.equal(host.execution, 'host_handoff');
  await assert.rejects(f.run(host, async () => assert.fail()), /host_handoff_required/);
});

test('ambiguous failure retains reservation and blocks resubmission until explicit reconciliation', async t => {
  const f = fixture(t); const p = f.plan(); let calls = 0;
  await assert.rejects(f.run(p, async () => { calls++; throw new Error('timeout'); }), /timeout/);
  assert.equal(imageStatus({ directory: f.dir, requestId: p.requestId }).status, 'submission_unknown');
  await assert.rejects(f.run(p, async () => { calls++; return {}; }), /request_pending/);
  await assert.rejects(f.run(f.plan('next'), async () => assert.fail()), /concurrency_limit/);
  assert.throws(() => imageStatus({ directory: f.dir, requestId: p.requestId, action: 'reconcile' }), /requires_billing/);
  imageStatus({ directory: f.dir, requestId: p.requestId, action: 'reconcile', spentUsd: 0, evidence: 'Local child exited without output' });
  assert.equal(calls, 1);
  assert.equal((await f.run(f.plan('after'), async (_tool,args) => output(args))).isError, undefined);
});

test('paid reservation is atomic and measured tokens settle without assuming cached input discounts', async t => {
  const previous = config.openaiApiKey; config.openaiApiKey = 'test-only'; t.after(() => { config.openaiApiKey = previous; });
  const f = fixture(t, { engine: 'gpt-image', model: 'gpt-image-2', quality: 'low' }, { reference: 'test authorization', maxUsd: 1, maxConcurrent: 2, maxAttempts: 3 });
  assert.throws(() => f.plan(), /quote_required/);
  const p = f.plan('paid', {}, { reserveUsd: 0.6 });
  let release; const ready = new Promise(resolve => { release = resolve; });
  const run = f.run(p, async (_tool, args) => { await ready; return { ...output(args), imageReceipt: { requestId: 'provider-1', usage: { input_tokens_details: { text_tokens: 100, image_tokens: 200 }, output_tokens: 1000 } } }; });
  await assert.rejects(f.run(f.plan('second', {}, { reserveUsd: 0.6 }), async () => assert.fail()), /budget_exceeded/);
  release(); await run;
  const job = imageStatus({ directory: f.dir, requestId: 'paid' });
  assert.equal(job.providerId, 'provider-1'); assert.ok(Math.abs(job.spentUsd - 0.0321) < 1e-10);
});

test('state lock, corrupt state and historical spending fail closed', async t => {
  const f = fixture(t); const p = f.plan();
  const folder = path.join(f.dir, '.work/image-routing');
  fs.writeFileSync(path.join(folder, 'state.lock'), 'owner');
  assert.throws(() => imageTransaction(f.dir, undefined, () => {}), /state_busy/);
  fs.unlinkSync(path.join(folder, 'state.lock'));
  fs.writeFileSync(path.join(f.dir, '.work/cost-tally.tsv'), 'image.gpt-image-2.high\t1\told\n');
  await assert.rejects(f.run(p, async () => assert.fail()), /history_unreconciled/);
  fs.writeFileSync(path.join(folder, 'state.json'), '{"version":1,"openingSpendUsd":-1,"jobs":{}}');
  await assert.rejects(f.run(p, async () => assert.fail()));
});

test('interrupted submitting requests require stopped executor evidence; prototype IDs stay usable', async t => {
  const f = fixture(t); const p = f.plan('constructor');
  imageTransaction(f.dir, 0, () => {});
  assert.equal(imageStatus({ directory: f.dir, requestId: 'constructor' }).status, 'not_started');
  await f.run(p, async (_tool, args) => output(args));
  imageTransaction(f.dir, undefined, state => { state.jobs.constructor.status = 'submitting'; });
  const reconcile = { directory: f.dir, requestId: 'constructor', action: 'reconcile', spentUsd: 0, evidence: 'Provider terminal and executor checked' };
  assert.throws(() => imageStatus(reconcile), /requires_executor_stopped/);
  assert.throws(() => imageStatus({ ...reconcile, executorStopped: true }), /executor_still_running/);
  imageTransaction(f.dir, undefined, state => { delete state.jobs.constructor.ownerPid; delete state.jobs.constructor.ownerHost; });
  assert.equal(imageStatus({ ...reconcile, executorStopped: true }).status, 'failed');
  await f.run(f.plan('next'), async (_tool, args) => output(args));
});

test('GenAI image planning requires a reservation and recovery preserves provider evidence', async t => {
  const { astraGenaiBaseUrl } = await import('../dist/astra-genai-client.js');
  const f = fixture(t, { engine:'astra-genai', model:'z-image-turbo' }, { reference:'fixture',maxUsd:1 });
  const key=config.astraGenaiApiKey;config.astraGenaiApiKey='fixture';t.after(()=>config.astraGenaiApiKey=key);
  assert.throws(()=>f.plan(),/quote_required/);
  const p=f.plan('genai',{}, {reserveUsd:0.1});assert.equal(p.tool,'astra_genai_text2img');
  assert.throws(()=>f.plan('edit',{}, {operation:'edit',reserveUsd:0}),/operation_unsupported/);
  await assert.rejects(f.run(p,async (_tool,args)=>{
    output(args);
    const { readImageMetadata } = await import('../dist/image-media.js');
    const imagePath=path.join(args.outputPath,args.filename);
    fs.writeFileSync(imagePath+'.astra-genai.json',JSON.stringify({baseUrl:astraGenaiBaseUrl(),fingerprint:'fixture',imagePath,status:'completed',requestId:'image-provider-1',output:readImageMetadata(imagePath),usage:{image_count:1}}));
    throw new Error('interrupted');
  }),/interrupted/);
  const job=await imageStatus({directory:f.dir,requestId:'genai',action:'refresh'});
  assert.equal(job.status,'completed');assert.equal(job.providerId,'image-provider-1');assert.equal(job.reserveUsd,0.1);
  await f.run(p,async()=>assert.fail('must reuse recovered image'));
});
