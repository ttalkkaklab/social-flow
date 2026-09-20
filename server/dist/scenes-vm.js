/**
 * Evaluate a `scenes.js` file in an isolated realm and return its window data as plain JSON.
 * The context has no host objects: window and the silent console are created inside it, and
 * only a JSON string crosses the boundary. Dynamic string compilation is disabled.
 */
import vm from 'node:vm';
export const SCENES_VM_POLICY = Object.freeze({
    timeoutMs: 5000,
    codeGeneration: Object.freeze({ strings: false, wasm: false }),
});
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function describeEvaluationError(error, filename) {
    const detail = error && typeof error === 'object' ? error : {};
    const message = typeof detail.message === 'string' ? detail.message : String(error);
    const stack = typeof detail.stack === 'string' ? detail.stack : '';
    const locations = [...stack.matchAll(new RegExp(`${escapeRegExp(filename)}:([0-9]+)(?::([0-9]+))?`, 'g'))];
    const location = locations.find((match) => match[2]) ?? locations[0];
    const line = location?.[1] ?? '1';
    const column = location?.[2] ?? '1';
    const wrapped = new Error(`${filename}:${line}:${column}: ${message}. ` +
        'Allowed syntax: storyboard JavaScript that assigns JSON-serializable data to window.*; eval and Function are disabled.');
    wrapped.name = typeof detail.name === 'string' ? detail.name : 'Error';
    wrapped.cause = error;
    return wrapped;
}
/** Evaluate the script and return window as plain objects. */
export function evaluateWindowScript(source, options = {}) {
    const timeout = options.timeoutMs ?? SCENES_VM_POLICY.timeoutMs;
    const filename = options.filename ?? 'scenes.js';
    const context = vm.createContext(Object.create(null), {
        codeGeneration: SCENES_VM_POLICY.codeGeneration,
    });
    try {
        vm.runInContext('var window = {}; var console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };', context, { timeout });
        vm.runInContext(source, context, { filename, timeout });
        const json = vm.runInContext('JSON.stringify(window)', context, { timeout });
        if (typeof json !== 'string')
            throw new Error('the script did not leave a window object');
        const plain = JSON.parse(json);
        if (!plain || typeof plain !== 'object' || Array.isArray(plain)) {
            throw new Error('the script replaced window with a non-object');
        }
        return plain;
    }
    catch (error) {
        throw describeEvaluationError(error, filename);
    }
}
