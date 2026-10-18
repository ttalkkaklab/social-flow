import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../skills/_shared/video-duration.js
var require_video_duration = __commonJS({
  "../skills/_shared/video-duration.js"(exports, module) {
    "use strict";
    function positive(value, name) {
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
        throw new Error(name + " must be finite positive seconds");
      return value;
    }
    function nonnegative(value, name) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw new Error(name + " must be finite nonnegative seconds");
      return value;
    }
    function minimumDuration2(requiredSeconds, limits) {
      positive(requiredSeconds, "requiredSeconds");
      let durationSeconds, numFrames;
      if (limits.seconds) {
        durationSeconds = limits.seconds.find((seconds) => seconds >= requiredSeconds);
      } else if (limits.frameRate !== void 0) {
        const fps = positive(limits.frameRate, "frameRate");
        numFrames = Math.max(limits.min, 1 + limits.step * Math.ceil((requiredSeconds * fps - 1) / limits.step));
        if (numFrames / fps < requiredSeconds) numFrames += limits.step;
        while (numFrames - limits.step >= limits.min && (numFrames - limits.step) / fps >= requiredSeconds)
          numFrames -= limits.step;
        if (numFrames <= limits.max) durationSeconds = numFrames / fps;
      } else {
        durationSeconds = Math.max(limits.min, Math.ceil(requiredSeconds));
        if (durationSeconds > limits.max) durationSeconds = void 0;
      }
      if (durationSeconds === void 0) throw new Error("Required " + requiredSeconds + "s exceeds this route's duration limit; split or replan the shot. No truncation or automatic model switch.");
      return {
        requiredSeconds,
        requestedSeconds: durationSeconds,
        excessSeconds: durationSeconds - requiredSeconds,
        ...numFrames === void 0 ? { durationSeconds } : { numFrames, frameRate: limits.frameRate }
      };
    }
    function shotTiming(scene, { performanceSeconds, audioSeconds, edit = {}, outputFps = 30 } = {}) {
      const plannedSeconds = positive(scene.duration, "scene.duration");
      const measured = [performanceSeconds, audioSeconds].filter((value) => value !== void 0 && value !== null);
      for (const value of measured) nonnegative(value, "measured duration");
      const pre = nonnegative(edit.pre ?? 0, "edit.pre");
      const post = nonnegative(edit.post ?? 0, "edit.post");
      const sourceIn = nonnegative(edit.in ?? scene.edit?.in ?? 0, "edit.in");
      const handle = nonnegative(edit.handle ?? 0, "outgoing handle");
      const fps = positive(outputFps, "outputFps");
      const body = Math.max(plannedSeconds, measured.length ? Math.max(...measured) + pre + post : plannedSeconds);
      const bodySeconds = Math.ceil(body * fps) / fps;
      const handleSeconds = Math.ceil(handle * fps) / fps;
      return {
        plannedSeconds,
        bodySeconds,
        sourceIn,
        handleSeconds,
        requiredSeconds: sourceIn + bodySeconds + handleSeconds
      };
    }
    module.exports = { minimumDuration: minimumDuration2, shotTiming };
  }
});

// src/storyboard.ts
import { createHash } from "node:crypto";

// src/scenes-vm.ts
import vm from "node:vm";
var SCENES_VM_POLICY = Object.freeze({
  timeoutMs: 5e3,
  codeGeneration: Object.freeze({ strings: false, wasm: false })
});
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function describeEvaluationError(error, filename) {
  const detail = error && typeof error === "object" ? error : {};
  const message = typeof detail.message === "string" ? detail.message : String(error);
  const stack = typeof detail.stack === "string" ? detail.stack : "";
  const locations = [...stack.matchAll(new RegExp(`${escapeRegExp(filename)}:([0-9]+)(?::([0-9]+))?`, "g"))];
  const location = locations.find((match) => match[2]) ?? locations[0];
  const line = location?.[1] ?? "1";
  const column = location?.[2] ?? "1";
  const wrapped = new Error(
    `${filename}:${line}:${column}: ${message}. Allowed syntax: storyboard JavaScript that assigns JSON-serializable data to window.*; eval and Function are disabled.`
  );
  wrapped.name = typeof detail.name === "string" ? detail.name : "Error";
  wrapped.cause = error;
  return wrapped;
}
function evaluateWindowScript(source, options = {}) {
  const timeout = options.timeoutMs ?? SCENES_VM_POLICY.timeoutMs;
  const filename = options.filename ?? "scenes.js";
  const context = vm.createContext(/* @__PURE__ */ Object.create(null), {
    codeGeneration: SCENES_VM_POLICY.codeGeneration
  });
  try {
    vm.runInContext(
      "var window = {}; var console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };",
      context,
      { timeout }
    );
    vm.runInContext(source, context, { filename, timeout });
    const json = vm.runInContext("JSON.stringify(window)", context, { timeout });
    if (typeof json !== "string") throw new Error("the script did not leave a window object");
    const plain = JSON.parse(json);
    if (!plain || typeof plain !== "object" || Array.isArray(plain)) {
      throw new Error("the script replaced window with a non-object");
    }
    return plain;
  } catch (error) {
    throw describeEvaluationError(error, filename);
  }
}

// src/storyboard.ts
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object2) => {
    const keys = [];
    for (const key in object2) {
      if (Object.prototype.hasOwnProperty.call(object2, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path: path5, errorMaps, issueData } = params;
  const fullPath = [...path5, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path5, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path5;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas2, params) => {
  if (!Array.isArray(schemas2)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas2,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// src/storyboard.ts
var PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
var REFERENCES_DIR = join(PLUGIN_ROOT, "skills", "storyboard", "references");
var CONTRACT_FILE = join(REFERENCES_DIR, "structure-contract.js");
var CHECK_SCENES_FILE = join(REFERENCES_DIR, "check-scenes.js");
var CHECK_SCENARIO_FILE = join(REFERENCES_DIR, "check-scenario.js");
var loadFromHere = nodeModule.createRequire(import.meta.url);
var contractCache;
function contract() {
  if (!contractCache) contractCache = loadFromHere(CONTRACT_FILE);
  return contractCache;
}
function cameraContract() {
  return loadFromHere(join(REFERENCES_DIR, "production-mode.js"));
}
function techniqueContract() {
  return loadFromHere(join(REFERENCES_DIR, "film-techniques.js"));
}
var techniqueSelectionSchema = external_exports.array(external_exports.object({
  id: nonEmptyTechniqueId(),
  reason: external_exports.string().trim().min(1).describe("Why this technique serves this shot\u2019s information or action")
}).strict()).superRefine((value, ctx) => {
  for (const message of techniqueContract().validate(value))
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message });
});
function nonEmptyTechniqueId() {
  return external_exports.string().trim().min(1).describe("Stable id from storyboard_read techniqueCatalog");
}
function motionThemeContract() {
  return loadFromHere(join(REFERENCES_DIR, "motion-graphics.js"));
}
function motionGraphicTypes() {
  const registry = loadFromHere(join(REFERENCES_DIR, "motion-graphics.js"));
  return Object.keys(registry.TYPES);
}
var tuple = (list) => external_exports.enum(list);
var MISSING = ["__contract-missing__"];
function vocabAtLoad() {
  try {
    return contract().VOCAB;
  } catch {
    return {
      SIZES: MISSING,
      ANGLES: MISSING,
      BEATS: MISSING,
      TYPES: MISSING,
      INFO_TYPES: MISSING,
      SHARE_TYPES: MISSING,
      HOOK_TYPES: MISSING,
      HOOK_FORMS: MISSING,
      ARCS: MISSING,
      RENDER_MODES: MISSING,
      PRODUCTION_MODES: MISSING,
      CHARGES_OPEN: MISSING,
      CHARGES_CLOSE: MISSING,
      TRANSITION_RE: /^$/
    };
  }
}
var V = vocabAtLoad();
var nonEmpty = external_exports.string().trim().min(1);
var STRUCTURE_VERSION = (() => {
  try {
    return contract().VERSION;
  } catch {
    return "structure-v1";
  }
})();
var sceneSchema = external_exports.object({
  no: external_exports.number().int().positive().describe("Scene number \u2014 the value shots point at with `scene`"),
  place: external_exports.string().optional().describe("One place \u2014 the slugline location"),
  time: external_exports.string().optional().describe("One continuous stretch of time \u2014 \uB0AE \xB7 \uBC24 \xB7 \uC0C8\uBCBD \xB7 10\uB144 \uB4A4"),
  event: external_exports.string().optional().describe("The one thing that happens in this scene"),
  charge: external_exports.record(external_exports.unknown()).optional(),
  turn: external_exports.string().optional().describe("What flipped between the open and the close"),
  out: nonEmpty.optional().describe("The sentence the scene goes out on \u2014 the one that forces a \uADF8\uB7F0\uB370 or \uADF8\uB798\uC11C into the next scene")
}).strict();
var sequenceSchema = external_exports.object({
  id: nonEmpty.describe('Stable id, e.g. "q1"'),
  title: external_exports.string().optional().describe("The heading the approval page draws"),
  purpose: external_exports.string().optional().describe("The one purpose that binds these scenes \u2014 two purposes are two sequences"),
  question: nonEmpty.optional().describe("The dramatic question this stretch opens"),
  payoff: external_exports.number().int().positive().optional().describe("The scene number that answers the question"),
  scenes: external_exports.array(external_exports.number().int().positive()).describe("Scene numbers in playback order")
}).strict();
var structureSchema = external_exports.object({
  version: external_exports.literal(STRUCTURE_VERSION),
  nextShotId: external_exports.number().int().positive().optional(),
  sequences: external_exports.array(sequenceSchema),
  scenes: external_exports.array(sceneSchema)
}).strict();
var coverageSchema = external_exports.object({
  azimuth: external_exports.number().finite().optional().describe("Horizontal camera bearing, 0\u2013180\xB0 inside the selected side of the axis"),
  action: external_exports.string().trim().min(1).optional().describe("Visible action that carries this cut when no 30\xB0 or two-step change is used")
}).passthrough();
var lineCrossingSchema = external_exports.object({
  method: external_exports.enum(["camera_move", "subject_move", "neutral", "intentional"]),
  from: nonEmpty.describe("The previous space.line value"),
  to: nonEmpty.describe("The new space.line value"),
  reason: nonEmpty.describe("What the viewer sees that makes the new side legible"),
  bridgeShot: external_exports.number().int().positive().optional().describe('Earlier neutral shot number; required only for method "neutral"')
}).strict();
var compositionSchema = external_exports.record(external_exports.unknown());
var eyelineSchema = external_exports.object({ matchShot: external_exports.number().int().positive().optional() }).passthrough();
var depthSchema = external_exports.record(external_exports.unknown());
var cameraSchema = external_exports.record(external_exports.unknown()).superRefine((value, ctx) => {
  for (const message of cameraContract().cameraInputErrors(value))
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message });
});
var visualSchema = external_exports.object({ camera: cameraSchema.optional() }).passthrough();
var shotIdSchema = external_exports.string().regex(/^s\d{4,}$/);
var shotSchema = external_exports.object({
  id: shotIdSchema.optional(),
  type: tuple(V.TYPES),
  title: external_exports.string().optional(),
  narration: external_exports.array(external_exports.object({ id: external_exports.string().trim().min(1).optional(), delivery: external_exports.enum(["voiceover", "on_screen", "off_screen"]).optional(), tts: external_exports.string(), sub: external_exports.string().optional(), speaker: external_exports.string().trim().min(1).optional() }).passthrough()).optional(),
  visual: visualSchema.optional(),
  duration: external_exports.number().positive().optional(),
  scene: external_exports.number().int().positive().optional(),
  sceneSlug: external_exports.string().optional(),
  sequence: external_exports.string().optional(),
  transition: external_exports.string().regex(V.TRANSITION_RE, "not a join from scenes-schema \xA7scene transition").optional(),
  beat: external_exports.string().optional(),
  arc: external_exports.string().optional(),
  hookType: external_exports.string().optional(),
  hookForm: external_exports.string().optional(),
  chapter: external_exports.string().optional(),
  after: external_exports.number().int().nonnegative().optional(),
  shot: external_exports.object({
    techniques: techniqueSelectionSchema.optional(),
    feel: external_exports.string().optional(),
    size: external_exports.string().optional(),
    angle: external_exports.string().optional(),
    why: external_exports.string().optional(),
    info: external_exports.string().optional(),
    infoType: external_exports.string().optional(),
    share: external_exports.string().optional(),
    shareType: external_exports.string().optional(),
    space: external_exports.record(external_exports.unknown()).optional(),
    eyeline: eyelineSchema.optional(),
    composition: compositionSchema.optional(),
    depth: depthSchema.optional(),
    coverage: coverageSchema.optional(),
    lineNeutral: external_exports.literal(true).optional(),
    lineCrossing: external_exports.record(external_exports.unknown()).optional(),
    motionGraphic: external_exports.object({
      version: external_exports.literal(1),
      type: external_exports.string().refine((value) => motionGraphicTypes().includes(value), "unknown motion graphic type"),
      intent: external_exports.string().optional(),
      reason: external_exports.string().optional(),
      evidence: external_exports.enum(["data", "recording", "reenactment", "metaphor"]),
      style: external_exports.object({
        palette: external_exports.string().optional(),
        reason: external_exports.string().optional(),
        theme: external_exports.object({
          id: external_exports.string().refine((value) => value === "auto" || Object.hasOwn(motionThemeContract().THEMES, value), "unknown motion theme"),
          context: external_exports.enum(["research", "software", "education", "campaign", "storytelling", "friendly"]).optional(),
          reason: external_exports.string().optional()
        }).passthrough().optional()
      }).passthrough(),
      beats: external_exports.array(external_exports.object({ at: external_exports.number().min(0).max(1), action: external_exports.string() }).passthrough()).optional(),
      content: external_exports.record(external_exports.unknown()).optional()
    }).passthrough().optional(),
    render: external_exports.object({ mode: tuple(V.RENDER_MODES), purpose: external_exports.string().optional(), reason: external_exports.string().optional() }).passthrough().optional()
  }).passthrough().optional(),
  sound: external_exports.record(external_exports.unknown()).optional()
}).passthrough();
var readLevelSchema = external_exports.enum(["outline", "scenes", "shots", "full"]);
var storyboardReadSchema = external_exports.object({
  path: external_exports.string().min(1).describe("The storyboard directory, or its scenes.js"),
  level: readLevelSchema.default("shots").describe("outline = sequences with scene numbers \xB7 scenes = scene cards with shot numbers \xB7 shots = every shot summarised under its scene \xB7 full = the raw shot objects too"),
  shotId: external_exports.string().min(1).optional().describe("Stable shot ID to inspect, with its raw plan and neighboring shot IDs"),
  includeTechniques: external_exports.boolean().default(true).describe("Return canonical technique ids, purposes, icons and provider instructions"),
  includeContext: external_exports.boolean().default(true).describe("Include STORY, PRODUCTION and SB_DOC as unverified review context")
});
var storyboardCheckSchema = external_exports.object({
  path: external_exports.string().min(1).describe("The storyboard directory, or its scenes.js"),
  draft: external_exports.boolean().default(false).describe("The story pass (storyboard \xA74a) \u2014 machine-layer absences are deferred, not violations")
});
var scenarioCheckSchema = external_exports.object({
  path: external_exports.string().min(1).describe("The candidates directory, or its selected scenario.md")
});
var productionSchema = external_exports.object({ mode: tuple([...V.PRODUCTION_MODES, "hook_only", "stills_only", "hybrid"]).optional(), renderRatioVersion: external_exports.literal(1).optional() }).passthrough();
var globalsSchema = external_exports.record(external_exports.string().regex(/^[A-Z][A-Z0-9_]*$/, "a window.* global is UPPER_CASE"), external_exports.unknown()).superRefine((value, ctx) => {
  if (value.PRODUCTION === void 0) return;
  const parsed = productionSchema.safeParse(value.PRODUCTION);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ["PRODUCTION", ...issue.path] });
});
var transitionPatchSchema = external_exports.object({
  no: external_exports.number().int().positive().describe("Incoming shot number, 1-based, after removals and inserts"),
  transition: external_exports.enum([
    "cut",
    "dip",
    "dip:white",
    "jcut",
    "dissolve",
    "iris",
    "blur",
    "zoom",
    "push:l2r",
    "push:r2l",
    "push:u2d",
    "push:d2u",
    "whip:l2r",
    "whip:r2l",
    "whip:u2d",
    "whip:d2u"
  ]),
  transitionSeconds: external_exports.number().finite().min(0.08).max(0.8).optional(),
  reason: nonEmpty,
  continuity: nonEmpty.optional()
}).strict().refine(
  (v) => !["cut", "dip", "dip:white"].includes(v.transition) || v.transitionSeconds === void 0,
  "cut and dip do not accept transitionSeconds; dip fades each side for up to 0.30 seconds"
);
var storyboardApplySchema = external_exports.object({
  path: external_exports.string().min(1).describe("The storyboard directory (scenes.js is created there when missing), or its scenes.js"),
  draft: external_exports.boolean().default(false).describe("The story pass (storyboard \xA74a) \u2014 camera-continuity records (lineCrossing, coverage) are deferred, not violations"),
  set: external_exports.object({ structure: structureSchema.optional(), shots: external_exports.array(shotSchema).min(1) }).optional().describe("Replace the whole board \u2014 the structure and every shot. The way a new board is written"),
  structure: structureSchema.optional().describe("Replace window.STRUCTURE only"),
  sequences: external_exports.array(sequenceSchema).optional().describe("Upsert sequences by id"),
  scenes: external_exports.array(sceneSchema).optional().describe("Upsert scenes by no"),
  shots: external_exports.array(external_exports.object({ no: external_exports.number().int().positive(), shot: shotSchema })).optional().describe("Upsert shots by 1-based position; no = length + 1 appends"),
  shotsById: external_exports.array(external_exports.object({ id: shotIdSchema, shot: shotSchema })).optional().describe("Replace shots by their stable id (R6); the shot keeps that id. An unknown id is an error, nothing is written"),
  insertShots: external_exports.array(external_exports.object({
    after: external_exports.number().int().min(0).optional(),
    afterId: shotIdSchema.optional(),
    shots: external_exports.array(shotSchema).min(1)
  }).refine((e) => e.after === void 0 !== (e.afterId === void 0), { message: "give exactly one of after (position) or afterId (shot id)" })).optional().describe("Insert shots after a 1-based position (0 = at the start) or after the shot with afterId. Later positions shift"),
  transitions: external_exports.array(transitionPatchSchema).min(1).optional().describe("Change only incoming transitions; dip fades through black. Keeps narration and visuals intact"),
  removeShots: external_exports.array(external_exports.number().int().positive()).optional().describe("1-based positions to drop, resolved before the insert"),
  removeShotIds: external_exports.array(shotIdSchema).min(1).optional().describe("Shot ids to drop, resolved before the insert"),
  removeScenes: external_exports.array(external_exports.number().int().positive()).optional(),
  removeSequences: external_exports.array(external_exports.string()).optional(),
  globals: globalsSchema.optional().describe("Set other window.* blocks \u2014 FORMAT, THEME, COMPREHENSION, STORY, PRODUCTION, MUSIC, SFX, VOICE, MOTION_POLICY"),
  expectedSha256: external_exports.string().regex(/^[a-f0-9]{64}$/).optional().describe("Required for propSheet file edits; use the hash from storyboard_read"),
  propSheet: external_exports.object({
    props: external_exports.array(external_exports.record(external_exports.unknown())),
    continuity: external_exports.record(external_exports.unknown()).optional()
  }).strict().optional().describe("Replace the prop registry and optional version:1 continuity ledger together. SB_DOC.characters must register every owner and holder. See prop-continuity.md"),
  dryRun: external_exports.boolean().default(false).describe("Validate and report, write nothing")
});
function scenesPath(target) {
  const abs = resolve(target);
  if (basename(abs) === "scenes.js") return abs;
  return join(abs, "scenes.js");
}
function readBoard(target) {
  const file = scenesPath(target);
  if (!existsSync(file)) throw new Error(`no scenes.js at ${file}`);
  if (!statSync(file).isFile()) throw new Error(`${file} is not a file`);
  const src = readFileSync(file, "utf8");
  const header = [];
  for (const line of src.split("\n")) {
    if (/^\s*\/\//.test(line)) header.push(line.trim());
    else if (line.trim()) break;
  }
  let win;
  try {
    win = evaluateWindowScript(src, { filename: file });
  } catch (e) {
    throw new Error(`failed to evaluate ${file}: ${e.message}`);
  }
  if (!Array.isArray(win.SCENES)) throw new Error(`${file} has no window.SCENES array`);
  return { file, header, win, sha256: createHash("sha256").update(src).digest("hex") };
}
var GLOBAL_ORDER = ["FORMAT", "VOICE", "THEME", "COMPREHENSION", "STORY", "PRODUCTION", "MOTION_POLICY", "MUSIC", "SFX", "STRUCTURE", "SCENES"];
function serializeBoard(win, header = []) {
  const keys = Object.keys(win).filter((k) => win[k] !== void 0);
  keys.sort((a, b) => {
    const ia = GLOBAL_ORDER.indexOf(a), ib = GLOBAL_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
  const lines = header.filter((h) => !/^\/\/\s*approved:/.test(h));
  if (lines.length) lines.push("");
  for (const k of keys) {
    const value = k === "SCENES" && Array.isArray(win[k]) ? win[k].map((shot) => shot.id === void 0 ? shot : { id: shot.id, ...shot }) : win[k];
    lines.push(`window.${k} = ${JSON.stringify(value, null, 2)};`);
  }
  return lines.join("\n") + "\n";
}
var scenarioCheckResultSchema = external_exports.object({
  files: external_exports.array(external_exports.string()),
  violations: external_exports.number().int().nonnegative(),
  warnings: external_exports.number().int().nonnegative(),
  findings: external_exports.array(external_exports.object({
    level: external_exports.enum(["bad", "warn"]),
    where: external_exports.string(),
    what: external_exports.string()
  }))
});

// src/video-routing.ts
import { createRequire as createRequire3 } from "node:module";
import { fileURLToPath as fileURLToPath3 } from "node:url";

// src/config.ts
import { accessSync, constants, existsSync as existsSync2, readFileSync as readFileSync2, readdirSync, statSync as statSync2 } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join as join2 } from "node:path";
function loadEnvFile(file = join2(process.env.SNS_TOKEN_DIR || join2(homedir(), ".config", "social-flow"), ".env")) {
  for (const [key, value] of Object.entries(process.env)) {
    if (value && /^\$\{[A-Za-z_][A-Za-z0-9_]*(:-[^}]*)?\}$/.test(value)) delete process.env[key];
  }
  let text;
  try {
    text = readFileSync2(file, "utf8");
  } catch {
    return [];
  }
  const filled = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) value = value.slice(1, -1);
    if (process.env[key]) continue;
    process.env[key] = value;
    filled.push(key);
  }
  return filled;
}
loadEnvFile();
var config = {
  /** SerpApi key (required by the serp_* research/fact-check tools) — https://serpapi.com/manage-api-key */
  serpApiKey: process.env.SERPAPI_API_KEY || "",
  /** Naver Open API credentials (required by the naver_search tool) — https://developers.naver.com/apps */
  naverClientId: process.env.NAVER_CLIENT_ID || "",
  naverClientSecret: process.env.NAVER_CLIENT_SECRET || "",
  /** data.go.kr auth key (required by datago_file_fetch/datago_api_call — search/detail/download need no auth) */
  dataGoKrApiKey: process.env.DATA_GO_KR_API_KEY || "",
  /** Pexels API key (optional — stock_search skips Pexels without it) — https://www.pexels.com/api/ */
  pexelsApiKey: process.env.PEXELS_API_KEY || "",
  /** Pixabay API key (optional — stock_search skips Pixabay without it) — https://pixabay.com/api/docs/ */
  pixabayApiKey: process.env.PIXABAY_API_KEY || "",
  /** Gemini API key (shared requirement of the veo_ and omni_ video, tts_* speech, and music_* music tools) — https://aistudio.google.com/apikey */
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
  /** OpenAI API key (required by the gpt_image_* image generation tools) — https://platform.openai.com/api-keys */
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  /** BytePlus ModelArk API key (required by the seedance_* video generation tools) — https://ai.byteplus.com/ark/region:ap-southeast-1/apikey */
  arkApiKey: process.env.ARK_API_KEY || "",
  /**
   * Suno API key (required by the suno_* music tools) — https://sunoapi.org/api-key
   *
   * Not an official Suno Inc. key. sunoapi.org (Kie.ai family) is a third-party
   * REST wrapper. Lyria (`music_*`) keeps working on GEMINI_API_KEY without this.
   */
  sunoApiKey: process.env.SUNO_API_KEY || "",
  /**
   * ElevenLabs API key (required by the tts_elevenlabs_* speech tools) — https://elevenlabs.io/app/settings/api-keys
   *
   * The hosted speech lane alongside Gemini (tts_generate).
   * Keys can be restricted per permission — synthesis needs
   * `text_to_speech`, the voice listing needs `voices_read`.
   */
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || "",
  /**
   * ASTRA video API key (required by the astra_* video generation tools).
   *
   * The self-hosted LTX lane — our own box, so there is no vendor bill and no vendor
   * policy, but also only one render at a time. The env name has no _API_KEY suffix
   * because that is what the server's operators issue it under.
   */
  astraVideoApiKey: process.env.ASTRA_VIDEO || "",
  /** Unified gateway token; never substitute the legacy ASTRA_VIDEO key. */
  astraGenaiApiKey: process.env.ASTRA_GENAI_API_KEY || "",
  /**
   * YouTube Data API key (youtube_topic_scout's preferred public-query path).
   * Unlike OAuth it doesn't spend your channel's quota. Without it, falls back to
   * channel OAuth (youtube.readonly).
   * https://console.cloud.google.com/apis/credentials
   */
  youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
  requestTimeoutMs: 15e3
};
var snsTokenDir = process.env.SNS_TOKEN_DIR || join2(homedir(), ".config", "social-flow");
var defaultSnsCredentialFiles = {
  THREADS: process.env.THREADS_TOKEN_FILE || join2(snsTokenDir, "threads_token"),
  INSTAGRAM: process.env.INSTAGRAM_TOKEN_FILE || join2(snsTokenDir, "instagram_token"),
  FACEBOOK: process.env.FACEBOOK_PAGE_TOKEN_FILE || join2(snsTokenDir, "facebook_page_token"),
  YOUTUBE: process.env.YOUTUBE_OAUTH_FILE || join2(snsTokenDir, "youtube-oauth-client.json")
};
var disabledToolsFile = join2(snsTokenDir, "disabled-tools.json");
function astraVideoBaseUrl() {
  return (process.env.ASTRA_VIDEO_URL || "https://video.astravision.co.kr").replace(/\/+$/, "");
}
function requireAstraVideoKey() {
  if (!config.astraVideoApiKey) {
    throw new Error(
      "ASTRA_VIDEO is not set. astra_* video generation tools talk to the self-hosted ASTRA video API (https://video.astravision.co.kr) and it rejects every route but /healthz without a key. Ask the server operator for a key and export ASTRA_VIDEO; point ASTRA_VIDEO_URL at another host only if you run a second box of the same server. Without it, veo_* (GEMINI_API_KEY), seedance_* (ARK_API_KEY) and mlx_video_generate (on-device) still work."
    );
  }
  return config.astraVideoApiKey;
}

// src/video-events.ts
import { AsyncLocalStorage } from "node:async_hooks";
var videoEvents = new AsyncLocalStorage();
function recordVideoSubmission(id) {
  if (id) videoEvents.getStore()?.submitted(id);
}

// src/media-utils.ts
import * as fs from "node:fs";
import * as path from "node:path";
var ALLOWED_EXTENSIONS = {
  image: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"],
  video: [".mp4", ".webm", ".mov", ".avi"],
  audio: [".wav", ".mp3", ".ogg", ".webm", ".aac", ".flac"],
  json: [".json"],
  mesh: [".glb"]
};
function validateFilePath(filePath, options) {
  const resolved = path.resolve(filePath);
  if (filePath.includes("..")) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
  if (options?.allowedExtensions) {
    const ext = path.extname(resolved).toLowerCase();
    if (!options.allowedExtensions.includes(ext)) {
      throw new Error(
        `File extension "${ext}" is not allowed. Allowed: ${options.allowedExtensions.join(", ")}`
      );
    }
  }
}
function resolveOutputFile(outputDir, filename, kind) {
  if (/[/\\]/.test(filename) || filename.includes("..")) {
    throw new Error(`filename must be a bare file name without path separators: "${filename}"`);
  }
  validateFilePath(filename, { allowedExtensions: ALLOWED_EXTENSIONS[kind] });
  const dir = path.resolve(outputDir);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}
function bareFilenameSchema(kind) {
  const allowed = ALLOWED_EXTENSIONS[kind];
  return external_exports.string().min(1).refine((name) => !/[/\\]/.test(name) && !name.includes(".."), {
    message: "filename must be a bare file name without path separators (use outputPath for the directory)"
  }).refine((name) => allowed.includes(path.extname(name).toLowerCase()), {
    message: `filename extension must be one of: ${allowed.join(", ")}`
  });
}

// src/video-client.ts
var VALID_VIDEO_MODELS = [
  "veo-3.1-generate-preview",
  // top quality (default) — 720p $0.40/s
  "veo-3.1-fast-generate-preview",
  // low latency, low cost — 720p $0.10/s (4x cheaper than default)
  "veo-3.1-lite-generate-preview"
  // cheapest — 720p $0.05/s (8x cheaper). No 4K/Extension/Reference
];
var DEFAULT_VIDEO_MODEL = "veo-3.1-fast-generate-preview";
var VALID_VIDEO_ASPECT_RATIOS = ["16:9", "9:16"];
var VALID_VIDEO_RESOLUTIONS = ["720p", "1080p", "4k"];
var API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
var FILES_URI_PREFIX = `${API_BASE_URL}/files/`;
var HANDLE_LIFETIME_MS = 48 * 60 * 60 * 1e3;
var DurationSchema = external_exports.union([external_exports.literal(4), external_exports.literal(6), external_exports.literal(8)]).optional().default(8);
function validateResolutionConstraints(model, resolution, durationSeconds, ctx) {
  if ((resolution === "1080p" || resolution === "4k") && durationSeconds !== 8) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["durationSeconds"],
      message: `${resolution} resolution is only supported at 8s duration (requested: ${durationSeconds}s).`
    });
  }
  if (resolution === "4k" && model === "veo-3.1-lite-generate-preview") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["resolution"],
      message: "veo-3.1-lite-generate-preview does not support 4k (720p/1080p only)."
    });
  }
}
function rejectLiteNegativePrompt(negativePrompt, model, ctx) {
  if (negativePrompt && model === "veo-3.1-lite-generate-preview") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["negativePrompt"],
      message: "negativePrompt is not accepted on veo-3.1-lite-generate-preview (the API returns 400). Write the exclusion into the prompt as positive description, or use veo-3.1-fast-generate-preview."
    });
  }
}
function rejectLiteModel(feature, model, ctx) {
  if (model === "veo-3.1-lite-generate-preview") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["model"],
      message: `${feature} is not supported on veo-3.1-lite-generate-preview. Use veo-3.1-generate-preview or veo-3.1-fast-generate-preview.`
    });
  }
}
var negativePromptSchema = external_exports.string().max(500).optional().describe(
  `Comma-separated noun or adjective phrases to exclude (e.g. "wall, frame, text overlay"). Never use instructive language such as "no" or "don't" \u2014 the API docs reject that form.`
);
var text2VideoSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required"),
  negativePrompt: negativePromptSchema,
  model: external_exports.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
  aspectRatio: external_exports.enum(VALID_VIDEO_ASPECT_RATIOS).optional().default("16:9"),
  resolution: external_exports.enum(VALID_VIDEO_RESOLUTIONS).optional().default("720p"),
  durationSeconds: DurationSchema,
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").optional()
}).superRefine((data, ctx) => {
  validateResolutionConstraints(data.model, data.resolution, data.durationSeconds, ctx);
  rejectLiteNegativePrompt(data.negativePrompt, data.model, ctx);
});
var img2VideoSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required"),
  negativePrompt: negativePromptSchema,
  sourceImagePath: external_exports.string().min(1, "Source image path is required"),
  lastImagePath: external_exports.string().optional(),
  model: external_exports.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
  aspectRatio: external_exports.enum(VALID_VIDEO_ASPECT_RATIOS).optional().default("16:9"),
  resolution: external_exports.enum(VALID_VIDEO_RESOLUTIONS).optional().default("720p"),
  durationSeconds: DurationSchema,
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").optional()
}).superRefine((data, ctx) => {
  validateResolutionConstraints(data.model, data.resolution, data.durationSeconds, ctx);
  rejectLiteNegativePrompt(data.negativePrompt, data.model, ctx);
});
var videoExtensionSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required"),
  sourceVideoPath: external_exports.string().min(1, "Source video path is required"),
  sourceVideoUri: external_exports.string().startsWith(FILES_URI_PREFIX, `Source video URI must start with ${FILES_URI_PREFIX}`).optional(),
  model: external_exports.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").optional()
}).superRefine((data, ctx) => rejectLiteModel("video extension", data.model, ctx));
var referenceVideoSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required"),
  referenceImagePaths: external_exports.array(external_exports.string()).min(1, "At least one reference image is required").max(3, "Maximum 3 reference images allowed"),
  model: external_exports.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
  aspectRatio: external_exports.enum(VALID_VIDEO_ASPECT_RATIOS).optional().default("16:9"),
  resolution: external_exports.enum(VALID_VIDEO_RESOLUTIONS).optional().default("720p"),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").optional()
}).superRefine((data, ctx) => {
  rejectLiteModel("reference images", data.model, ctx);
  validateResolutionConstraints(data.model, data.resolution, 8, ctx);
});

// src/seedance-client.ts
import * as path2 from "node:path";
var VALID_SEEDANCE_RESOLUTIONS = ["480p", "720p", "1080p", "4k"];
var VALID_SEEDANCE_RATIOS = ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9", "adaptive"];
var SEEDANCE_MODEL_SPECS = {
  // 1080p opened on 2026-08-17 (UTC+8) — 10-bit color, and the only tier the discount
  // campaign covers (28% off list through 2026-09-17). 2.5 has no 4K; 2.0 does.
  "dreamina-seedance-2-5-260628": {
    resolutions: ["480p", "720p", "1080p"],
    duration: [4, 30],
    lastFrame: true,
    referenceImages: [1, 30],
    referenceAudio: { maxClips: 10, clipSeconds: [2, 30], totalSeconds: 30, audioOnly: true },
    referenceVideos: { maxClips: 10, clipSeconds: [2, 30], totalSeconds: 30 },
    audio: true,
    seed: false,
    realFaceInput: false,
    activationGate: true
  },
  "dreamina-seedance-2-0-260128": {
    resolutions: ["480p", "720p", "1080p", "4k"],
    duration: [4, 15],
    lastFrame: true,
    referenceImages: [1, 9],
    referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
    referenceVideos: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15 },
    audio: true,
    seed: false,
    realFaceInput: false,
    activationGate: true
  },
  "dreamina-seedance-2-0-fast-260128": {
    resolutions: ["480p", "720p"],
    duration: [4, 15],
    lastFrame: true,
    referenceImages: [1, 9],
    referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
    referenceVideos: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15 },
    audio: true,
    seed: false,
    realFaceInput: false,
    activationGate: true
  },
  "dreamina-seedance-2-0-mini-260615": {
    resolutions: ["480p", "720p"],
    duration: [4, 15],
    lastFrame: true,
    referenceImages: [1, 9],
    referenceAudio: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15, audioOnly: false },
    referenceVideos: { maxClips: 3, clipSeconds: [2, 15], totalSeconds: 15 },
    audio: true,
    seed: false,
    realFaceInput: false,
    activationGate: true
  },
  "seedance-1-5-pro-251215": {
    resolutions: ["480p", "720p", "1080p"],
    duration: [4, 12],
    lastFrame: true,
    referenceImages: false,
    referenceAudio: false,
    referenceVideos: false,
    audio: true,
    seed: true,
    realFaceInput: true,
    activationGate: false
  },
  "seedance-1-0-pro-250528": {
    resolutions: ["480p", "720p", "1080p"],
    duration: [2, 12],
    lastFrame: true,
    referenceImages: false,
    referenceAudio: false,
    referenceVideos: false,
    audio: false,
    seed: true,
    realFaceInput: true,
    activationGate: false
  },
  "seedance-1-0-pro-fast-251015": {
    resolutions: ["480p", "720p", "1080p"],
    duration: [2, 12],
    lastFrame: false,
    referenceImages: false,
    referenceAudio: false,
    referenceVideos: false,
    audio: false,
    seed: true,
    realFaceInput: true,
    activationGate: false
  }
};
var VALID_SEEDANCE_MODELS = Object.keys(SEEDANCE_MODEL_SPECS);
var DEFAULT_SEEDANCE_MODEL = "seedance-1-5-pro-251215";
var SEEDANCE_REFERENCE_MODELS = VALID_SEEDANCE_MODELS.filter(
  (model) => SEEDANCE_MODEL_SPECS[model].referenceImages !== false
);
var DEFAULT_SEEDANCE_REFERENCE_MODEL = "dreamina-seedance-2-0-260128";
var SEEDANCE_REAL_FACE_MODELS = VALID_SEEDANCE_MODELS.filter(
  (model) => SEEDANCE_MODEL_SPECS[model].realFaceInput
);
var DEFAULT_SEEDANCE_RESOLUTION = "720p";
var DEFAULT_SEEDANCE_DURATION = 5;
var SEEDANCE_FPS = 24;
var SEEDANCE_FRAME_MODELS = ["seedance-1-0-pro-250528", "seedance-1-0-pro-fast-251015"];
var SEEDANCE_MIN_FRAMES = 29;
var SEEDANCE_MAX_FRAMES = 289;
var SEEDANCE_FRAME_STEP = 4;
var MAX_INPUT_IMAGE_BYTES = 30 * 1024 * 1024;
var MAX_REQUEST_BYTES = 64 * 1024 * 1024;
var MAX_INPUT_AUDIO_BYTES = 15 * 1024 * 1024;
var MAX_INPUT_VIDEO_BYTES = 200 * 1024 * 1024;
var SEEDANCE_REFERENCE_AUDIO_EXTENSIONS = [".wav", ".mp3"];
var SEEDANCE_REFERENCE_VIDEO_EXTENSIONS = [".mp4", ".mov"];
var commonFields = {
  prompt: external_exports.string().min(1, "Prompt is required"),
  model: external_exports.enum(VALID_SEEDANCE_MODELS).optional().default(DEFAULT_SEEDANCE_MODEL),
  resolution: external_exports.enum(VALID_SEEDANCE_RESOLUTIONS).optional().default(DEFAULT_SEEDANCE_RESOLUTION),
  durationSeconds: external_exports.number().int().optional(),
  frames: external_exports.number().int().min(SEEDANCE_MIN_FRAMES).max(SEEDANCE_MAX_FRAMES).optional(),
  generateAudio: external_exports.boolean().optional().default(false),
  watermark: external_exports.boolean().optional().default(false),
  seed: external_exports.number().int().min(-1).max(2147483647).optional(),
  cameraFixed: external_exports.boolean().optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").optional()
};
var QUOTED_SEGMENT = /"[^"]*"|“[^”]*”|「[^」]*」/g;
var HANGUL_RUN = /[가-힣]+(?:[ \t]+[가-힣]+)*/;
function hangulOutsideQuotes(prompt) {
  const match = prompt.replace(QUOTED_SEGMENT, " ").match(HANGUL_RUN);
  return match ? match[0] : null;
}
function validateCommon(data, ctx) {
  const spec = SEEDANCE_MODEL_SPECS[data.model];
  if (data.model !== "dreamina-seedance-2-5-260628") {
    const korean = hangulOutsideQuotes(data.prompt);
    if (korean) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["prompt"],
        message: `${data.model} reads Chinese or English prompts only \u2014 the Korean "${korean}" sits outside quotation marks and would be ignored rather than obeyed. Write the direction in English; Korean dialogue belongs inside quotes (1.5 pro lip-syncs it), or route the shot to dreamina-seedance-2-5-260628.`
      });
    }
  }
  if (!spec.resolutions.includes(data.resolution)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["resolution"],
      message: `${data.model} does not support ${data.resolution} (supported: ${spec.resolutions.join(", ")}).`
    });
  }
  const [minDuration, maxDuration] = spec.duration;
  if (data.frames !== void 0) {
    if (!SEEDANCE_FRAME_MODELS.includes(data.model) || (data.frames - 1) % SEEDANCE_FRAME_STEP !== 0)
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["frames"], message: "frames requires Seedance 1.0 pro/pro-fast and 25+4n frames in 29..289" });
    if (data.durationSeconds !== void 0)
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["durationSeconds"], message: "frames and durationSeconds are mutually exclusive" });
  } else if ((data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION) < minDuration || (data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION) > maxDuration) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["durationSeconds"],
      message: `${data.model} supports durations of ${minDuration}~${maxDuration}s (requested: ${data.durationSeconds}s).`
    });
  }
  if (data.generateAudio && !spec.audio) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["generateAudio"],
      message: `${data.model} is silent-only and cannot generate audio. If you need audio, use seedance-1-5-pro-251215 or later.`
    });
  }
  if (!spec.seed) {
    if (data.seed !== void 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["seed"],
        message: `${data.model} does not support seed (Seedance 1.5 pro\xB71.0 pro\xB71.0 pro fast only).`
      });
    }
    if (data.cameraFixed !== void 0) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["cameraFixed"],
        message: `${data.model} does not support cameraFixed (Seedance 1.5 pro\xB71.0 pro\xB71.0 pro fast only). Direct a fixed camera through the prompt instead.`
      });
    }
  }
}
var seedanceText2VideoSchema = external_exports.object({
  ...commonFields,
  ratio: external_exports.enum(VALID_SEEDANCE_RATIOS).optional().default("16:9")
}).superRefine(validateCommon).transform((data) => ({ ...data, durationSeconds: data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION }));
var seedanceImg2VideoSchema = external_exports.object({
  ...commonFields,
  sourceImagePath: external_exports.string().min(1, "Source image path is required"),
  lastImagePath: external_exports.string().optional(),
  // Following the input image's ratio is the default — specifying a different
  // ratio makes the server center-crop the source image (the incident where a
  // 9:16 cover got cropped).
  ratio: external_exports.enum(VALID_SEEDANCE_RATIOS).optional().default("adaptive")
}).superRefine((data, ctx) => {
  validateCommon(data, ctx);
  if (data.lastImagePath && !SEEDANCE_MODEL_SPECS[data.model].lastFrame) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["lastImagePath"],
      message: `${data.model} accepts a first frame only \u2014 for first+last frame interpolation use seedance-1-0-pro-250528 or later.`
    });
  }
}).transform((data) => ({ ...data, durationSeconds: data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION }));
var seedanceReferenceSchema = external_exports.object({
  ...commonFields,
  model: external_exports.enum(SEEDANCE_REFERENCE_MODELS).optional().default(DEFAULT_SEEDANCE_REFERENCE_MODEL),
  referenceImagePaths: external_exports.array(external_exports.string()).optional().default([]),
  referenceAudioPaths: external_exports.array(external_exports.string()).optional().default([]),
  referenceVideoPaths: external_exports.array(external_exports.string()).optional().default([]),
  referenceVideoUrls: external_exports.array(external_exports.string().url()).optional().default([]),
  ratio: external_exports.enum(VALID_SEEDANCE_RATIOS).optional().default("adaptive")
}).superRefine((data, ctx) => {
  validateCommon(data, ctx);
  const spec = SEEDANCE_MODEL_SPECS[data.model];
  if (spec.referenceImages === false) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["model"],
      message: `${data.model} does not support reference images. Use the Dreamina Seedance 2.5 or 2.0 family (${SEEDANCE_REFERENCE_MODELS.join(", ")}).`
    });
    return;
  }
  const [, maxImages] = spec.referenceImages;
  if (data.referenceImagePaths.length > maxImages) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["referenceImagePaths"],
      message: `${data.model} allows at most ${maxImages} reference images (requested: ${data.referenceImagePaths.length}).`
    });
  }
  const videoCount = data.referenceVideoPaths.length + data.referenceVideoUrls.length;
  if (data.referenceImagePaths.length === 0 && data.referenceAudioPaths.length === 0 && videoCount === 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["referenceImagePaths"],
      message: "At least one reference is required \u2014 referenceImagePaths, referenceAudioPaths, referenceVideoPaths/Urls, or a mix."
    });
    return;
  }
  if (videoCount > 0) {
    const video = spec.referenceVideos;
    if (video === false) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["referenceVideoPaths"], message: `${data.model} does not take reference video.` });
      return;
    }
    if (videoCount > video.maxClips) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["referenceVideoPaths"],
        message: `${data.model} allows at most ${video.maxClips} reference videos (requested: ${videoCount}).`
      });
    }
    for (const filePath of data.referenceVideoPaths) {
      const ext = path2.extname(filePath).toLowerCase();
      if (!SEEDANCE_REFERENCE_VIDEO_EXTENSIONS.includes(ext)) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: ["referenceVideoPaths"],
          message: `Reference video must be mp4 or mov (got "${ext}" in ${path2.basename(filePath)}).`
        });
      }
    }
    if (!/\bvideo\s*1\b/i.test(data.prompt)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["prompt"],
        message: 'A reference video is bound in the prompt by index \u2014 write "Video 1" (2.5: "@Video 1") and say what it supplies (camera movement, blocking, motion timing) and what it must not (its visual content).'
      });
    }
  }
  if (data.referenceAudioPaths.length === 0) return;
  const audio = spec.referenceAudio;
  if (audio === false) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["referenceAudioPaths"],
      message: `${data.model} does not take reference audio.`
    });
    return;
  }
  if (data.referenceAudioPaths.length > audio.maxClips) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["referenceAudioPaths"],
      message: `${data.model} allows at most ${audio.maxClips} reference audio clips (requested: ${data.referenceAudioPaths.length}).`
    });
  }
  if (!audio.audioOnly && data.referenceImagePaths.length === 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["referenceImagePaths"],
      message: `${data.model} needs at least one reference image alongside reference audio \u2014 audio-only input is dreamina-seedance-2-5-260628 only.`
    });
  }
  for (const filePath of data.referenceAudioPaths) {
    const ext = path2.extname(filePath).toLowerCase();
    if (!SEEDANCE_REFERENCE_AUDIO_EXTENSIONS.includes(ext)) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["referenceAudioPaths"],
        message: `Reference audio must be wav or mp3 (got "${ext}" in ${path2.basename(filePath)}).`
      });
    }
  }
  if (!data.generateAudio) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["generateAudio"],
      message: "Reference audio with generateAudio: false produces a silent video, so the voice reference has nothing to shape. Set generateAudio: true."
    });
  }
}).transform((data) => ({ ...data, durationSeconds: data.durationSeconds ?? DEFAULT_SEEDANCE_DURATION }));

// src/astra-video-client.ts
import { createHash as createHash2, randomInt } from "node:crypto";
import * as fs2 from "node:fs";
import * as path3 from "node:path";

// package.json
var package_default = {
  name: "@zeans/social-flow-mcp-server",
  version: "0.118.0",
  license: "Apache-2.0",
  description: "Built-in MCP server for the social-flow plugin \u2014 direct SNS publishing (Threads\xB7Instagram\xB7Facebook\xB7YouTube) + research search (5 SerpApi tools\xB7SNS issue scout\xB78 Naver Open API types) + image\xB7video\xB7voice\xB7music generation (OpenAI GPT Image\xB7Veo 3.1\xB7Seedance\xB7Gemini TTS\xB7ElevenLabs\xB7Lyria\xB7Suno) + optional on-device MLX Core / mlx-serve (mlx_*)",
  type: "module",
  main: "dist/index.js",
  engines: {
    node: ">=20"
  },
  scripts: {
    build: "tsc && node build-video-catalog.mjs && node build-image-catalog.mjs && node build-music-catalog.mjs && npm run bundle && npm run bundle:shot && npm run bundle:mesh",
    start: "node dist/index.js",
    test: "node --test test/*.test.mjs",
    check: "npm run build && npm test",
    "check:dist": "npm run build && node check-dist.mjs",
    bundle: `esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/bundle.js --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"`,
    "bundle:shot": `esbuild src/astra-shot-runtime.ts --bundle --platform=node --format=esm --outfile=dist/astra-shot-runtime.bundle.js --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"`,
    "bundle:mesh": "node build-mesh.mjs"
  },
  dependencies: {
    "@google/genai": "^2.21.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    openai: "^6.46.0",
    zod: "^3.23.8"
  },
  devDependencies: {
    "@types/node": "^20.14.0",
    esbuild: "^0.28.2",
    three: "0.180.0",
    typescript: "^5.6.0"
  },
  bin: {
    "social-flow-mcp": "dist/index.js"
  },
  files: [
    "dist"
  ]
};

// src/http.ts
async function requestRaw(method, url, headers, body, timeoutMs) {
  const effectiveTimeoutMs = timeoutMs ?? config.requestTimeoutMs;
  try {
    const res = await fetch(url, {
      method: method.toUpperCase(),
      headers: {
        ...body !== void 0 ? { "Content-Type": "application/json" } : {},
        ...headers
      },
      body: body !== void 0 ? JSON.stringify(body) : void 0,
      signal: AbortSignal.timeout(effectiveTimeoutMs)
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { ok: false, status: 504, body: `Request timed out after ${effectiveTimeoutMs}ms: ${url}` };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 502, body: `Upstream unreachable (${url}): ${message}` };
  }
}

// src/speech-sync-check.ts
import { spawnSync } from "node:child_process";
var FPS = 24;
var PROXY_WIDTH = 128;
var BLOCK = 8;
var LAGS = [-2, -1, 0, 1, 2, 3, 4];
var NULL_SHIFTS = 12;
var SMOOTH_FRAMES = 5;
var MOTION_CAP = 0.95;
var SPEECH_FLOOR_DB = -50;
var SPEECH_RANGE_DB = 30;
var MIN_SPEECH_SECONDS = 1;
var SYNC_MARGIN = 0.1;
var NOT_REVIEWED = ["phoneme-level lip sync", "which visible person speaks", "voice identity"];
var round = (n) => Math.round(n * 1e3) / 1e3;
function ffmpeg(args) {
  const run = spawnSync("ffmpeg", ["-v", "error", "-nostdin", ...args], { maxBuffer: 512 * 1024 * 1024 });
  if (run.error) throw new Error(run.error.code === "ENOENT" ? "ffmpeg is not installed" : run.error.message);
  if (run.status !== 0) throw new Error(`ffmpeg failed: ${String(run.stderr).trim().slice(-300)}`);
  return run.stdout;
}
function probe(video) {
  const run = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", video], { encoding: "utf8" });
  if (run.error || run.status !== 0) throw new Error(`ffprobe could not read ${video}`);
  const json = JSON.parse(run.stdout);
  const picture = (json.streams || []).find((s) => s.codec_type === "video");
  if (!picture?.width || !picture.height) throw new Error(`${video} has no video stream`);
  return {
    width: picture.width,
    height: picture.height,
    seconds: Number(json.format?.duration) || 0,
    audio: (json.streams || []).some((s) => s.codec_type === "audio")
  };
}
function blockMotion(video, width, height) {
  const w = PROXY_WIDTH;
  const h = Math.max(BLOCK, Math.round(height / width * w / BLOCK) * BLOCK);
  const raw = ffmpeg(["-i", video, "-vf", `fps=${FPS},scale=${w}:${h}:flags=area,format=gray`, "-f", "rawvideo", "-"]);
  const size = w * h;
  const frames = Math.floor(raw.length / size);
  const cols = w / BLOCK, rows = h / BLOCK;
  const series = Array.from({ length: cols * rows }, () => new Array(frames).fill(0));
  for (let f = 1; f < frames; f += 1) {
    const cur = f * size, prev = cur - size;
    for (let y = 0; y < h; y += 1) {
      const rowBase = Math.floor(y / BLOCK) * cols;
      for (let x = 0; x < w; x += 1) series[rowBase + Math.floor(x / BLOCK)][f] += Math.abs(raw[cur + y * w + x] - raw[prev + y * w + x]);
    }
  }
  return series;
}
function envelope(audio, start, seconds, streamFromVideo = false) {
  const window = [...start ? ["-ss", String(start)] : [], ...seconds !== null ? ["-t", String(seconds)] : []];
  const pcm = ffmpeg([...window, "-i", audio, ...streamFromVideo ? ["-map", "0:a:0"] : [], "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"]);
  const samples = Math.floor(pcm.length / 2);
  const out = [];
  for (let f = 0; Math.round((f + 1) * 16e3 / FPS) <= samples; f += 1) {
    const from = Math.round(f * 16e3 / FPS), to = Math.round((f + 1) * 16e3 / FPS);
    let sum = 0;
    for (let i = from; i < to; i += 1) {
      const s = pcm.readInt16LE(i * 2) / 32768;
      sum += s * s;
    }
    out.push(Math.sqrt(sum / (to - from)));
  }
  return out;
}
var db = (rms) => 20 * Math.log10(Math.max(rms, 1e-9));
function speechFrames(env) {
  const loudest = Math.max(...env.map(db));
  return env.map((v) => db(v) > Math.max(SPEECH_FLOOR_DB, loudest - SPEECH_RANGE_DB));
}
function pearson(a, b, lag) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let t = Math.max(0, lag); t < a.length && t - lag < b.length; t += 1) {
    const x = a[t], y = b[t - lag];
    n += 1;
    sa += x;
    sb += y;
    saa += x * x;
    sbb += y * y;
    sab += x * y;
  }
  if (n < 3) return 0;
  const va = saa - sa * sa / n, vb = sbb - sb * sb / n;
  return va > 0 && vb > 0 ? (sab - sa * sb / n) / Math.sqrt(va * vb) : 0;
}
function bestSync(motion, env) {
  let score = -1, lag = 0;
  for (const series of motion) for (const l of LAGS) {
    const r = pearson(series, env, l);
    if (r > score) {
      score = r;
      lag = l;
    }
  }
  return { score, lag };
}
function movingMean(series, width) {
  const half = Math.floor(width / 2);
  return series.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(series.length - 1, i + half); j += 1) {
      sum += series[j];
      n += 1;
    }
    return sum / n;
  });
}
function capped(series) {
  const cap = [...series].sort((a, b) => a - b)[Math.floor(MOTION_CAP * (series.length - 1))] ?? 0;
  return series.map((v) => Math.min(v, cap));
}
function syncMeasure(motion, env) {
  const frames = Math.min(env.length, motion[0]?.length ?? 0);
  const clipped = motion.map((s) => movingMean(capped(s.slice(0, frames)), SMOOTH_FRAMES));
  const audio = movingMean(env.slice(0, frames), SMOOTH_FRAMES);
  const { score, lag } = bestSync(clipped, audio);
  const nulls = [];
  for (let j = 1; j <= NULL_SHIFTS; j += 1) {
    const k = Math.round(frames * j / (NULL_SHIFTS + 1));
    if (Math.min(k, frames - k) < FPS) continue;
    nulls.push(bestSync(clipped, [...audio.slice(k), ...audio.slice(0, k)]).score);
  }
  nulls.sort((a, b) => a - b);
  const chance = nulls.length ? nulls[Math.floor(0.9 * (nulls.length - 1))] : 1;
  return { score, chance, margin: score - chance, lag };
}
function checkSpeechSync(opts) {
  const result = { status: "not_measured", findings: [], notReviewed: NOT_REVIEWED };
  try {
    const clip = probe(opts.videoPath);
    const start = opts.audioStartTime ?? 0;
    let env;
    if (opts.audioPath) {
      env = envelope(opts.audioPath, start, opts.audioMaxDuration ?? null);
      const active = speechFrames(env);
      const lastSpeech = (active.lastIndexOf(true) + 1) / FPS;
      if (lastSpeech > clip.seconds + 0.1)
        result.findings.push({
          kind: "speech_cut",
          reseed: false,
          what: `speech runs to ${round(lastSpeech)}s of the supplied window but the clip ends at ${round(clip.seconds)}s \u2014 request enough numFrames (8k+1, at most 361) and pad the WAV with silence, or split the line; another seed will not lengthen it`
        });
      if (clip.audio) {
        const own = envelope(opts.videoPath, 0, null, true);
        let correlation = -1, lagFrames = 0;
        for (let l = -12; l <= 12; l += 1) {
          const r = pearson(own, env, l);
          if (r > correlation) {
            correlation = r;
            lagFrames = l;
          }
        }
        result.audio = { correlation: round(correlation), lagFrames };
        if (correlation < 0.9 || lagFrames !== 0)
          result.findings.push({
            kind: "audio_mismatch",
            reseed: false,
            what: `the clip's own audio is not the supplied WAV (envelope correlation ${round(correlation)} at ${lagFrames} frame(s) offset) \u2014 mux the pinned WAV instead of the clip track${lagFrames ? " and check the mouth timing against it" : ""}`
          });
      } else result.audio = null;
    } else if (clip.audio) {
      env = envelope(opts.videoPath, 0, null, true);
    } else {
      result.reason = "no local audioPath and no audio track in the clip";
      return result;
    }
    const speechSeconds = speechFrames(env).slice(0, Math.round(clip.seconds * FPS)).filter(Boolean).length / FPS;
    if (speechSeconds < MIN_SPEECH_SECONDS) {
      result.reason = `only ${round(speechSeconds)}s of speech in the window \u2014 too little to measure`;
      return result;
    }
    const m = syncMeasure(blockMotion(opts.videoPath, clip.width, clip.height), env);
    result.sync = { score: round(m.score), chance: round(m.chance), margin: round(m.margin), lagFrames: m.lag, speechSeconds: round(speechSeconds) };
    result.status = m.margin >= SYNC_MARGIN ? "follows_speech" : "no_sync";
    if (result.status === "no_sync")
      result.findings.push({
        kind: "lip_sync",
        reseed: true,
        what: `no region of the picture moves with the speech (best ${round(m.score)} vs chance ${round(m.chance)}, margin under ${SYNC_MARGIN}) \u2014 the model likely ignored the voice`
      });
  } catch (error) {
    result.status = "not_measured";
    result.reason = error instanceof Error ? error.message : String(error);
  }
  return result;
}

// src/astra-video-client.ts
var ASTRA_VIDEO_TIERS = {
  /** `generate` — the default pipeline. The only tier that takes `lora`. */
  default: "generate",
  /** `guided` — slower, takes a negative prompt and a step count. */
  guided: "guided",
  /** `guided_fast` — 768x512 draft tier, faster than guided but not the default pipeline. */
  fast: "guided_fast",
  /** `guided_hq` — two-stage high-quality pipeline (15 steps by default). Unmeasured. */
  hq: "guided_hq"
};
var VALID_ASTRA_VIDEO_TIERS = Object.keys(ASTRA_VIDEO_TIERS);
var ASTRA_VIDEO_LORAS = ["cinemagraph", "slow-motion"];
var ASTRA_VIDEO_MAX_LORAS = 2;
var ASTRA_VIDEO_MAX_LORA_STRENGTH = 2;
var ASTRA_VIDEO_IC_LORA_ADAPTERS = [
  "clean-plate",
  "colorization",
  "day-to-night",
  "deblur",
  "decompression",
  "water-simulation",
  "pixel-upscaler-x2",
  "ingredients"
];
var ASTRA_VIDEO_GUIDANCE_RANGES = {
  video_cfg_guidance_scale: [1, 15],
  video_stg_guidance_scale: [0, 5],
  video_rescale_scale: [0, 1],
  video_skip_step: [0, 10],
  a2v_guidance_scale: [1, 10],
  audio_cfg_guidance_scale: [1, 15],
  audio_stg_guidance_scale: [0, 5],
  audio_rescale_scale: [0, 1],
  audio_skip_step: [0, 10],
  v2a_guidance_scale: [1, 10]
};
var guidanceToolKey = (wireKey) => wireKey.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
var guidanceWireKey = (toolKey) => toolKey.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
var ASTRA_VIDEO_MAX_STG_BLOCK = 47;
var ASTRA_VIDEO_MAX_STG_BLOCKS = 8;
var ASTRA_VIDEO_MEASURED_FIELDS = {
  generate: ["auto_duration", "frame_rate", "hdr", "height", "images", "lora", "mode", "num_frames", "num_generated_keyframes", "prompt", "seed", "width"],
  guided: ["auto_duration", "frame_rate", "hdr", "height", "images", "mode", "negative_prompt", "num_frames", "num_generated_keyframes", "num_inference_steps", "prompt", "seed", "width"],
  guided_fast: ["auto_duration", "frame_rate", "hdr", "height", "images", "mode", "negative_prompt", "num_frames", "num_generated_keyframes", "num_inference_steps", "prompt", "seed", "width"],
  keyframe: ["frame_rate", "hdr", "height", "images", "mode", "negative_prompt", "num_frames", "num_inference_steps", "prompt", "seed", "width"],
  audio2video: ["audio_max_duration", "audio_start_time", "audio_upload_id", "frame_rate", "hdr", "height", "images", "mode", "negative_prompt", "num_frames", "num_inference_steps", "prompt", "seed", "width"],
  ingredients: ["frame_rate", "hdr", "height", "images", "mode", "num_frames", "prompt", "references", "seed", "width"],
  retake: ["end_time", "hdr", "mode", "prompt", "seed", "start_time", "video_upload_id"]
};
var ASTRA_VIDEO_DESIGN_FIELDS = {
  generate: ["generate_audio"],
  guided: ["guidance", "generate_audio"],
  guided_fast: ["guidance", "generate_audio"],
  keyframe: ["guidance", "generate_audio"],
  audio2video: ["guidance", "generate_audio"],
  guided_hq: [...ASTRA_VIDEO_MEASURED_FIELDS.guided, "guidance", "generate_audio"],
  ingredients: ["conditioning_mask", "skip_stage_2", "generate_audio"],
  ic_lora: [...ASTRA_VIDEO_MEASURED_FIELDS.ingredients, "adapter", "conditioning_mask", "skip_stage_2", "generate_audio"],
  retake: ["generate_audio"]
};
var ASTRA_VIDEO_ALLOWED_FIELDS = Object.fromEntries(
  [.../* @__PURE__ */ new Set([...Object.keys(ASTRA_VIDEO_MEASURED_FIELDS), ...Object.keys(ASTRA_VIDEO_DESIGN_FIELDS)])].map((mode) => [
    mode,
    [.../* @__PURE__ */ new Set([...ASTRA_VIDEO_MEASURED_FIELDS[mode] ?? [], ...ASTRA_VIDEO_DESIGN_FIELDS[mode] ?? []])].sort()
  ])
);
var ASTRA_VIDEO_MIN_FRAMES = 25;
var ASTRA_VIDEO_SERVER_MAX_FRAMES = 361;
var ASTRA_VIDEO_FRAME_LIMITS = {
  generate: ASTRA_VIDEO_SERVER_MAX_FRAMES,
  guided: ASTRA_VIDEO_SERVER_MAX_FRAMES,
  guided_fast: ASTRA_VIDEO_SERVER_MAX_FRAMES,
  keyframe: ASTRA_VIDEO_SERVER_MAX_FRAMES,
  audio2video: ASTRA_VIDEO_SERVER_MAX_FRAMES,
  guided_hq: ASTRA_VIDEO_SERVER_MAX_FRAMES,
  ingredients: ASTRA_VIDEO_SERVER_MAX_FRAMES,
  ic_lora: ASTRA_VIDEO_SERVER_MAX_FRAMES
};
var ASTRA_VIDEO_FRAME_STEP = 8;
var ASTRA_VIDEO_MAX_AUTO_FRAMES = 121;
var ASTRA_VIDEO_DIMENSION_STEP = 64;
var ASTRA_VIDEO_FAST_DIMENSION_STEP = 32;
var ASTRA_VIDEO_FAST_MIN_DIMENSION = 32;
var ASTRA_VIDEO_MAX_PIXELS = 2064384;
var ASTRA_VIDEO_MAX_SEED = 2147483647;
var ASTRA_VIDEO_MAX_PROMPT_CHARS = 2e3;
var ASTRA_VIDEO_UPLOAD_LIMITS = {
  image: 32 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 32 * 1024 * 1024
};
var ASTRA_VIDEO_SUBMITS_PER_MINUTE = 5;
var ASTRA_VIDEO_SUBMITS_PER_HOUR = 60;
var ASTRA_VIDEO_UPLOADS_PER_MINUTE = 10;
var ASTRA_VIDEO_MAX_JOB_BODY_BYTES = 1024 * 1024;
var ASTRA_VIDEO_USER_AGENT = `social-flow/${package_default.version}`;
var ASTRA_VIDEO_MAX_WAIT_MS = 18e5;
var POLL_INTERVAL_MS = 5e3;
var SUBMIT_TIMEOUT_MS = 6e4;
var STATUS_TIMEOUT_MS = 3e4;
var TRANSFER_TIMEOUT_MS = 6e5;
var astraVideoListUploadsSchema = external_exports.object({}).strict();
var astraVideoCapabilitiesSchema = external_exports.object({}).strict();
var astraVideoDeleteUploadSchema = external_exports.object({
  uploadId: external_exports.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/, "uploadId must be a bare upload identifier")
}).strict();
var uploadListingSchema = external_exports.object({
  uploads: external_exports.array(external_exports.object({
    upload_id: external_exports.string().min(1),
    kind: external_exports.enum(["image", "audio", "video"]).or(external_exports.string()),
    bytes: external_exports.number().int().nonnegative(),
    expires_at: external_exports.string().min(1)
  }))
});
var promptSchema = external_exports.string().min(1, "prompt is required").max(ASTRA_VIDEO_MAX_PROMPT_CHARS, `prompt must be at most ${ASTRA_VIDEO_MAX_PROMPT_CHARS} characters`);
var numFramesSchema = (mode) => external_exports.number().int().min(ASTRA_VIDEO_MIN_FRAMES).max(ASTRA_VIDEO_FRAME_LIMITS[mode]).refine((n) => (n - 1) % ASTRA_VIDEO_FRAME_STEP === 0, {
  message: `numFrames must be 8k+1 (25, 33, 41 \u2026 ${ASTRA_VIDEO_FRAME_LIMITS[mode]})`
}).optional();
function framesForSeconds(seconds, frameRate = 24) {
  const frames = seconds * frameRate;
  return 1 + ASTRA_VIDEO_FRAME_STEP * Math.ceil((frames - 1) / ASTRA_VIDEO_FRAME_STEP - 0.5 - 1e-9);
}
var durationSchema = external_exports.number().positive().finite().optional();
function checkDuration(data, mode, ctx) {
  if (data.numFrames !== void 0 && data.autoDuration !== void 0) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["autoDuration"], message: "autoDuration and numFrames are mutually exclusive" });
  }
  if (data.duration === void 0) return;
  for (const other of ["numFrames", "autoDuration", "audioMaxDuration"]) {
    if (data[other] !== void 0) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["duration"], message: `duration and ${other} are mutually exclusive \u2014 give one length` });
    }
  }
  const fps = data.frameRate ?? 24;
  const frames = framesForSeconds(data.duration, fps);
  const max = ASTRA_VIDEO_FRAME_LIMITS[mode];
  if (frames < ASTRA_VIDEO_MIN_FRAMES || frames > max) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["duration"],
      // Nearest-grid rounding: frames f cover seconds×fps in (f-4, f+4], so the accepted span is
      // more than (min-4)/fps and at most (max+4)/fps — the bounds the server states too.
      message: `duration ${data.duration}s at ${fps}fps is ${frames} frames; mode ${mode} takes ${ASTRA_VIDEO_MIN_FRAMES}-${max} frames, i.e. duration more than ${((ASTRA_VIDEO_MIN_FRAMES - ASTRA_VIDEO_FRAME_STEP / 2) / fps).toFixed(4)}s and at most ${((max + ASTRA_VIDEO_FRAME_STEP / 2) / fps).toFixed(4)}s`
    });
  }
}
function resolveDuration(data) {
  const { duration, ...rest } = data;
  return duration === void 0 ? rest : { ...rest, numFrames: framesForSeconds(duration, data.frameRate ?? 24) };
}
var generateAudioSchema = external_exports.boolean().optional();
var hdrSchema = external_exports.enum(["SRGB_LINEAR", "ACESCG", "ACESCCT"]).optional();
var seedSchema = external_exports.number().int().min(0).max(ASTRA_VIDEO_MAX_SEED).optional();
var frameRateSchema = external_exports.number().min(1).max(60).optional();
var negativePromptSchema2 = external_exports.string().max(ASTRA_VIDEO_MAX_PROMPT_CHARS).optional();
var numInferenceStepsSchema = external_exports.number().int().min(1).max(50).optional();
var numGeneratedKeyframesSchema = external_exports.number().int().min(0).max(16).optional();
var widthSchema = external_exports.number().int().positive().optional();
var heightSchema = external_exports.number().int().positive().optional();
var autoDurationSchema = external_exports.object({
  minSeconds: external_exports.number().positive(),
  maxSeconds: external_exports.number().positive()
}).refine((d) => d.minSeconds <= d.maxSeconds, {
  message: "autoDuration.minSeconds must be <= maxSeconds"
}).optional();
var loraSchema = external_exports.array(external_exports.union([
  external_exports.enum(ASTRA_VIDEO_LORAS),
  external_exports.object({
    name: external_exports.enum(ASTRA_VIDEO_LORAS),
    strength: external_exports.number().min(0).max(ASTRA_VIDEO_MAX_LORA_STRENGTH)
  }).strict()
])).max(ASTRA_VIDEO_MAX_LORAS).refine((values) => {
  const names = values.map((value) => typeof value === "string" ? value : value.name);
  return new Set(names).size === names.length;
}, { message: "lora names must be unique" }).optional();
var stgBlocksSchema = external_exports.array(external_exports.number().int().min(0).max(ASTRA_VIDEO_MAX_STG_BLOCK)).min(1).max(ASTRA_VIDEO_MAX_STG_BLOCKS).refine((values) => new Set(values).size === values.length, { message: "stg block indices must be unique" }).optional();
var guidanceRange = (key) => {
  const [min, max] = ASTRA_VIDEO_GUIDANCE_RANGES[key];
  const number = key.endsWith("_skip_step") ? external_exports.number().int() : external_exports.number();
  return number.min(min).max(max).optional();
};
var guidanceSchema = external_exports.object({
  ...Object.fromEntries(
    Object.keys(ASTRA_VIDEO_GUIDANCE_RANGES).map((key) => [guidanceToolKey(key), guidanceRange(key)])
  ),
  videoStgBlocks: stgBlocksSchema,
  audioStgBlocks: stgBlocksSchema
}).strict().optional();
var outputFields = {
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").optional()
};
function checkDimensions(width, height, mode) {
  const fast = mode === "guided_fast";
  const step = fast ? ASTRA_VIDEO_FAST_DIMENSION_STEP : ASTRA_VIDEO_DIMENSION_STEP;
  for (const [name, value] of [["width", width], ["height", height]]) {
    if (value === void 0) continue;
    if (value % step !== 0) return `${name} must be a multiple of ${step} for mode ${mode} (got ${value})`;
    const min = fast ? ASTRA_VIDEO_FAST_MIN_DIMENSION : ASTRA_VIDEO_DIMENSION_STEP;
    if (value < min || value > 1920) {
      return `${name} must be between ${min} and 1920 for mode ${mode} (got ${value})`;
    }
  }
  const pixels = (width ?? (fast ? 768 : 1536)) * (height ?? (fast ? 512 : 1024));
  if (pixels > ASTRA_VIDEO_MAX_PIXELS) {
    return `width * height must be at most ${ASTRA_VIDEO_MAX_PIXELS} (got ${pixels})`;
  }
  return null;
}
function checkFrameIdx(frameIdx, numFrames) {
  const last = (numFrames ?? 121) - 1;
  if (frameIdx < 0 || frameIdx > last) {
    return `frameIdx must be between 0 and ${last} for a ${numFrames ?? 121}-frame clip (got ${frameIdx})`;
  }
  return null;
}
function checkAutoDuration(duration, frameRate = 24) {
  const minFrames = Math.round(duration.minSeconds * frameRate);
  const maxFrames = Math.round(duration.maxSeconds * frameRate);
  if (minFrames < 1) {
    return `autoDuration must start at 1 frame or later after rounding (got ${minFrames} at ${frameRate}fps)`;
  }
  if (maxFrames > ASTRA_VIDEO_MAX_AUTO_FRAMES) {
    return `autoDuration must end at ${ASTRA_VIDEO_MAX_AUTO_FRAMES} frames or earlier after rounding (got ${maxFrames} at ${frameRate}fps)`;
  }
  const firstGridFrame = 1 + ASTRA_VIDEO_FRAME_STEP * Math.ceil((minFrames - 1) / ASTRA_VIDEO_FRAME_STEP);
  if (firstGridFrame > maxFrames) {
    return `autoDuration must contain an 8k+1 frame count after rounding (got ${minFrames}..${maxFrames} at ${frameRate}fps)`;
  }
  return null;
}
var astraText2VideoSchema = external_exports.object({
  prompt: promptSchema,
  tier: external_exports.enum(["default", "guided", "fast", "hq"]).optional().default("default"),
  numFrames: numFramesSchema("generate"),
  autoDuration: autoDurationSchema,
  width: widthSchema,
  height: heightSchema,
  frameRate: frameRateSchema,
  seed: seedSchema,
  duration: durationSchema,
  generateAudio: generateAudioSchema,
  hdr: hdrSchema,
  lora: loraSchema,
  negativePrompt: negativePromptSchema2,
  numInferenceSteps: numInferenceStepsSchema,
  numGeneratedKeyframes: numGeneratedKeyframesSchema,
  guidance: guidanceSchema,
  ...outputFields
}).superRefine((data, ctx) => {
  checkDuration(data, ASTRA_VIDEO_TIERS[data.tier], ctx);
  const mode = ASTRA_VIDEO_TIERS[data.tier];
  if (data.numFrames !== void 0 && data.numFrames > ASTRA_VIDEO_FRAME_LIMITS[mode]) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["numFrames"], message: `numFrames must be at most ${ASTRA_VIDEO_FRAME_LIMITS[mode]} for mode ${mode}` });
  }
  if (data.lora?.length && mode !== "generate") {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["lora"],
      message: `lora is accepted only on tier "default" (mode generate); tier "${data.tier}" would be rejected by the server.`
    });
  }
  if (mode === "generate") {
    for (const key of ["negativePrompt", "numInferenceSteps", "guidance"]) {
      if (data[key] !== void 0) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: [key],
          message: `${key} is accepted only on tier "guided", "fast" or "hq"; mode generate has no such field.`
        });
      }
    }
  }
  const dimensionError = checkDimensions(data.width, data.height, mode);
  if (dimensionError) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["width"], message: dimensionError });
  }
  if (data.autoDuration && data.numFrames === void 0) {
    const durationError = checkAutoDuration(data.autoDuration, data.frameRate ?? 24);
    if (durationError) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["autoDuration"], message: durationError });
    }
  }
}).transform(resolveDuration);
var astraImg2VideoSchema = external_exports.object({
  prompt: promptSchema,
  tier: external_exports.enum(["default", "guided", "hq"]).optional().default("default"),
  firstFramePath: external_exports.string().min(1, "firstFramePath is required"),
  lastFramePath: external_exports.string().optional(),
  strength: external_exports.number().min(0).max(1).optional(),
  numFrames: numFramesSchema("generate"),
  autoDuration: autoDurationSchema,
  width: widthSchema,
  height: heightSchema,
  frameRate: frameRateSchema,
  seed: seedSchema,
  duration: durationSchema,
  generateAudio: generateAudioSchema,
  lora: loraSchema,
  negativePrompt: negativePromptSchema2,
  numInferenceSteps: numInferenceStepsSchema,
  numGeneratedKeyframes: numGeneratedKeyframesSchema,
  guidance: guidanceSchema,
  ...outputFields
}).superRefine((data, ctx) => {
  checkDuration(data, ASTRA_VIDEO_TIERS[data.tier], ctx);
  const mode = ASTRA_VIDEO_TIERS[data.tier];
  if (data.numFrames !== void 0 && data.numFrames > ASTRA_VIDEO_FRAME_LIMITS[mode]) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["numFrames"], message: `numFrames must be at most ${ASTRA_VIDEO_FRAME_LIMITS[mode]} for mode ${mode}` });
  }
  if (mode === "generate") {
    for (const key of ["negativePrompt", "numInferenceSteps", "guidance"]) {
      if (data[key] !== void 0) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: [key],
          message: `${key} is accepted only on tier "guided" or "hq"; mode generate has no such field.`
        });
      }
    }
  }
  if (data.autoDuration && data.numFrames === void 0) {
    if (data.lastFramePath) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: ["autoDuration"],
        message: "autoDuration cannot be combined with lastFramePath: the last still is pinned to numFrames-1, so give numFrames instead."
      });
    }
    const durationError = checkAutoDuration(data.autoDuration, data.frameRate ?? 24);
    if (durationError) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["autoDuration"], message: durationError });
    }
  }
  if (mode !== "generate" && data.lora?.length) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["lora"], message: 'lora is accepted only on tier "default"' });
  }
  const dimensionError = checkDimensions(data.width, data.height, mode);
  if (dimensionError) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["width"], message: dimensionError });
  }
}).transform(resolveDuration);
var astraKeyframeVideoSchema = external_exports.object({
  prompt: promptSchema,
  images: external_exports.array(
    external_exports.object({
      imagePath: external_exports.string().min(1, "imagePath is required"),
      frameIdx: external_exports.number().int().min(0),
      strength: external_exports.number().min(0).max(1).optional(),
      crf: external_exports.number().int().min(0).max(51).optional()
    })
  ).min(2, "keyframe needs at least 2 images").max(8, "keyframe takes at most 8 images"),
  numFrames: numFramesSchema("keyframe"),
  width: widthSchema,
  height: heightSchema,
  frameRate: frameRateSchema,
  seed: seedSchema,
  duration: durationSchema,
  generateAudio: generateAudioSchema,
  negativePrompt: negativePromptSchema2,
  numInferenceSteps: numInferenceStepsSchema,
  guidance: guidanceSchema,
  ...outputFields
}).superRefine((data, ctx) => {
  checkDuration(data, "keyframe", ctx);
  const dimensionError = checkDimensions(data.width, data.height, "keyframe");
  if (dimensionError) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["width"], message: dimensionError });
  }
  data.images.forEach((image, index) => {
    const frameError = checkFrameIdx(image.frameIdx, data.numFrames ?? (data.duration === void 0 ? void 0 : framesForSeconds(data.duration, data.frameRate ?? 24)));
    if (frameError) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["images", index, "frameIdx"], message: frameError });
    }
  });
}).transform(resolveDuration);
var astraAudio2VideoSchema = external_exports.object({
  prompt: promptSchema,
  audioPath: external_exports.string().trim().min(1).optional(),
  audioUploadId: external_exports.string().trim().min(1).optional(),
  imagePath: external_exports.string().trim().min(1).optional(),
  strength: external_exports.number().min(0).max(1).default(0.9).describe("Portrait conditioning strength, 0.0-1.0 (default: 0.9); ignored without imagePath. Earlier dialogue probes: 0.9 accompanied mouth movement and 0.7 accompanied a changed person, but prompts also differed. A later fixed-prompt 19.2 pair is an observation, not proof of improved identity or lip-sync at 0.9. 1.0 is unmeasured on cuts with a clearly detailed, unobscured mouth close-up in the conditioning image; neither local dialogue source (19.2 or 25.3) meets that condition."),
  audioStartTime: external_exports.number().min(0).optional(),
  audioMaxDuration: external_exports.number().positive().optional(),
  numFrames: numFramesSchema("audio2video"),
  width: widthSchema,
  height: heightSchema,
  frameRate: frameRateSchema,
  seed: seedSchema,
  duration: durationSchema,
  generateAudio: generateAudioSchema,
  hdr: hdrSchema,
  negativePrompt: negativePromptSchema2,
  numInferenceSteps: numInferenceStepsSchema,
  guidance: guidanceSchema,
  expectLipSync: external_exports.boolean().default(false),
  maxAttempts: external_exports.number().int().min(1).max(3).default(2),
  ...outputFields
}).superRefine((data, ctx) => {
  checkDuration(data, "audio2video", ctx);
  if (data.hdr && data.imagePath) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["hdr"], message: "hdr cannot be combined with imagePath; remove hdr or the visual input" });
  }
  if (data.audioPath !== void 0 === (data.audioUploadId !== void 0)) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["audioPath"], message: "Provide exactly one of audioPath or audioUploadId" });
  }
  const dimensionError = checkDimensions(data.width, data.height, "audio2video");
  if (dimensionError) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["width"], message: dimensionError });
  }
  if (data.numFrames !== void 0 && data.audioMaxDuration !== void 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["audioMaxDuration"],
      message: "audioMaxDuration and numFrames are mutually exclusive"
    });
  }
}).transform(resolveDuration).transform((data) => data.numFrames === void 0 && data.audioMaxDuration === void 0 ? { ...data, numFrames: 121 } : data);
var astraVideoRetakeSchema = external_exports.object({
  prompt: promptSchema,
  sourceVideoPath: external_exports.string().min(1, "sourceVideoPath is required"),
  startTime: external_exports.number().min(0),
  endTime: external_exports.number().positive(),
  seed: seedSchema,
  generateAudio: generateAudioSchema,
  ...outputFields
}).superRefine((data, ctx) => {
  if (data.startTime >= data.endTime) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["endTime"],
      message: `endTime must be greater than startTime (got ${data.startTime} .. ${data.endTime})`
    });
  }
});
function uploadKindIssue(filePath, kinds, name) {
  try {
    const { kind } = uploadContentType(filePath);
    return kinds.includes(kind) ? null : `${name} must be ${kinds.join(" or ")} (got ${kind})`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
var astraIcLoraSchema = external_exports.object({
  prompt: promptSchema,
  adapter: external_exports.enum(ASTRA_VIDEO_IC_LORA_ADAPTERS),
  referencePath: external_exports.string().trim().min(1, "referencePath is required"),
  referenceStrength: external_exports.number().min(0).max(1).optional(),
  conditioningMaskPath: external_exports.string().trim().min(1).optional(),
  conditioningMaskStrength: external_exports.number().min(0).max(1).optional(),
  skipStage2: external_exports.boolean().optional(),
  numFrames: numFramesSchema("ic_lora"),
  width: widthSchema,
  height: heightSchema,
  frameRate: frameRateSchema,
  seed: seedSchema,
  duration: durationSchema,
  generateAudio: generateAudioSchema,
  ...outputFields
}).superRefine((data, ctx) => {
  checkDuration(data, icLoraMode(data.adapter), ctx);
  const referenceIssue = uploadKindIssue(data.referencePath, ["image", "video"], "referencePath");
  if (referenceIssue) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["referencePath"], message: referenceIssue });
  if (data.conditioningMaskPath !== void 0) {
    const maskIssue = uploadKindIssue(data.conditioningMaskPath, ["video"], "conditioningMaskPath");
    if (maskIssue) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["conditioningMaskPath"], message: maskIssue });
  } else if (data.conditioningMaskStrength !== void 0) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["conditioningMaskStrength"], message: "conditioningMaskStrength needs conditioningMaskPath" });
  }
  const dimensionError = checkDimensions(data.width, data.height, icLoraMode(data.adapter));
  if (dimensionError) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["width"], message: dimensionError });
  }
}).transform(resolveDuration);
function icLoraMode(adapter) {
  return adapter === "ingredients" ? "ingredients" : "ic_lora";
}
var ASTRA_VIDEO_SHORT_AUDIO_SLACK = 0.08;
function checkAudioCoversVideo(usable, numFrames, frameRate, afterStart = false) {
  const videoSeconds = numFrames / frameRate;
  if (usable + ASTRA_VIDEO_SHORT_AUDIO_SLACK >= videoSeconds) return null;
  const fit = 8 * Math.floor((usable * frameRate - 1) / 8 + 1e-4) + 1;
  const fixes = [`re-upload audio of at least ${(Math.ceil(videoSeconds * 1e4) / 1e4).toFixed(4)}s`];
  if (fit >= ASTRA_VIDEO_MIN_FRAMES) fixes.push(`set numFrames to ${fit} or less (duration ${(fit / frameRate).toFixed(4)}s or less)`);
  fixes.push("use audioMaxDuration instead of numFrames/duration to follow the audio length");
  return `the audio is shorter than the video \u2014 usable audio ${usable.toFixed(3)}s${afterStart ? " (after audioStartTime)" : ""} vs ${numFrames} frames = ${videoSeconds.toFixed(4)}s at ${frameRate}fps; generation would fail on a latent shape mismatch. Fix: ${fixes.map((f, i) => `(${i + 1}) ${f}`).join(" \xB7 ")}`;
}
function checkAudioSource(upload, args) {
  if (upload.kind !== "audio") return `audioPath uploaded as ${upload.kind}, not audio`;
  if (!Number.isFinite(upload.duration) || (upload.duration ?? 0) <= 0) {
    return "audio upload response did not include a positive duration";
  }
  const start = args.audioStartTime ?? 0;
  const duration = upload.duration;
  if (start >= duration) {
    return `audioStartTime must be less than the source duration ${duration}s (got ${start})`;
  }
  if (args.audioMaxDuration === void 0 && args.wav) {
    const shortError = checkAudioCoversVideo(duration - start, args.numFrames ?? 121, args.frameRate ?? 24, start > 0);
    if (shortError) return shortError;
  }
  if (args.numFrames !== void 0 || args.audioMaxDuration === void 0) return null;
  const usableSeconds = Math.min(args.audioMaxDuration, duration - start);
  const rawFrames = Math.floor(usableSeconds * (args.frameRate ?? 24));
  const clampedFrames = Math.max(1, Math.min(1024, rawFrames));
  const gridFrames = 1 + ASTRA_VIDEO_FRAME_STEP * Math.floor((clampedFrames - 1) / ASTRA_VIDEO_FRAME_STEP);
  if (gridFrames > ASTRA_VIDEO_FRAME_LIMITS.audio2video) {
    return `audioMaxDuration selects ${gridFrames} frames after clipping and the 8k+1 grid; maximum is ${ASTRA_VIDEO_FRAME_LIMITS.audio2video}`;
  }
  return null;
}
function put(body, key, value) {
  if (value !== void 0) body[key] = value;
}
function buildJobBody(mode, args) {
  const allowed = ASTRA_VIDEO_ALLOWED_FIELDS[mode];
  if (!allowed) throw new Error(`Unknown ASTRA video mode: ${mode}`);
  const body = { mode, prompt: args.prompt };
  if (args.numFrames !== void 0 && args.autoDuration !== void 0) {
    throw new Error("autoDuration and numFrames are mutually exclusive");
  }
  if (args.hdr && (args.images?.length || args.references?.length || args.conditioningMask || args.videoUploadId)) {
    throw new Error("hdr cannot be combined with visual inputs");
  }
  put(body, "hdr", args.hdr);
  put(body, "num_frames", args.numFrames);
  if (args.autoDuration) {
    body.auto_duration = { min_seconds: args.autoDuration.minSeconds, max_seconds: args.autoDuration.maxSeconds };
  }
  put(body, "width", args.width);
  put(body, "height", args.height);
  put(body, "frame_rate", args.frameRate);
  put(body, "seed", args.seed);
  if (args.lora?.length) body.lora = args.lora.map((entry2) => typeof entry2 === "string" ? entry2 : { name: entry2.name, strength: entry2.strength });
  if (args.guidance && Object.keys(args.guidance).length) {
    body.guidance = Object.fromEntries(Object.entries(args.guidance).map(([key, value]) => [guidanceWireKey(key), value]));
  }
  put(body, "adapter", args.adapter);
  if (args.references?.length) {
    body.references = args.references.map((reference) => {
      const entry2 = { upload_id: reference.uploadId };
      put(entry2, "strength", reference.strength);
      return entry2;
    });
  }
  if (args.conditioningMask) {
    const mask = { upload_id: args.conditioningMask.uploadId };
    put(mask, "strength", args.conditioningMask.strength);
    body.conditioning_mask = mask;
  }
  if (args.skipStage2) body.skip_stage_2 = true;
  if (args.generateAudio === false) body.generate_audio = false;
  put(body, "negative_prompt", args.negativePrompt);
  put(body, "num_inference_steps", args.numInferenceSteps);
  put(body, "num_generated_keyframes", args.numGeneratedKeyframes);
  if (args.images?.length) {
    body.images = args.images.map((image) => {
      const entry2 = { upload_id: image.uploadId, frame_idx: image.frameIdx };
      put(entry2, "strength", image.strength);
      put(entry2, "crf", image.crf);
      return entry2;
    });
  }
  put(body, "audio_upload_id", args.audioUploadId);
  put(body, "audio_start_time", args.audioStartTime);
  put(body, "audio_max_duration", args.audioMaxDuration);
  put(body, "video_upload_id", args.videoUploadId);
  put(body, "start_time", args.startTime);
  put(body, "end_time", args.endTime);
  const rejected = Object.keys(body).filter((key) => !allowed.includes(key));
  if (rejected.length) {
    throw new Error(
      `mode ${mode} does not accept ${rejected.join(", ")} \u2014 it accepts ${allowed.join(", ")}. Drop the field or pick the mode that owns it.`
    );
  }
  return body;
}
function sleep(ms) {
  return new Promise((resolve5) => setTimeout(resolve5, ms));
}
var submitTimestamps = [];
async function waitForSubmitSlot() {
  for (; ; ) {
    const now = Date.now();
    while (submitTimestamps.length && now - submitTimestamps[0] >= 36e5) submitTimestamps.shift();
    const recentMinute = submitTimestamps.filter((timestamp) => now - timestamp < 6e4);
    if (recentMinute.length < ASTRA_VIDEO_SUBMITS_PER_MINUTE && submitTimestamps.length < ASTRA_VIDEO_SUBMITS_PER_HOUR) {
      submitTimestamps.push(now);
      return;
    }
    const minuteWait = recentMinute.length >= ASTRA_VIDEO_SUBMITS_PER_MINUTE ? 6e4 - (now - recentMinute[0]) : 0;
    const hourWait = submitTimestamps.length >= ASTRA_VIDEO_SUBMITS_PER_HOUR ? 36e5 - (now - submitTimestamps[0]) : 0;
    await sleep(Math.max(minuteWait, hourWait) + 250);
  }
}
var uploadTimestamps = [];
async function waitForUploadSlot() {
  for (; ; ) {
    const now = Date.now();
    while (uploadTimestamps.length && now - uploadTimestamps[0] >= 6e4) uploadTimestamps.shift();
    if (uploadTimestamps.length < ASTRA_VIDEO_UPLOADS_PER_MINUTE) {
      uploadTimestamps.push(now);
      return;
    }
    await sleep(6e4 - (now - uploadTimestamps[0]) + 250);
  }
}
function redactedFailure(what, status, body) {
  const trimmed = body.length > 600 ? `${body.slice(0, 600)}\u2026` : body;
  return new Error(`ASTRA video ${what} failed (HTTP ${status}): ${trimmed}`);
}
function isTerminalStatus(status) {
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 413 || status === 415;
}
function astraVideoHeaders(key) {
  return {
    Authorization: `Bearer ${key}`,
    "User-Agent": ASTRA_VIDEO_USER_AGENT
  };
}
function authHeaders() {
  return astraVideoHeaders(requireAstraVideoKey());
}
function jobsUrl(suffix = "") {
  return `${astraVideoBaseUrl()}/v1/jobs${suffix}`;
}
async function withBackoff(what, call, baseDelayMs = 2e3) {
  let delay = baseDelayMs;
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await call();
    if (result.ok || result.status !== 429 && result.status !== 503) return result;
    last = result;
    await sleep(delay);
    delay *= 2;
  }
  return last;
}
var CONTENT_TYPE_BY_EXTENSION = {
  ".png": { contentType: "image/png", kind: "image" },
  ".jpg": { contentType: "image/jpeg", kind: "image" },
  ".jpeg": { contentType: "image/jpeg", kind: "image" },
  ".mp4": { contentType: "video/mp4", kind: "video" },
  ".wav": { contentType: "audio/wav", kind: "audio" },
  ".mp3": { contentType: "audio/mpeg", kind: "audio" }
};
function uploadContentType(filePath) {
  const ext = path3.extname(filePath).toLowerCase();
  const found = CONTENT_TYPE_BY_EXTENSION[ext];
  if (!found) {
    throw new Error(
      `ASTRA video uploads accept ${Object.keys(CONTENT_TYPE_BY_EXTENSION).join(", ")} \u2014 "${ext || filePath}" is not one of them.`
    );
  }
  return found;
}
async function uploadFile(filePath) {
  const resolved = path3.resolve(filePath);
  if (!fs2.existsSync(resolved)) throw new Error(`File not found: ${filePath}`);
  const { contentType, kind } = uploadContentType(resolved);
  const bytes = fs2.statSync(resolved).size;
  const limit = ASTRA_VIDEO_UPLOAD_LIMITS[kind];
  if (bytes > limit) {
    throw new Error(`${path3.basename(resolved)} is ${bytes} bytes; the ${kind} upload ceiling is ${limit} bytes.`);
  }
  await waitForUploadSlot();
  const headers = authHeaders();
  const result = await withBackoff("upload", async () => {
    try {
      const response = await fetch(`${astraVideoBaseUrl()}/v1/uploads`, {
        method: "POST",
        headers: { ...headers, "Content-Type": contentType },
        body: fs2.readFileSync(resolved),
        signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS)
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, status: 502, body: `Upload unreachable: ${message}` };
    }
  });
  if (!result.ok) throw redactedFailure(`upload of ${path3.basename(resolved)}`, result.status, result.body);
  const parsed = JSON.parse(result.body);
  return {
    uploadId: parsed.upload_id,
    bytes: parsed.bytes,
    kind: parsed.kind,
    ...parsed.expires_at !== void 0 ? { expiresAt: parsed.expires_at } : {},
    ...parsed.duration !== void 0 ? { duration: parsed.duration } : {},
    ...parsed.width !== void 0 ? { width: parsed.width } : {},
    ...parsed.height !== void 0 ? { height: parsed.height } : {},
    ...parsed.frames !== void 0 ? { frames: parsed.frames } : {},
    ...parsed.fps !== void 0 ? { fps: parsed.fps } : {}
  };
}
async function submitJob(body) {
  const bodyBytes = Buffer.byteLength(JSON.stringify(body));
  if (bodyBytes > ASTRA_VIDEO_MAX_JOB_BODY_BYTES) {
    throw new Error(`ASTRA video job body is ${bodyBytes} bytes; the ceiling is ${ASTRA_VIDEO_MAX_JOB_BODY_BYTES} bytes.`);
  }
  await waitForSubmitSlot();
  const result = await withBackoff(
    "submit",
    () => requestRaw("post", jobsUrl(), authHeaders(), body, SUBMIT_TIMEOUT_MS),
    15e3
  );
  if (!result.ok) throw redactedFailure("job submission", result.status, result.body);
  const parsed = JSON.parse(result.body);
  if (!parsed.job_id) throw new Error(`ASTRA video accepted the job but returned no job_id: ${result.body}`);
  return parsed.job_id;
}
async function awaitResult(jobId) {
  const startedAt = Date.now();
  for (; ; ) {
    if (Date.now() - startedAt > ASTRA_VIDEO_MAX_WAIT_MS) {
      throw new Error(
        `ASTRA video job ${jobId} did not finish within ${ASTRA_VIDEO_MAX_WAIT_MS / 1e3}s. It may still be running \u2014 check GET /v1/jobs/${jobId}.`
      );
    }
    const status = await withBackoff(
      "status",
      () => requestRaw("get", jobsUrl(`/${jobId}`), authHeaders(), void 0, STATUS_TIMEOUT_MS)
    );
    if (!status.ok) {
      if (isTerminalStatus(status.status)) throw redactedFailure(`status of job ${jobId}`, status.status, status.body);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    const job = JSON.parse(status.body);
    if (job.status === "failed") {
      throw new Error(`ASTRA video job ${jobId} failed: ${job.error || "the server gave no reason"}`);
    }
    if (job.status === "succeeded") {
      const download = await withBackoff("result download", async () => {
        try {
          const response = await fetch(jobsUrl(`/${jobId}/result`), {
            headers: authHeaders(),
            signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS)
          });
          return {
            ok: response.ok,
            status: response.status,
            bytes: Buffer.from(await response.arrayBuffer())
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { ok: false, status: 502, bytes: Buffer.from(message) };
        }
      });
      if (download.status === 409) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      if (!download.ok) {
        throw redactedFailure(`result download of job ${jobId}`, download.status, download.bytes.toString("utf8"));
      }
      return {
        bytes: download.bytes,
        request: job.request,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1e3)
      };
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
async function runJob(mode, prompt, body, outputPath, filename) {
  const videoPath = resolveOutputFile(outputPath || process.cwd(), filename || `astra_${Date.now()}.mp4`, "video");
  const receiptPath = `${videoPath}.astra-job.json`;
  const writeReceipt = (value) => {
    const temp = `${receiptPath}.${process.pid}.tmp`;
    fs2.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 384 });
    fs2.renameSync(temp, receiptPath);
  };
  const jobId = await submitJob(body);
  recordVideoSubmission(jobId);
  const submitted = { jobId, mode, prompt, videoPath, submittedAt: (/* @__PURE__ */ new Date()).toISOString(), submittedRequest: body };
  writeReceipt({ ...submitted, status: "submitted" });
  const { bytes, request, elapsedSeconds } = await awaitResult(jobId);
  fs2.writeFileSync(videoPath, bytes);
  const response = { videoPath, jobId, mode, prompt, bytes: bytes.length, elapsedSeconds, ...request ? { request } : {} };
  writeReceipt({ ...submitted, ...response, sha256: createHash2("sha256").update(bytes).digest("hex"), status: "completed", completedAt: (/* @__PURE__ */ new Date()).toISOString() });
  return response;
}
async function generateFromImage(args) {
  const first = await uploadFile(args.firstFramePath);
  const images = [{ uploadId: first.uploadId, frameIdx: 0, strength: args.strength ?? 1 }];
  if (args.lastFramePath) {
    const last = await uploadFile(args.lastFramePath);
    images.push({ uploadId: last.uploadId, frameIdx: (args.numFrames ?? 121) - 1, strength: args.strength ?? 1 });
  }
  const mode = ASTRA_VIDEO_TIERS[args.tier];
  const dimensions = mode === "guided" || mode === "guided_hq" ? { width: args.width ?? 1536, height: args.height ?? 1024 } : {};
  const body = buildJobBody(mode, { ...args, ...dimensions, images });
  return runJob(mode, args.prompt, body, args.outputPath, args.filename);
}
async function generateFromKeyframes(args) {
  const images = [];
  for (const image of args.images) {
    const uploaded = await uploadFile(image.imagePath);
    images.push({ uploadId: uploaded.uploadId, frameIdx: image.frameIdx, strength: image.strength ?? 1, crf: image.crf });
  }
  const body = buildJobBody("keyframe", { ...args, images });
  return runJob("keyframe", args.prompt, body, args.outputPath, args.filename);
}
async function generateFromAudio(args) {
  if (args.imagePath && uploadContentType(args.imagePath).kind !== "image") {
    throw new Error("ASTRA video imagePath must be an image (.png/.jpg/.jpeg)");
  }
  const audio = args.audioPath !== void 0 ? await uploadFile(args.audioPath) : void 0;
  if (audio) {
    const sourceError = checkAudioSource(audio, { ...args, wav: /\.wav$/i.test(args.audioPath ?? "") });
    if (sourceError) throw new Error(`ASTRA video audio source refused: ${sourceError}`);
  }
  const audioUploadId = audio?.uploadId ?? args.audioUploadId;
  const image = args.imagePath ? await uploadFile(args.imagePath) : void 0;
  if (image && image.kind !== "image") throw new Error("ASTRA video imagePath must upload as image");
  const images = image ? [{ uploadId: image.uploadId, frameIdx: 0, strength: args.strength }] : void 0;
  const uploaded = { audioUploadId, audioExpiresAt: audio?.expiresAt, audioDuration: audio?.duration };
  if (!args.expectLipSync) {
    const body = buildJobBody("audio2video", { ...args, audioUploadId, images });
    return { ...await runJob("audio2video", args.prompt, body, args.outputPath, args.filename), ...uploaded };
  }
  const results = [];
  const attempts = [];
  let retryError;
  for (let attempt = 1; attempt <= args.maxAttempts; attempt += 1) {
    const seed = attempt === 1 ? args.seed : randomInt(ASTRA_VIDEO_MAX_SEED);
    const filename = attempt === 1 || !args.filename ? args.filename : args.filename.replace(/(\.[^.]+)?$/, (ext) => `-attempt${attempt}${ext}`);
    const body = buildJobBody("audio2video", { ...args, seed, audioUploadId, images });
    let result;
    try {
      result = await runJob("audio2video", args.prompt, body, args.outputPath, filename);
    } catch (error) {
      if (attempt === 1) throw error;
      retryError = `attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`;
      break;
    }
    const check = checkSpeechSync({ videoPath: result.videoPath, audioPath: args.audioPath, audioStartTime: args.audioStartTime, audioMaxDuration: args.audioMaxDuration });
    annotateReceipt(result.videoPath, { speechSync: { attempt, seed: seed ?? null, ...check } });
    results.push(result);
    attempts.push({ videoPath: result.videoPath, jobId: result.jobId, seed, check });
    if (!check.findings.some((finding) => finding.reseed)) break;
  }
  const last = attempts.length - 1;
  const chosen = attempts[last].check.findings.some((finding) => finding.reseed) ? attempts.reduce((best, a, i) => (a.check.sync?.margin ?? -Infinity) > (attempts[best].check.sync?.margin ?? -Infinity) ? i : best, 0) : last;
  annotateReceipt(results[chosen].videoPath, { selection: {
    status: "provisional",
    basis: "picture_motion_audio_correlation",
    candidate: chosen,
    review: { camera: "not_reviewed", blocking: "not_reviewed", phonemeLipSync: "not_reviewed" }
  } });
  return { ...results[chosen], ...uploaded, speechSync: { attempts, chosen, ...retryError ? { retryError } : {} } };
}
function annotateReceipt(videoPath, extra) {
  const receiptPath = `${videoPath}.astra-job.json`;
  const temp = `${receiptPath}.${process.pid}.tmp`;
  fs2.writeFileSync(temp, JSON.stringify({ ...JSON.parse(fs2.readFileSync(receiptPath, "utf8")), ...extra }, null, 2) + "\n", { mode: 384 });
  fs2.renameSync(temp, receiptPath);
}

// src/astra-genai-client.ts
var genaiImageUriSchema = external_exports.string().min(1).refine((value) => {
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Use a public HTTPS PNG/JPEG URL or PNG/JPEG data URI");

// src/astra-genai-video.ts
var GENAI_VIDEO_MODELS = ["ltx-2.5-22b-distilled", "ltx-2.5-22b-dev"];
var GENAI_CAMERA_MOTIONS = ["dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "static", "focus_shift"];
var genaiTextToVideoSchema = external_exports.object({
  prompt: external_exports.string().min(1).max(5e3),
  model: external_exports.enum(GENAI_VIDEO_MODELS),
  duration: external_exports.number().int().nullable(),
  resolution: external_exports.string().min(1),
  fps: external_exports.union([external_exports.literal(24), external_exports.literal(25), external_exports.literal(48), external_exports.literal(50)]).default(24),
  generateAudio: external_exports.boolean().default(true),
  cameraMotion: external_exports.enum(GENAI_CAMERA_MOTIONS).nullable().optional(),
  reserveUsd: external_exports.number().finite().nonnegative(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").refine((name) => name.endsWith(".mp4"), "Use an .mp4 filename").optional()
}).strict();
var genaiImageToVideoSchema = genaiTextToVideoSchema.extend({
  imageUri: external_exports.string().min(1),
  lastFrameUri: external_exports.string().min(1).nullable().optional()
});
var genaiMsrSchema = external_exports.object({
  prompt: external_exports.string().trim().min(1).max(2e3),
  references: external_exports.array(external_exports.object({
    imageUri: genaiImageUriSchema.optional(),
    imagePath: external_exports.string().min(1).optional(),
    background: external_exports.boolean().default(false)
  }).strict().refine(
    (ref) => Number(!!ref.imageUri) + Number(!!ref.imagePath) === 1,
    "Supply exactly one imageUri or imagePath"
  )).min(1).max(5),
  referenceStrength: external_exports.number().finite().min(0).max(1).default(1),
  referenceFrames: external_exports.union([external_exports.literal(25), external_exports.literal(33)]).default(33),
  width: external_exports.number().int().min(64).max(1920).multipleOf(64).default(1536),
  height: external_exports.number().int().min(64).max(1920).multipleOf(64).default(1024),
  numFrames: external_exports.number().int().min(25).max(361).refine((n) => (n - 1) % 8 === 0).optional(),
  duration: external_exports.number().finite().gt(0).max(360).optional(),
  frameRate: external_exports.number().finite().min(1).max(60).default(24),
  seed: external_exports.number().int().min(0).max(2147483647).default(42),
  reserveUsd: external_exports.number().finite().nonnegative(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").refine((name) => name.endsWith(".mp4"), "Use a .mp4 filename").optional()
}).strict().superRefine((args, ctx) => {
  const issue = (message) => ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message });
  const backgrounds = args.references.filter((ref) => ref.background).length;
  if (backgrounds > 1 || args.references.length - backgrounds > 4) issue("MSR supports at most four subjects and one background");
  if (args.width * args.height > 2064384) issue("MSR maximum is 2,064,384 pixels");
  if (args.duration !== void 0) {
    if (args.numFrames !== void 0) issue("Omit numFrames when using duration");
    const frames = 1 + 8 * Math.ceil((args.duration * args.frameRate - 1) / 8 - 0.5 - 1e-9);
    if (frames < 25 || frames > 361) issue("MSR duration must round to 25..361 frames");
  }
});
var operationSchema = external_exports.enum(["text-to-video", "image-to-video", "msr"]);
var receiptSchema = external_exports.object({
  version: external_exports.literal(1),
  baseUrl: external_exports.string(),
  operation: operationSchema,
  fingerprint: external_exports.string(),
  videoPath: external_exports.string(),
  jobId: external_exports.string().min(1).optional(),
  status: external_exports.enum(["submitting", "submitted", "completed"]),
  sha256: external_exports.string().optional()
}).strict();
var statusSchema = external_exports.object({
  id: external_exports.string().min(1),
  status: external_exports.enum(["pending", "processing", "completed", "failed"]),
  result: external_exports.object({ video_url: external_exports.string().min(1) }).passthrough().nullish(),
  error: external_exports.unknown().optional()
}).passthrough();
var genaiVideoStatusSchema = external_exports.object({ receiptPath: external_exports.string().min(1), download: external_exports.boolean().default(false) }).strict();

// src/omni-client.ts
var VALID_OMNI_ASPECT_RATIOS = ["16:9", "9:16"];
var VALID_OMNI_RESOLUTIONS = ["360p", "720p", "1080p", "4k"];
var durationSchema2 = external_exports.number().int().min(3).max(10).optional().default(8);
var resolutionSchema = external_exports.enum(VALID_OMNI_RESOLUTIONS).optional().default("720p");
var aspectRatioSchema = external_exports.enum(VALID_OMNI_ASPECT_RATIOS).optional().default("16:9");
var omniText2VideoSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required"),
  aspectRatio: aspectRatioSchema,
  resolution: resolutionSchema,
  durationSeconds: durationSchema2,
  seed: external_exports.number().int().optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").optional()
});
var omniImg2VideoSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required"),
  sourceImagePath: external_exports.string().min(1, "Source image path is required"),
  lastImagePath: external_exports.string().optional(),
  aspectRatio: aspectRatioSchema,
  resolution: resolutionSchema,
  durationSeconds: durationSchema2,
  seed: external_exports.number().int().optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").optional()
});
var continuationFields = {
  prompt: external_exports.string().min(1, "Prompt is required"),
  previousInteractionId: external_exports.string().optional(),
  sourceVideoPath: external_exports.string().optional(),
  resolution: resolutionSchema,
  seed: external_exports.number().int().optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").optional()
};
function requireOneSource(data, ctx) {
  const given = [data.previousInteractionId, data.sourceVideoPath].filter(Boolean).length;
  if (given !== 1) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["previousInteractionId"],
      message: "Give exactly one source: previousInteractionId (an interaction from an earlier omni_* call) or sourceVideoPath (a local mp4 of at most 10 seconds)."
    });
  }
}
var omniExtendSchema = external_exports.object({ ...continuationFields, durationSeconds: durationSchema2 }).superRefine(requireOneSource);
var omniEditSchema = external_exports.object(continuationFields).superRefine(requireOneSource);

// src/image-models.ts
function mlxImageFamily(model = "") {
  if (/qwen.*image.*2[.-]1/i.test(model)) return "qwen-2.1";
  if (/mage[-_]?flow/i.test(model)) return /edit/i.test(model) ? "mage-edit" : "mage";
  if (/krea[-_]?2/i.test(model)) return "krea";
  if (/flux[.-]?2[-_]?klein/i.test(model)) return "flux-klein";
  return "unknown";
}
function validateMlxImageOperation(model, operation, args) {
  const family = mlxImageFamily(model);
  if (operation === "edit" && !["flux-klein", "mage-edit", "qwen-2.1"].includes(family))
    throw new Error("image_operation_unsupported: select an identified editing pack");
  if (operation === "variation" && !["flux-klein", "krea"].includes(family))
    throw new Error("image_operation_unsupported: this pack has no verified strength-based variation");
  if (args.transparent === true && family !== "qwen-2.1")
    throw new Error("image_transparency_unsupported: transparent requires Qwen-Image-2.1");
  const refs = Array.isArray(args.refImagePaths) ? args.refImagePaths.length : 0;
  if (refs > (family === "qwen-2.1" ? 9 : 3)) throw new Error("image_reference_limit");
  if (family === "qwen-2.1" && /turbo/i.test(model || "") && args.steps !== void 0 && args.steps !== 8)
    throw new Error("image_schedule_fixed: Qwen Turbo uses its saved 8-step schedule");
}

// src/mlx-serve-client.ts
var MLX_LOAD_TIMEOUT_MS = 10 * 6e4;
var MLX_IMAGE_TIMEOUT_MS = 15 * 6e4;
var MLX_MUSIC_TIMEOUT_MS = 10 * 6e4;
var MLX_VIDEO_TIMEOUT_MS = 20 * 6e4;
var MLX_MESH_TIMEOUT_MS = 15 * 6e4;
var MAX_VIDEO_RGB_BYTES = 800 * 1024 * 1024;
var MLX_IMAGE_DIMENSION_STEP = 16;
var MIN_MLX_IMAGE_DIMENSION = 256;
var MAX_MLX_IMAGE_DIMENSION = 2048;
var DEFAULT_MLX_IMAGE_SIZE = 1024;
var MLX_VIDEO_DIMENSION_STEP = 64;
var MLX_VIDEO_DIMENSION_STEP_ONE_STAGE = 32;
var MIN_MLX_VIDEO_DIMENSION = 256;
var MAX_MLX_VIDEO_DIMENSION = 1920;
var DEFAULT_MLX_VIDEO_WIDTH = 768;
var DEFAULT_MLX_VIDEO_HEIGHT = 1280;
var DEFAULT_MLX_VIDEO_FRAMES = 49;
var MIN_MLX_VIDEO_FRAMES = 9;
var MAX_MLX_VIDEO_FRAMES = 241;
var MLX_VIDEO_FRAME_STEP = 8;
var MLX_VIDEO_FPS = 24;
var MIN_MLX_MUSIC_SECONDS = 10;
var MAX_MLX_MUSIC_SECONDS = 600;
var DEFAULT_MLX_MUSIC_SECONDS = 30;
var MAX_MLX_IMAGE_REFS = 9;
var imageDimension = external_exports.number().int().min(MIN_MLX_IMAGE_DIMENSION).max(MAX_MLX_IMAGE_DIMENSION).refine((v) => v % MLX_IMAGE_DIMENSION_STEP === 0, {
  message: `width/height must be a multiple of ${MLX_IMAGE_DIMENSION_STEP} (for 9:16 that's 1088\xD71920, not 1080\xD71920). Model and installed backend may impose additional size constraints.`
});
var videoDimension = external_exports.number().int().min(MIN_MLX_VIDEO_DIMENSION).max(MAX_MLX_VIDEO_DIMENSION).refine((v) => v % MLX_VIDEO_DIMENSION_STEP_ONE_STAGE === 0, {
  message: `width/height must be a multiple of ${MLX_VIDEO_DIMENSION_STEP_ONE_STAGE} (LTX grid), and of ${MLX_VIDEO_DIMENSION_STEP} unless you pass pipeline:"one_stage". 1080 is on neither grid \u2014 use 1088\xD71920 or the default 768\xD71280.`
});
var mlxImageGenerateSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required").max(32e3),
  model: external_exports.string().min(1).optional(),
  transparent: external_exports.boolean().optional(),
  width: imageDimension.optional().default(DEFAULT_MLX_IMAGE_SIZE),
  height: imageDimension.optional().default(DEFAULT_MLX_IMAGE_SIZE),
  steps: external_exports.number().int().min(1).max(100).optional(),
  seed: external_exports.number().int().min(0).optional(),
  imagePath: external_exports.string().min(1).optional(),
  strength: external_exports.number().min(0).max(1).optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("image").optional()
}).superRefine((value, ctx) => {
  if (value.width === void 0 !== (value.height === void 0)) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Send width and height together" });
  if (value.model) {
    try {
      validateMlxImageOperation(value.model, "imagePath" in value && value.imagePath ? "refImagePaths" in value ? "edit" : "variation" : "text", value);
    } catch (error) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: String(error) });
    }
  }
});
var mlxImageEditSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required").max(32e3),
  imagePath: external_exports.string().min(1, "imagePath is required"),
  refImagePaths: external_exports.array(external_exports.string().min(1)).max(MAX_MLX_IMAGE_REFS).optional(),
  model: external_exports.string().min(1).optional(),
  transparent: external_exports.boolean().optional(),
  width: imageDimension.optional(),
  height: imageDimension.optional(),
  steps: external_exports.number().int().min(1).max(100).optional(),
  seed: external_exports.number().int().min(0).optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("image").optional()
}).superRefine((value, ctx) => {
  if (value.width === void 0 !== (value.height === void 0)) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Send width and height together" });
  if (value.model) {
    try {
      validateMlxImageOperation(value.model, "edit", value);
    } catch (error) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, message: String(error) });
    }
  }
});
var mlxMusicGenerateSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required").max(4e3),
  model: external_exports.string().min(1).optional(),
  lyrics: external_exports.string().max(8e3).optional(),
  instrumental: external_exports.boolean().optional().default(true),
  durationSeconds: external_exports.number().int().min(MIN_MLX_MUSIC_SECONDS).max(MAX_MLX_MUSIC_SECONDS).optional().default(DEFAULT_MLX_MUSIC_SECONDS),
  seed: external_exports.number().int().min(0).optional(),
  refAudioPath: external_exports.string().min(1).optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("audio").optional()
}).superRefine((value, ctx) => {
  if (value.instrumental && value.lyrics && value.lyrics.trim().length > 0) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: "instrumental:true cannot be sent beside lyrics \u2014 mlx-serve returns 400. Set instrumental false to sing, or drop lyrics for a bed."
    });
  }
});
var mlxVideoGenerateSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required").max(32e3),
  model: external_exports.string().min(1).optional(),
  width: videoDimension.optional().default(DEFAULT_MLX_VIDEO_WIDTH),
  height: videoDimension.optional().default(DEFAULT_MLX_VIDEO_HEIGHT),
  numFrames: external_exports.number().int().min(MIN_MLX_VIDEO_FRAMES).max(MAX_MLX_VIDEO_FRAMES).optional().default(DEFAULT_MLX_VIDEO_FRAMES),
  steps: external_exports.number().int().min(1).max(50).optional(),
  seed: external_exports.number().int().min(0).optional(),
  firstFrameImagePath: external_exports.string().min(1).optional(),
  lastFrameImagePath: external_exports.string().min(1).optional(),
  pipeline: external_exports.enum(["one_stage", "two_stage", "two_stage_hq"]).optional(),
  decoder: external_exports.enum(["conv", "diffusion"]).optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("video").optional()
}).superRefine((value, ctx) => {
  if (videoExceedsMemory(value.width, value.height, value.numFrames)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      message: videoMemoryMessage(value.width, value.height, value.numFrames)
    });
  }
  if (value.pipeline !== "one_stage") {
    for (const [field, size] of [["width", value.width], ["height", value.height]]) {
      if (size % MLX_VIDEO_DIMENSION_STEP !== 0) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: [field],
          message: `${field} ${size} is off the two-stage LTX grid (multiple of ${MLX_VIDEO_DIMENSION_STEP}). Pass pipeline:"one_stage" to use the ${MLX_VIDEO_DIMENSION_STEP_ONE_STAGE}px grid, or round to ${Math.round(size / MLX_VIDEO_DIMENSION_STEP) * MLX_VIDEO_DIMENSION_STEP}.`
        });
      }
    }
  }
  if ((value.numFrames - 1) % MLX_VIDEO_FRAME_STEP !== 0) {
    const below = value.numFrames - (value.numFrames - 1) % MLX_VIDEO_FRAME_STEP;
    const above = below + MLX_VIDEO_FRAME_STEP;
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["numFrames"],
      message: `numFrames must be ${MLX_VIDEO_FRAME_STEP}k+1 (${MIN_MLX_VIDEO_FRAMES}, 17, 25, \u2026 ${MAX_MLX_VIDEO_FRAMES}) \u2014 LTX latent depth. ${value.numFrames} is not, and mlx-serve answers 200 with its own default instead of refusing. Use ${below} or ${Math.min(above, MAX_MLX_VIDEO_FRAMES)}.`
    });
  }
});
var mlx3dGenerateSchema = external_exports.object({
  imagePath: external_exports.string().min(1, "imagePath is required"),
  model: external_exports.string().min(1).optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("mesh").optional()
});
function videoRgbBytes(width, height, frames) {
  return width * height * frames * 3;
}
function videoExceedsMemory(width, height, frames) {
  return videoRgbBytes(width, height, frames) > MAX_VIDEO_RGB_BYTES;
}
function videoMemoryMessage(width, height, frames) {
  const mb = (videoRgbBytes(width, height, frames) / (1024 * 1024)).toFixed(0);
  const cap = (MAX_VIDEO_RGB_BYTES / (1024 * 1024)).toFixed(0);
  return `Decoded RGB would be ~${mb}MB (${width}\xD7${height}\xD7${frames}\xD73), over the ${cap}MB cap. Drop frames or canvas \u2014 1088\xD71920 at 8s/24fps is ~1.2GB and is refused. The default 768\xD71280\xD7${DEFAULT_MLX_VIDEO_FRAMES} stays under the cap.`;
}

// src/video-duration.ts
var import_video_duration = __toESM(require_video_duration(), 1);
var DURATION_TOOLS = [
  "veo_text2video",
  "veo_img2video",
  "veo_reference",
  "omni_text2video",
  "omni_img2video",
  "seedance_text2video",
  "seedance_img2video",
  "seedance_reference",
  "astra_text2video",
  "astra_img2video",
  "astra_keyframe_video",
  "astra_audio2video",
  "mlx_video_generate"
];
function resolveVideoDuration(tool, input) {
  if (input.requiredSeconds === void 0) return { args: input, timing: null };
  if (!DURATION_TOOLS.includes(tool)) throw new Error("requiredSeconds is not supported for " + tool);
  for (const key of ["duration", "durationSeconds", "numFrames", "frames", "autoDuration", "audioMaxDuration"]) {
    if (input[key] !== void 0) throw new Error("requiredSeconds is mutually exclusive with " + key + "; supply the shot need or an exact legacy request, not both");
  }
  let limits;
  if (tool.startsWith("veo_")) {
    const fixed = tool === "veo_reference" || ["1080p", "4k"].includes(String(input.resolution));
    limits = { seconds: fixed ? [8] : [4, 6, 8] };
  } else if (tool.startsWith("omni_")) {
    limits = { min: 3, max: 10 };
  } else if (tool.startsWith("seedance_")) {
    const model = input.model ?? (tool === "seedance_reference" ? DEFAULT_SEEDANCE_REFERENCE_MODEL : DEFAULT_SEEDANCE_MODEL);
    const spec = SEEDANCE_MODEL_SPECS[model];
    if (!spec) throw new Error("Unknown Seedance model: " + String(model));
    limits = SEEDANCE_FRAME_MODELS.includes(model) ? { min: SEEDANCE_MIN_FRAMES, max: SEEDANCE_MAX_FRAMES, step: SEEDANCE_FRAME_STEP, frameRate: SEEDANCE_FPS } : { min: spec.duration[0], max: spec.duration[1] };
  } else if (tool.startsWith("astra_")) {
    const mode = tool === "astra_audio2video" ? "audio2video" : tool === "astra_keyframe_video" ? "keyframe" : input.tier === "guided" ? "guided" : input.tier === "fast" ? "guided_fast" : input.tier === "hq" ? "guided_hq" : "generate";
    const frameRate = input.frameRate ?? 24;
    if (typeof frameRate !== "number" || !Number.isFinite(frameRate) || frameRate < 1 || frameRate > 60)
      throw new Error("frameRate must be finite in 1..60");
    limits = { min: ASTRA_VIDEO_MIN_FRAMES, max: ASTRA_VIDEO_FRAME_LIMITS[mode], step: ASTRA_VIDEO_FRAME_STEP, frameRate };
  } else {
    limits = { min: MIN_MLX_VIDEO_FRAMES, max: MAX_MLX_VIDEO_FRAMES, step: MLX_VIDEO_FRAME_STEP, frameRate: MLX_VIDEO_FPS };
  }
  const timing = (0, import_video_duration.minimumDuration)(input.requiredSeconds, limits);
  const { requiredSeconds: _required, ...args } = input;
  if (timing.numFrames !== void 0) args[tool.startsWith("seedance_") ? "frames" : "numFrames"] = timing.numFrames;
  else if (tool !== "veo_reference") args.durationSeconds = timing.durationSeconds;
  return { args, timing };
}

// src/video-registry.ts
var entry = (engine, deployment, operation, schema) => ({ engine, deployment, operation, schema });
var VIDEO_ADAPTERS = Object.freeze({
  veo_text2video: entry("veo", "gemini-api", "text", text2VideoSchema),
  veo_img2video: entry("veo", "gemini-api", "image", img2VideoSchema),
  veo_reference: entry("veo", "gemini-api", "reference", referenceVideoSchema),
  veo_extension: entry("veo", "gemini-api", "extend", videoExtensionSchema),
  seedance_text2video: entry("seedance", "byteplus", "text", seedanceText2VideoSchema),
  seedance_img2video: entry("seedance", "byteplus", "image", seedanceImg2VideoSchema),
  seedance_reference: entry("seedance", "byteplus", "reference", seedanceReferenceSchema),
  astra_genai_text2video: entry("astra-genai", "genai-ltx-v2", "text", genaiTextToVideoSchema),
  astra_genai_img2video: entry("astra-genai", "genai-ltx-v2", "image", genaiImageToVideoSchema),
  astra_genai_msr: entry("astra-genai", "genai-ltx-msr", "reference", genaiMsrSchema),
  astra_text2video: entry("astra", "self-hosted-ltx", "text", astraText2VideoSchema),
  astra_img2video: entry("astra", "self-hosted-ltx", "image", astraImg2VideoSchema),
  astra_keyframe_video: entry("astra", "self-hosted-ltx", "keyframe", astraKeyframeVideoSchema),
  astra_audio2video: entry("astra", "self-hosted-ltx", "audio", astraAudio2VideoSchema),
  astra_ic_lora: entry("astra", "self-hosted-ltx", "control", astraIcLoraSchema),
  astra_video_retake: entry("astra", "self-hosted-ltx", "retake", astraVideoRetakeSchema),
  omni_text2video: entry("omni", "gemini-interactions", "text", omniText2VideoSchema),
  omni_img2video: entry("omni", "gemini-interactions", "image", omniImg2VideoSchema),
  omni_extend: entry("omni", "gemini-interactions", "extend", omniExtendSchema),
  omni_edit: entry("omni", "gemini-interactions", "edit", omniEditSchema),
  mlx_video_generate: entry("mlx", "local-mlx", "text", mlxVideoGenerateSchema)
});
function speechVideoCapabilities(provider, model) {
  if (provider === "astra") return { provider, model, audioConditioning: true, lipSync: true, postLipSync: false, evidence: "astra_audio2video adapter contract" };
  if (provider === "veo" && VALID_VIDEO_MODELS.includes(model))
    return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, evidence: "Gemini Veo has no external audio input" };
  if (provider === "seedance" && Object.hasOwn(SEEDANCE_MODEL_SPECS, model))
    return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, evidence: "Reference audio does not promise exact recorded-speech timing; no post-lipsync adapter installed" };
  if (["host", "mlx", "omni", "astra-genai"].includes(provider))
    return { provider, model, audioConditioning: false, lipSync: false, postLipSync: false, evidence: "No verified external-speech synchronization adapter; voiceover remains available" };
  throw new Error("No verified speech synchronization contract for selected deployment/model");
}

// src/video-pricing.ts
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/usage-ledger.ts
import { execFileSync } from "node:child_process";
import path4 from "node:path";
var EPISODE_MARKER = path4.join("storyboard", "scenes.js");
var VEO_TIER = {
  "veo-3.1-lite-generate-preview": "lite",
  "veo-3.1-fast-generate-preview": "fast",
  "veo-3.1-generate-preview": "standard"
};
var SEEDANCE_FAMILY = {
  "dreamina-seedance-2-5-260628": "2-5",
  "dreamina-seedance-2-0-260128": "2-0",
  "dreamina-seedance-2-0-fast-260128": "2-0-fast",
  "dreamina-seedance-2-0-mini-260615": "2-0-mini",
  "seedance-1-0-pro-250528": "1-0-pro",
  "seedance-1-0-pro-fast-251015": "1-0-pro-fast"
};
var PRICED_VIDEO_KEYS = /* @__PURE__ */ new Set([
  "veo.lite.720p",
  "veo.fast.720p",
  "veo.standard.720p",
  "veo.lite.1080p",
  "veo.fast.1080p",
  "veo.standard.1080p",
  "veo.fast.4k",
  "veo.standard.4k",
  "omni.360p",
  "omni.720p",
  "omni.1080p",
  "omni.4k",
  "seedance.1-0-pro-fast.1080p",
  "seedance.1-0-pro-fast.720p",
  "seedance.1-5-pro-silent.1080p",
  "seedance.1-5-pro-silent.720p",
  "seedance.1-5-pro-audio.1080p",
  "seedance.1-0-pro.1080p",
  "seedance.2-0-mini.720p",
  "seedance.2-0-fast.720p",
  "seedance.2-0.1080p",
  "seedance.2-5.720p",
  "seedance.2-5.1080p",
  // A request that carries a reference video (the previz lane) bills input + output seconds
  // at the vendor's lower with-video token rate — its own rows.
  "seedance.2-0-video.1080p",
  "seedance.2-5-video.720p",
  "seedance.2-5-video.1080p",
  "seedance.2-0-fast-video.720p",
  "seedance.2-0-mini-video.720p"
]);
var ELEVENLABS_KEY = { eleven_v4: "tts.elevenlabs" };
function probeSeconds(file) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
      encoding: "utf8",
      timeout: 15e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
    const seconds = Number.parseFloat(out.trim());
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1e3) / 1e3 : null;
  } catch {
    return null;
  }
}
var num = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
var str = (v, fallback) => typeof v === "string" && v ? v : fallback;
function priceOf(tool, args = {}) {
  if (args.requiredSeconds !== void 0) {
    try {
      args = resolveVideoDuration(tool, args).args;
    } catch (error) {
      return { key: null, quantity: null, note: "Invalid duration plan: " + String(error) };
    }
  }
  if (tool.startsWith("astra_genai_")) return { key: ["astra_genai_text2img", "astra_genai_edit"].includes(tool) ? "image.astra-genai" : "video.astra-genai", quantity: null, note: "Gateway pricing unverified; managed reservation is authoritative, not a measured bill" };
  if (tool.startsWith("veo_")) {
    const tier = VEO_TIER[str(args.model, "veo-3.1-fast-generate-preview")];
    const resolution = str(args.resolution, "720p");
    if (!tier) return { key: null, quantity: null, note: `unmapped veo model: ${String(args.model)}` };
    const forcedEight = resolution !== "720p" || tool === "veo_reference";
    const seconds = tool === "veo_extension" ? 7 : forcedEight ? 8 : num(args.durationSeconds, 8);
    const key = `veo.${tier}.${resolution}`;
    if (!PRICED_VIDEO_KEYS.has(key)) return { key: null, quantity: seconds, note: `no price row for ${key}` };
    return {
      key,
      quantity: seconds,
      ...tool === "veo_extension" ? { note: "extension adds 7s of new content per call \u2014 whether the vendor bills 7 or the 8s cut length is unconfirmed" } : {}
    };
  }
  if (tool.startsWith("omni_")) {
    const resolution = str(args.resolution, "720p");
    const key = `omni.${resolution}`;
    if (!PRICED_VIDEO_KEYS.has(key)) return { key: null, quantity: null, note: `no price row for ${key}` };
    const asked = tool === "omni_edit" ? null : num(args.durationSeconds, 8);
    return {
      key,
      quantity: 1,
      note: `flat per-call charge${asked === null ? "" : ` \u2014 ${asked}s requested, billed the same as 10s`}`
    };
  }
  if (tool.startsWith("seedance_")) {
    const model = str(args.model, tool === "seedance_reference" ? "dreamina-seedance-2-0-260128" : "seedance-1-5-pro-251215");
    const resolution = str(args.resolution, "720p");
    const seconds = typeof args.frames === "number" ? args.frames / 24 : num(args.durationSeconds, 5);
    const base = model === "seedance-1-5-pro-251215" ? `1-5-pro-${args.generateAudio === true ? "audio" : "silent"}` : SEEDANCE_FAMILY[model];
    if (!base) return { key: null, quantity: seconds, note: `unmapped seedance model: ${model}` };
    const videos = [
      ...Array.isArray(args.referenceVideoPaths) ? args.referenceVideoPaths : [],
      ...Array.isArray(args.referenceVideoUrls) ? args.referenceVideoUrls : []
    ].filter((v) => typeof v === "string");
    const family = videos.length ? `${base}-video` : base;
    const key = `seedance.${family}.${resolution}`;
    if (!PRICED_VIDEO_KEYS.has(key)) return { key: null, quantity: seconds, note: `no price row for ${key}` };
    if (!videos.length) return { key, quantity: seconds };
    let input = 0;
    const unread = [];
    for (const video of videos) {
      const probed = /^[a-z][a-z0-9+.-]*:/i.test(video) ? null : probeSeconds(video);
      if (probed === null) unread.push(video);
      input += probed ?? seconds;
    }
    return {
      key,
      quantity: seconds + input,
      note: `output ${seconds}s + reference video ${input}s${unread.length ? ` (${unread.length} clip(s) assumed ${seconds}s \u2014 not probed)` : ""}`
    };
  }
  if (tool.startsWith("gpt_image_")) {
    const quality = str(args.quality, "medium");
    return { key: `image.gpt-image-2.${quality}`, quantity: num(args.n, 1) };
  }
  if (tool === "image_local_generate") {
    return { key: "image.local", quantity: num(args.n, 1) };
  }
  if (tool === "mlx_image_generate" || tool === "mlx_image_edit") {
    return { key: "image.mlx", quantity: 1 };
  }
  if (tool === "tts_generate" || tool === "tts_multi_speaker") {
    const model = str(args.model, "gemini-2.5-flash-preview-tts");
    const tier = model.includes("pro") ? "pro" : "flash";
    return { key: `tts.gemini-${tier}`, quantity: charUnits(args) };
  }
  if (tool.startsWith("tts_elevenlabs_")) {
    const key = ELEVENLABS_KEY[str(args.model, "eleven_v4")] ?? null;
    return {
      key,
      quantity: null,
      note: `ElevenLabs bills the metered character-cost header, which sits below the raw text length (raw ${rawChars(args)} chars) \u2014 read the quantity off the response, not from here`
    };
  }
  if (tool === "sfx_elevenlabs_generate") {
    const seconds = args.durationSeconds;
    return {
      key: "sfx.elevenlabs",
      quantity: typeof seconds === "number" && Number.isFinite(seconds) ? seconds : null,
      note: typeof seconds === "number" ? void 0 : "billed per second of generated audio and no durationSeconds was requested \u2014 read the measured duration off the response"
    };
  }
  if (tool === "music_generate_song") return { key: "music." + String(args.model || "lyria-3.5"), quantity: 1, note: "Price unconfirmed; reconcile provider billing" };
  if (tool === "music_elevenlabs_generate") return { key: "music.elevenlabs." + String(args.modelId || "music_v2_5"), quantity: 1, note: "Price unconfirmed; reconcile provider billing" };
  if (tool === "music_generate_clip") return { key: "music.lyria-clip", quantity: 1 };
  if (tool === "music_generate" || tool === "music_generate_advanced") {
    return {
      key: "music.lyria-realtime",
      quantity: num(args.durationSeconds, 30),
      note: "unit price unconfirmed \u2014 the report excludes this item rather than counting it as 0"
    };
  }
  if (tool === "suno_generate" && String(args.model).startsWith("V6")) return { key: "music.suno." + String(args.model), quantity: 1, note: "Current V6 price unconfirmed; do not reuse legacy V5 credit rates" };
  if (tool === "suno_generate") return { key: "music.suno-generate", quantity: 1 };
  if (tool === "suno_generate_sound") return { key: "music.suno-sound", quantity: 1 };
  if (tool === "suno_generate_lyrics") return { key: "music.suno-lyrics", quantity: 1 };
  if (tool === "mlx_music_generate") {
    return { key: "music.mlx", quantity: num(args.durationSeconds, DEFAULT_MLX_MUSIC_SECONDS) };
  }
  if (["astra_text2video", "astra_img2video", "astra_keyframe_video", "astra_audio2video"].includes(tool)) {
    return { key: "video.astra", quantity: num(args.numFrames, 121) / num(args.frameRate, 24), note: "Self-hosted; hardware and wall-clock costs excluded" };
  }
  if (tool === "mlx_video_generate") {
    const frames = num(args.numFrames, DEFAULT_MLX_VIDEO_FRAMES);
    return { key: "video.mlx", quantity: Math.round(frames / MLX_VIDEO_FPS * 1e3) / 1e3 };
  }
  if (tool === "mlx_3d_generate") {
    return { key: "3d.mlx", quantity: 1 };
  }
  return { key: null, quantity: null };
}
function rawChars(args) {
  if (typeof args.text === "string") return args.text.length;
  if (typeof args.input === "string") return args.input.length;
  if (typeof args.script === "string") return args.script.length;
  if (Array.isArray(args.inputs)) {
    return args.inputs.reduce(
      (sum, t) => sum + (t && typeof t === "object" && typeof t.text === "string" ? t.text.length : 0),
      0
    );
  }
  return 0;
}
function charUnits(args) {
  return Math.round(rawChars(args) / 1e3 * 1e3) / 1e3;
}

// src/video-pricing.ts
var PRICE_FILE = fileURLToPath2(new URL("../../skills/autoproduce/references/prices.tsv", import.meta.url));

// src/video-voice.ts
import { createRequire as createRequire2 } from "node:module";
var load = createRequire2(import.meta.url);

// src/video-routing.ts
var load2 = createRequire3(import.meta.url);
var shared = fileURLToPath3(new URL("../../skills/_shared/video-selection.js", import.meta.url));
var modelSettings = fileURLToPath3(new URL("../../skills/_shared/model-settings.js", import.meta.url));
var routingContext = (episode, shotId) => load2(shared).readVideoContext(episode, shotId);
var idSchema = external_exports.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
var videoPlanSchema = external_exports.object({
  episode: external_exports.string().min(1),
  shotId: external_exports.string().min(1),
  requestId: idSchema,
  operation: external_exports.string().optional(),
  tool: external_exports.string().optional(),
  args: external_exports.record(external_exports.unknown()).default({})
}).strict();
var videoExecuteSchema = external_exports.object({ episode: external_exports.string().min(1), planId: external_exports.string().regex(/^[a-f0-9]{64}$/) }).strict();

// src/speech.ts
import { createHash as createHash3, randomUUID } from "node:crypto";
import { readFileSync as readFileSync4, writeFileSync as writeFileSync4, renameSync as renameSync3, mkdirSync as mkdirSync3, existsSync as existsSync4 } from "node:fs";
import { dirname as dirname3, resolve as resolve4, join as join4 } from "node:path";
import * as nodeModule3 from "node:module";
import { execFileSync as execFileSync2 } from "node:child_process";

// src/speech-acting.ts
import * as nodeModule2 from "node:module";
var actingText = external_exports.string().trim().min(1).max(1e3);
var actingSchema = external_exports.object({
  context: actingText.optional(),
  intent: actingText.optional(),
  emotion: actingText.optional(),
  vocal: actingText.optional(),
  visual: actingText.optional(),
  leadInSeconds: external_exports.number().finite().min(0).max(5).optional(),
  tailOutSeconds: external_exports.number().finite().min(0).max(5).optional(),
  direction: external_exports.string().trim().min(1).max(500).regex(/^[^<>\[\]|\r\n]+$/, "Use plain delivery direction, without tag markup").optional(),
  tags: external_exports.array(external_exports.string().trim().min(1).max(60).regex(/^[A-Za-z][A-Za-z ,'-]*$/, "Use bare English vocal tag names")).max(6).optional()
}).strict();
function compileActing(text, acting, voice) {
  const shared3 = nodeModule2.createRequire(import.meta.url)("../../skills/_shared/speech-contract.js");
  return shared3.compileActing(text, actingSchema.parse(acting || {}), voice);
}

// src/tts-models.ts
import { createRequire as createRequire5 } from "node:module";
var shared2 = () => createRequire5(import.meta.url)("../../skills/_shared/tts-models.js");
function resolveTtsModel(provider, model) {
  return shared2().resolveTtsModel(provider, model);
}

// src/speech.ts
var voiceContract = () => nodeModule3.createRequire(import.meta.url)("../../skills/_shared/character-voice.js");
var actingContract = () => nodeModule3.createRequire(import.meta.url)("../../skills/_shared/scene-acting.js");
var delivery = external_exports.enum(["voiceover", "on_screen", "off_screen"]);
var speechManageSchema = external_exports.object({
  path: external_exports.string().min(1),
  action: external_exports.enum(["prepare", "list", "update", "attach_audio", "plan_audio", "plan_video", "attach_video", "retime"]),
  shotId: external_exports.string().optional(),
  lineId: external_exports.string().optional(),
  speaker: external_exports.string().optional(),
  query: external_exports.string().optional(),
  expectedRevision: external_exports.string().optional(),
  patch: external_exports.object({ tts: external_exports.string().min(1).optional(), sub: external_exports.string().optional(), speaker: external_exports.string().min(1).optional(), delivery: delivery.optional(), acting: actingSchema.nullable().optional() }).strict().optional(),
  audioPath: external_exports.string().optional(),
  videoPath: external_exports.string().optional(),
  reuse: external_exports.literal("tail_trim").optional(),
  timingPatch: external_exports.object({ speechBoundActions: external_exports.boolean().optional(), actions: external_exports.array(external_exports.tuple([external_exports.number().int().nonnegative(), external_exports.number().finite().positive()])).optional() }).strict().optional(),
  generation: external_exports.object({ generator: external_exports.string().min(1), voiceSettings: external_exports.record(external_exports.unknown()), text: external_exports.string().min(1), language: external_exports.string().min(1).optional() }).strict().optional(),
  capabilities: external_exports.object({ provider: external_exports.string().min(1), model: external_exports.string().min(1), audioConditioning: external_exports.boolean(), lipSync: external_exports.boolean(), postLipSync: external_exports.boolean(), evidence: external_exports.string().min(1) }).strict().optional()
}).strict();
var hash = (s) => createHash3("sha256").update(s).digest("hex");
var object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
function speechRevision(line, character) {
  return hash(JSON.stringify(actingContract().speechRevisionPayload(line, character?.tts)));
}
function currentAudio(line, character) {
  try {
    return !!line.audio && line.audio.revision === speechRevision(line, character) && line.audio.generation?.text === line.tts && voiceContract().generationVoiceErrors(character?.tts, line.audio.generation, line).length === 0 && existsSync4(line.audio.path) && hash(readFileSync4(line.audio.path)) === line.audio.sha256;
  } catch {
    return false;
  }
}
function speechAudioPlan(line, character) {
  const voice = character?.tts;
  if (!voice) throw new Error("Missing pinned character voice");
  const validator = nodeModule3.createRequire(import.meta.url)("../../skills/_shared/character-voice.js");
  const invalid = validator.voiceErrors(voice);
  if (invalid.length) throw new Error(invalid.join("; "));
  const direction = actingContract().directionSupport(voice, line.acting);
  const language = validator.normalizeLanguage(voice.language);
  const compiled = compileActing(line.tts, line.acting || void 0, { ...voice, language });
  const modelContract = resolveTtsModel(String(voice.engine), typeof voice.model === "string" ? voice.model.trim() : void 0);
  return { ...compiled, capabilities: modelContract, arguments: compiled.generation, expectedText: line.tts, speechRevision: speechRevision(line, character), language, direction, review: "not_reviewed" };
}
function inspectionAudioPlan(line, character) {
  if (!character?.tts) return { available: false, warnings: ["Missing pinned character voice"], review: "not_reviewed" };
  try {
    return { available: true, ...speechAudioPlan(line, character) };
  } catch (error) {
    return { available: false, warnings: [error instanceof Error ? error.message : String(error)], review: "not_reviewed" };
  }
}
function audioProvenanceStatus(line, character) {
  if (!line.audio) return "missing";
  if (currentAudio(line, character)) return "current";
  const voice = character?.tts;
  const historical = ["supertonic", "mlx"].includes(String(voice?.engine)) || voice?.engine === "elevenlabs" && ["eleven_v3", "eleven_v3_conversational", "eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_turbo_v2_5"].includes(String(voice?.model));
  try {
    if (historical && line.audio.revision === speechRevision(line, character) && line.audio.generation?.text === line.tts && hash(readFileSync4(line.audio.path)) === line.audio.sha256) return "preserved_historical_recording_unverified";
  } catch {
  }
  return "stale_or_missing";
}
function measuredDuration(line) {
  if (!line.audio || !existsSync4(line.audio.path)) return null;
  try {
    const value = Number(execFileSync2("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", line.audio.path], { encoding: "utf8", timeout: 1e4, stdio: ["ignore", "pipe", "ignore"] }).trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
function speechVideoPlan(input, capabilities) {
  if (!capabilities) throw new Error("Supply the selected adapter capabilities and their evidence; never infer support from the model name");
  const scene = Array.isArray(input) ? { narration: input } : input;
  const lines = scene.narration || [];
  const onScreen = lines.some((line) => line.delivery === "on_screen");
  const mode = !onScreen ? "voiceover" : capabilities.audioConditioning && capabilities.lipSync ? "audio_conditioned" : capabilities.postLipSync ? "post_lipsync" : null;
  if (!mode) throw new Error("Selected adapter cannot synchronize on-screen dialogue. Select a capable adapter; do not silently change the scene to silent acting");
  const timeline = actingContract().planScenePerformance(scene, measuredDuration);
  const videoPrompt = actingContract().sceneVideoPrompt(timeline.performance, mode, scene);
  const promptLength = capabilities.provider.trim().toLowerCase() === "astra" ? { characters: videoPrompt.length, maxCharacters: ASTRA_VIDEO_MAX_PROMPT_CHARS, exceeded: videoPrompt.length > ASTRA_VIDEO_MAX_PROMPT_CHARS } : void 0;
  const warnings = [...timeline.warnings];
  if (promptLength?.exceeded) warnings.push(`ASTRA video prompt has ${promptLength.characters} characters; the adapter limit is ${promptLength.maxCharacters}. Shorten repeated descriptions or split at a natural action boundary while preserving necessary actions. The plan is unchanged.`);
  const performancePayload = actingContract().scenePerformancePayload(scene);
  const { performance: _performance, narration: _narration, ...reuseContext } = performancePayload;
  return { ...timeline, warnings, promptLength, reuseContextRevision: hash(JSON.stringify(reuseContext)), performanceRevision: hash(JSON.stringify(performancePayload)), videoPrompt, textPolicy: "no_visible_text", boundary: "one_shot_per_generation", instructions: "Generate only this shot. Preserve the ordered actions, addressees and reactions, including silent events. Concurrent actions share their speech interval. Match the source frame to the opening state; do not concatenate other shots sharing a reference image. " + actingContract().VIDEO_TEXT_POLICY, mode, provider: capabilities.provider, model: capabilities.model, capabilities, audioFirst: onScreen, lineIds: lines.map((line) => line.id), review: "not_reviewed" };
}
function manageSpeech(args) {
  args = speechManageSchema.parse(args);
  const { file, win, header } = readBoard(args.path);
  const before = readFileSync4(file, "utf8");
  const revision = hash(before);
  const mutates = ["prepare", "update", "attach_audio", "attach_video", "retime"].includes(args.action);
  if (mutates && args.expectedRevision !== revision) throw new Error("Read speech first and supply its current expectedRevision; the storyboard may have changed");
  const doc = object(win.SB_DOC);
  const rawCharacters = doc.characters;
  const characters = Array.isArray(rawCharacters) ? rawCharacters : Object.entries(object(rawCharacters)).map(([id, c]) => ({ ...object(c), id }));
  const character = (id) => characters.find((c) => c.id === id);
  const scenes = win.SCENES;
  let changed = false;
  let timing;
  if (args.timingPatch && args.action !== "retime") throw new Error("timingPatch is only used by retime");
  if (args.reuse && args.action !== "attach_video") throw new Error("reuse is only used by attach_video");
  if (args.action === "prepare") {
    const needsNarrator = object(win.STORY).version !== "story-v2" || scenes.some((scene) => (scene.narration || []).some((line) => !line.speaker));
    if ((needsNarrator || doc.narratorCharacterId !== void 0) && (typeof doc.narratorCharacterId !== "string" || !character(doc.narratorCharacterId)))
      throw new Error("Set SB_DOC.characters and narratorCharacterId before preparing speech without explicit speakers; no voice is invented");
    let next = Math.max(0, ...scenes.map((s) => Number(String(s.id || "").replace(/^s/, "")) || 0));
    for (const scene of scenes) {
      scene.id ||= "s" + String(++next).padStart(4, "0");
      for (const line of scene.narration || []) {
        line.id ||= "d-" + randomUUID();
        line.speaker ||= doc.narratorCharacterId;
        line.delivery ||= line.speaker === doc.narratorCharacterId ? "voiceover" : "on_screen";
      }
    }
    if (win.STRUCTURE) win.STRUCTURE.nextShotId = Math.max(win.STRUCTURE.nextShotId || 1, next + 1);
    doc.speechPlanVersion = 1;
    win.SB_DOC = doc;
    changed = true;
  }
  const all = scenes.flatMap((scene, index) => (scene.narration || []).map((line) => ({ scene, index, line })));
  const selected = all.filter(({ scene, line }) => (!args.shotId || scene.id === args.shotId) && (!args.lineId || line.id === args.lineId) && (!args.speaker || line.speaker === args.speaker || character(line.speaker)?.name === args.speaker) && (!args.query || (line.tts + " " + (line.sub || "")).includes(args.query)));
  let invalidated;
  let plan;
  if (args.action === "update" || args.action === "attach_audio") {
    if (!args.lineId || selected.length !== 1) throw new Error("Select exactly one stable lineId; list candidates for an ambiguous request");
    const { scene, line } = selected[0];
    if (args.action === "update") {
      if (!args.patch || !Object.keys(args.patch).length) throw new Error("A non-empty dialogue patch is required");
      if (args.patch.speaker && !character(args.patch.speaker)) throw new Error("Unknown speaker id");
      const prior = speechRevision(line, character(line.speaker));
      const oldAudio = line.audio;
      const oldDelivery = line.delivery;
      Object.assign(line, args.patch);
      if (args.patch.acting === null) delete line.acting;
      if (args.patch.speaker && object(win.STORY).version === "story-v2") {
        const group = (scene.narration || []).indexOf(line) + 1;
        for (const event of Array.isArray(scene.performance) ? scene.performance : []) {
          const performance = object(event);
          if (performance.group === group && ["dialogue", "narration"].includes(String(performance.kind)))
            performance.character = line.speaker;
        }
      }
      if (speechRevision(line, character(line.speaker)) !== prior) {
        const video = object(object(scene.visual).video);
        const binding = object(video.speechBinding);
        invalidated = { audio: oldAudio || null, video: Object.keys(video).length && (line.delivery === "on_screen" || oldDelivery === "on_screen" || Object.hasOwn(args.patch, "acting")) || ["audio_conditioned", "post_lipsync"].includes(String(binding.mode)) ? video : null, edit: true };
        delete line.audio;
        line.mediaStatus = "needs_audio";
        if (invalidated.video) video.speechStatus = "stale";
        scene.speechRevision = (Number(scene.speechRevision) || 0) + 1;
      }
    } else {
      if (!args.audioPath) throw new Error("audioPath is required");
      const audioPath = resolve4(dirname3(file), args.audioPath);
      if (!args.generation || args.generation.text !== line.tts) throw new Error("Attach the actual generation arguments and exact line text");
      const voice = character(line.speaker)?.tts;
      const voiceErrors = voiceContract().generationVoiceErrors(voice, args.generation, line);
      if (voiceErrors.length) throw new Error("Generation arguments do not match the pinned character voice: " + voiceErrors.join("; "));
      const bytes = readFileSync4(audioPath);
      if (!bytes.length) throw new Error("Audio file is empty");
      const priorAudio = line.audio;
      const audioHash = hash(bytes), lineRevision = speechRevision(line, character(line.speaker));
      const video = object(object(scene.visual).video), binding = object(video.speechBinding);
      const boundAudio = Array.isArray(binding.audio) ? binding.audio.map(object).find((a) => a.lineId === line.id) : void 0;
      if (priorAudio?.sha256 !== audioHash || priorAudio?.revision !== lineRevision || boundAudio && (boundAudio.sha256 !== audioHash || boundAudio.revision !== lineRevision)) {
        const dependsOnSpeech = line.delivery === "on_screen" || ["audio_conditioned", "post_lipsync"].includes(String(binding.mode));
        invalidated = { audio: priorAudio || null, video: dependsOnSpeech && Object.keys(video).length ? video : null, edit: true };
        if (invalidated.video) video.speechStatus = "stale";
      }
      line.audio = { path: audioPath, sha256: audioHash, revision: lineRevision, status: "not_reviewed", generation: args.generation };
      line.mediaStatus = "audio_ready";
    }
    const clock = actingContract().planScenePerformance(scene, measuredDuration);
    timing = {
      shotId: scene.id,
      storedSeconds: scene.duration,
      measuredSeconds: clock.durationSeconds,
      warnings: clock.warnings,
      nextAction: "retime",
      review: "not_reviewed"
    };
    changed = true;
  }
  if (args.action === "retime") {
    const scene = scenes.find((item) => item.id === args.shotId);
    if (!scene || args.lineId || args.speaker || args.query) throw new Error("Retime one complete shot by shotId");
    for (const line of scene.narration || []) {
      if (!currentAudio(line, character(line.speaker))) throw new Error("Attach current speech before retiming");
    }
    const contract2 = nodeModule3.createRequire(import.meta.url)("../../skills/_shared/performance-retiming.js");
    const result = contract2.retime(scene, args.timingPatch || {}, measuredDuration);
    scene.performance = result.scene.performance;
    scene.duration = result.scene.duration;
    const video = object(object(scene.visual).video);
    if (Object.keys(video).length) video.speechStatus = "stale";
    timing = {
      shotId: scene.id,
      previousSeconds: result.previousSeconds,
      durationSeconds: result.plan.durationSeconds,
      performance: result.plan.performance,
      warnings: result.plan.warnings,
      nextAction: "compose_and_prepare_video",
      review: "not_reviewed"
    };
    invalidated = { video, edit: true };
    changed = true;
  }
  if (args.action === "plan_video" || args.action === "attach_video") {
    const scene = scenes.find((item) => item.id === args.shotId);
    if (!args.shotId || !scene) throw new Error("Select one existing shot");
    if (selected.some(({ line }) => !line.id || !line.speaker || !line.delivery)) throw new Error("Prepare explicit speech before planning video");
    if (args.lineId || args.speaker || args.query) throw new Error("Video planning uses all lines in the shot; remove line filters");
    for (const { line } of selected) actingSchema.nullable().optional().parse(line.acting);
    const episode = dirname3(dirname3(file));
    if (existsSync4(join4(episode, ".work/model-settings.json"))) {
      const { selection } = routingContext(episode, args.shotId);
      const verified = speechVideoCapabilities(selection.engine, selection.model || selection.engine);
      if (args.capabilities && (args.capabilities.provider !== verified.provider || args.capabilities.model !== verified.model || args.capabilities.audioConditioning !== verified.audioConditioning || args.capabilities.lipSync !== verified.lipSync || args.capabilities.postLipSync !== verified.postLipSync))
        throw new Error("Caller capabilities disagree with selected adapter registry");
      args = { ...args, capabilities: verified };
    }
    plan = speechVideoPlan({ ...scene, narration: selected.map(({ line }) => ({ ...line, audio: currentAudio(line, character(line.speaker)) ? line.audio : void 0 })) }, args.capabilities);
    const continuityContract = nodeModule3.createRequire(import.meta.url)("../../skills/storyboard/references/shot-continuity.js");
    plan = { ...plan, continuity: continuityContract.plan(win, scenes.indexOf(scene), dirname3(file)) };
    if (args.action === "attach_video") {
      if (!args.videoPath) throw new Error("videoPath is required");
      const videoPath = resolve4(dirname3(file), args.videoPath);
      const bytes = readFileSync4(videoPath);
      if (!bytes.length) throw new Error("Video file is empty");
      const audio = selected.map(({ line }) => {
        if (!line.audio || line.audio.revision !== speechRevision(line, character(line.speaker)) || hash(readFileSync4(line.audio.path)) !== line.audio.sha256) throw new Error("Generate and attach current speech before binding video");
        const errors = voiceContract().generationVoiceErrors(character(line.speaker)?.tts, line.audio.generation, line);
        if (line.audio.generation.text !== line.tts || errors.length) throw new Error("Speech generation evidence changed: " + errors.join("; "));
        return { lineId: line.id, sha256: line.audio.sha256, revision: line.audio.revision };
      });
      const visual = object(scene.visual);
      const video = object(visual.video);
      if (video.engine && video.engine !== plan.provider || video.model && video.model !== plan.model) throw new Error("Adapter does not match the selected shot model");
      const priorBinding = object(video.speechBinding);
      const videoSha256 = hash(bytes);
      const performanceChanged = priorBinding.performanceRevision && priorBinding.performanceRevision !== plan.performanceRevision;
      const audioChanged = Array.isArray(priorBinding.audio) && JSON.stringify(priorBinding.audio) !== JSON.stringify(audio);
      const retiming = nodeModule3.createRequire(import.meta.url)("../../skills/_shared/performance-retiming.js");
      const tailTrim = args.reuse === "tail_trim" && priorBinding.videoSha256 === videoSha256 && !audioChanged && Array.isArray(priorBinding.audio) && retiming.prefixCompatible(priorBinding, plan);
      if (args.reuse && !tailTrim) throw new Error("Tail trim requires identical bound audio, unchanged speech/action starts and semantics, and a shorter end. Regenerate changed speech or staging.");
      let quality = { review: "not_reviewed", camera: "not_reviewed", lipSync: "not_reviewed" };
      try {
        const receipt = JSON.parse(readFileSync4(videoPath + ".astra-job.json", "utf8"));
        if (receipt.sha256 === videoSha256) quality = { ...quality, speechSync: receipt.speechSync || null, selection: receipt.selection || null };
        else if (!receipt.sha256 && receipt.videoPath === videoPath)
          quality = { ...quality, unverifiedSpeechSync: receipt.speechSync || null, receiptBinding: "unverified" };
      } catch {
      }
      if (priorBinding.videoSha256 === videoSha256 && (performanceChanged || audioChanged) && !tailTrim) {
        plan.warnings.push("Unchanged video bytes retain their original performance and audio binding; the revised performance or speech has not been generated in this footage.");
        video.speechStatus = "stale";
        invalidated = { video, edit: true };
      } else {
        video.clip = args.videoPath;
        video.speechBinding = {
          ...plan,
          audio,
          videoPath,
          videoSha256,
          quality,
          ...tailTrim ? { reuse: {
            kind: "tail_trim",
            sourcePerformanceRevision: priorBinding.performanceRevision,
            sourceDurationSeconds: priorBinding.durationSeconds,
            selectedDurationSeconds: plan.durationSeconds,
            review: "not_reviewed"
          } } : {}
        };
        video.speechStatus = "current";
      }
      visual.video = video;
      scene.visual = visual;
      changed = true;
    }
  }
  if (args.action === "plan_audio" && (!selected.length || selected.some(({ line }) => !line.id || !line.speaker || !line.delivery))) throw new Error("Prepare explicit speech before planning audio");
  if (changed) {
    const ids = /* @__PURE__ */ new Set();
    for (const { line } of all) {
      if (!line.id || ids.has(line.id)) throw new Error("Dialogue ids must be present and unique");
      ids.add(line.id);
      if (!character(line.speaker)?.tts) throw new Error(`Missing pinned voice for ${line.speaker}`);
    }
    const work = resolve4(dirname3(file), "../.work/speech-history");
    mkdirSync3(work, { recursive: true });
    const backup = join4(work, revision + ".js");
    if (!existsSync4(backup)) writeFileSync4(backup, before);
    const nextSource = serializeBoard(win, header);
    if (hash(readFileSync4(file)) !== revision) throw new Error("Storyboard changed during speech edit");
    const tmp = file + "." + randomUUID() + ".tmp";
    writeFileSync4(tmp, nextSource);
    renameSync3(tmp, file);
  }
  return { revision: hash(readFileSync4(file)), changed, invalidated, plan, timing, ...args.action === "plan_audio" ? { audioPlans: selected.map(({ scene, line }) => ({ shotId: scene.id, lineId: line.id, ...speechAudioPlan(line, character(line.speaker)) })) } : {}, lines: selected.map(({ scene, index, line }) => ({ shot: index + 1, shotId: scene.id, ...line, characterName: character(line.speaker)?.name, voice: character(line.speaker)?.tts, generationPlan: inspectionAudioPlan(line, character(line.speaker)), audioProvenanceStatus: audioProvenanceStatus(line, character(line.speaker)), speechRevision: speechRevision(line, character(line.speaker)), audioCurrent: currentAudio(line, character(line.speaker)) })) };
}

// src/video-sound.ts
var effectSchema = external_exports.object({
  id: external_exports.string().min(1).optional(),
  description: external_exports.string().min(1).optional(),
  trigger: external_exports.string().min(1).optional(),
  delivery: external_exports.enum(["auto", "native", "input", "post"]).optional(),
  sfx: external_exports.string().min(1).optional(),
  atSeconds: external_exports.number().finite().nonnegative().optional(),
  separationLu: external_exports.number().finite().min(0).max(30).optional(),
  intensity: external_exports.enum(["subtle", "normal", "strong"]).optional()
}).strict();
var schemas = {
  veo_text2video: text2VideoSchema,
  veo_img2video: img2VideoSchema,
  veo_reference: referenceVideoSchema,
  veo_extension: videoExtensionSchema,
  seedance_text2video: seedanceText2VideoSchema,
  seedance_img2video: seedanceImg2VideoSchema,
  seedance_reference: seedanceReferenceSchema,
  astra_genai_text2video: genaiTextToVideoSchema,
  astra_genai_img2video: genaiImageToVideoSchema,
  astra_genai_msr: genaiMsrSchema,
  astra_text2video: astraText2VideoSchema,
  astra_img2video: astraImg2VideoSchema,
  astra_audio2video: astraAudio2VideoSchema,
  astra_keyframe_video: astraKeyframeVideoSchema,
  omni_text2video: omniText2VideoSchema,
  omni_img2video: omniImg2VideoSchema,
  omni_extend: omniExtendSchema,
  omni_edit: omniEditSchema
};
function prepareVideoSound(tool, input, sound = {}) {
  const schema = schemas[tool];
  if (!schema) throw new Error("Unsupported sound adapter: " + tool);
  external_exports.string().min(1).parse(input.prompt);
  const effects = external_exports.array(effectSchema).parse(sound.effects ?? []);
  const ids = effects.flatMap((effect) => effect.id ? [effect.id] : []);
  if (new Set(ids).size !== ids.length) throw new Error("Effect ids must be unique within the shot");
  if (sound.audioSource !== void 0 && !["video", "speech"].includes(String(sound.audioSource)))
    throw new Error("sound.audioSource must be video or speech");
  const fixedInput = tool === "astra_audio2video";
  let nativeAudio = !fixedInput && tool !== "astra_genai_msr";
  if (tool.startsWith("seedance_")) {
    const model = input.model ?? (tool === "seedance_reference" ? DEFAULT_SEEDANCE_REFERENCE_MODEL : DEFAULT_SEEDANCE_MODEL);
    const spec = SEEDANCE_MODEL_SPECS[model];
    if (!spec) throw new Error("Unknown Seedance model: " + String(model));
    nativeAudio = spec.audio;
  }
  const resolved = effects.map((effect) => {
    const requested = effect.delivery ?? (effect.sfx ? "post" : "auto");
    const delivery2 = requested === "auto" ? nativeAudio && input.generateAudio !== false && sound.audioSource !== "speech" ? "native" : "post" : requested;
    if (delivery2 === "native" && (!nativeAudio || input.generateAudio === false))
      throw new Error("Native SFX unavailable in this mode or explicitly disabled; use post");
    if (delivery2 === "input" && !fixedInput)
      throw new Error("Input SFX require ASTRA audio2video; reference audio is not a preserved soundtrack");
    if (delivery2 !== "post" && sound.audioSource === "speech")
      throw new Error("Native/input SFX require audioSource=video; replacing it with speech discards the effects");
    if (delivery2 !== "post" && (!effect.description || !effect.trigger))
      throw new Error("Native/input effects need description and trigger");
    return { ...effect, delivery: delivery2 };
  });
  const native = resolved.filter((effect) => effect.delivery === "native");
  const conditioned = resolved.filter((effect) => effect.delivery === "input");
  if (sound.audioSource === "video" && (input.generateAudio === false || !nativeAudio && !fixedInput))
    throw new Error("audioSource=video conflicts with a silent output; select speech/post or enable supported audio");
  if (native.length && /Audio:\s*silent\b/i.test(String(input.prompt)))
    throw new Error("Native SFX conflict with Audio: silent in the prompt; revise the authored sound direction");
  if (sound.sfx && resolved.some((effect) => effect.delivery !== "post" && effect.sfx === sound.sfx))
    throw new Error("The same effect cannot belong to the native/input soundtrack and the legacy post cue");
  const args = { ...input };
  if ((native.length || conditioned.length || sound.audioSource === "video") && (tool.startsWith("seedance_") || tool.startsWith("astra_"))) {
    if (input.generateAudio === false) throw new Error("Cannot discard the requested input soundtrack");
    args.generateAudio = true;
  }
  const clauses = native.map((effect) => `${effect.trigger}: ${effect.description}.`);
  const nativePrompt = `Audio: ${clauses.join(" ")} Only diegetic scene sounds.`;
  if (clauses.length && !String(input.prompt).includes(nativePrompt)) args.prompt = `${input.prompt}
${nativePrompt}`;
  const inputPrompt = `The supplied non-speech sounds come from these actions, not mouths: ${conditioned.map((effect) => `${effect.trigger}: ${effect.description}`).join("; ")}.`;
  if (conditioned.length && !String(args.prompt).includes(inputPrompt)) args.prompt = `${args.prompt}
${inputPrompt}`;
  const parsed = schema.parse(args);
  const unknown = Object.keys(args).filter((key) => !(key in parsed));
  if (unknown.length) throw new Error("Unsupported adapter arguments: " + unknown.join(", "));
  const audioSource = native.length || conditioned.length ? "video" : sound.audioSource;
  const warnings = [];
  if (conditioned.length) warnings.push("Input effects must already be mixed into audioPath. This planner does not synthesize or mix them; inspect their action and mouth alignment.");
  if (resolved.some((effect) => effect.delivery === "post" && (!effect.sfx || effect.atSeconds === void 0)))
    warnings.push("Post effects need an asset and an observed shot-relative atSeconds before assembly.");
  if (native.length) warnings.push("Native audio is a mixed soundtrack. Do not overlay a second dialogue track; inspect missing or unwanted effects before acceptance.");
  return {
    tool,
    arguments: parsed,
    sound: { ...sound, ...audioSource ? { audioSource } : {}, effects: resolved },
    capabilities: { nativeAudio, inputAudio: fixedInput ? "preserved" : tool === "seedance_reference" ? "reference" : "none" },
    warnings,
    review: "not_reviewed",
    generated: false
  };
}
export {
  astraAudio2VideoSchema,
  astraImg2VideoSchema,
  astraKeyframeVideoSchema,
  generateFromAudio,
  generateFromImage,
  generateFromKeyframes,
  manageSpeech,
  prepareVideoSound,
  priceOf,
  readBoard,
  resolveVideoDuration,
  serializeBoard
};
