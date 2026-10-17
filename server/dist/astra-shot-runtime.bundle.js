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
  const { data, path: path4, errorMaps, issueData } = params;
  const fullPath = [...path4, ...issueData.path || []];
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
  constructor(parent, value, path4, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path4;
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
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
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
    render: external_exports.object({ mode: tuple(V.RENDER_MODES), purpose: external_exports.string().optional(), reason: external_exports.string().optional() }).passthrough().optional()
  }).passthrough().optional(),
  sound: external_exports.record(external_exports.unknown()).optional()
}).passthrough();
var readLevelSchema = external_exports.enum(["outline", "scenes", "shots", "full"]);
var storyboardReadSchema = external_exports.object({
  path: external_exports.string().min(1).describe("The storyboard directory, or its scenes.js"),
  level: readLevelSchema.default("shots").describe("outline = sequences with scene numbers \xB7 scenes = scene cards with shot numbers \xB7 shots = every shot summarised under its scene \xB7 full = the raw shot objects too"),
  shotId: external_exports.string().min(1).optional().describe("Stable shot ID to inspect, with its raw plan and neighboring shot IDs"),
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

// src/speech.ts
import { createHash as createHash2, randomUUID } from "node:crypto";
import { readFileSync as readFileSync3, writeFileSync as writeFileSync2, renameSync as renameSync2, mkdirSync as mkdirSync2, existsSync as existsSync3 } from "node:fs";
import { dirname as dirname3, resolve as resolve3, join as join4 } from "node:path";
import * as nodeModule3 from "node:module";
import { execFileSync } from "node:child_process";

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
  const shared = nodeModule2.createRequire(import.meta.url)("../../skills/_shared/speech-contract.js");
  return shared.compileActing(text, actingSchema.parse(acting || {}), voice);
}

// package.json
var package_default = {
  name: "@zeans/social-flow-mcp-server",
  version: "0.115.2-continuity.2",
  license: "Apache-2.0",
  description: "Built-in MCP server for the social-flow plugin \u2014 direct SNS publishing (Threads\xB7Instagram\xB7Facebook\xB7YouTube) + research search (5 SerpApi tools\xB7SNS issue scout\xB78 Naver Open API types) + image\xB7video\xB7voice\xB7music generation (OpenAI GPT Image\xB7Veo 3.1\xB7Seedance\xB7Gemini TTS\xB7ElevenLabs\xB7Lyria\xB7Suno) + optional on-device MLX Core / mlx-serve (mlx_*)",
  type: "module",
  main: "dist/index.js",
  engines: {
    node: ">=20"
  },
  scripts: {
    build: "tsc && npm run bundle && npm run bundle:shot && npm run bundle:mesh",
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

// src/media-utils.ts
import * as path from "node:path";
var ALLOWED_EXTENSIONS = {
  image: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"],
  video: [".mp4", ".webm", ".mov", ".avi"],
  audio: [".wav", ".mp3", ".ogg", ".webm", ".aac", ".flac"],
  json: [".json"],
  mesh: [".glb"]
};
function bareFilenameSchema(kind) {
  const allowed = ALLOWED_EXTENSIONS[kind];
  return external_exports.string().min(1).refine((name) => !/[/\\]/.test(name) && !name.includes(".."), {
    message: "filename must be a bare file name without path separators (use outputPath for the directory)"
  }).refine((name) => allowed.includes(path.extname(name).toLowerCase()), {
    message: `filename extension must be one of: ${allowed.join(", ")}`
  });
}

// src/astra-video-client.ts
var ASTRA_VIDEO_TIERS = {
  /** `generate` — the default pipeline. The only tier that takes `lora`. */
  default: "generate",
  /** `guided` — slower, takes a negative prompt and a step count. */
  guided: "guided",
  /** `guided_fast` — 768x512 draft tier, faster than guided but not the default pipeline. */
  fast: "guided_fast"
};
var VALID_ASTRA_VIDEO_TIERS = Object.keys(ASTRA_VIDEO_TIERS);
var ASTRA_VIDEO_LORAS = ["cinemagraph", "slow-motion"];
var ASTRA_VIDEO_MAX_LORAS = 2;
var ASTRA_VIDEO_MIN_FRAMES = 25;
var ASTRA_VIDEO_FRAME_LIMITS = {
  generate: 193,
  guided: 121,
  guided_fast: 121,
  // Conservative guided-family ceiling; not generation-tested.
  keyframe: 193,
  // Server-enforced ceiling.
  audio2video: 193
  // Server-enforced ceiling.
};
var ASTRA_VIDEO_FRAME_STEP = 8;
var ASTRA_VIDEO_MAX_AUTO_FRAMES = 121;
var ASTRA_VIDEO_DIMENSION_STEP = 64;
var ASTRA_VIDEO_FAST_DIMENSION_STEP = 32;
var ASTRA_VIDEO_FAST_MIN_DIMENSION = 32;
var ASTRA_VIDEO_FAST_MAX_DIMENSION = 1920;
var ASTRA_VIDEO_MAX_PIXELS = 2064384;
var ASTRA_VIDEO_MAX_SEED = 2147483647;
var ASTRA_VIDEO_MAX_PROMPT_CHARS = 2e3;
var ASTRA_VIDEO_UPLOAD_LIMITS = {
  image: 32 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 32 * 1024 * 1024
};
var ASTRA_VIDEO_MAX_JOB_BODY_BYTES = 1024 * 1024;
var ASTRA_VIDEO_USER_AGENT = `social-flow/${package_default.version}`;
var astraVideoListUploadsSchema = external_exports.object({}).strict();
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
var seedSchema = external_exports.number().int().min(0).max(ASTRA_VIDEO_MAX_SEED).optional();
var frameRateSchema = external_exports.number().min(1).max(60).optional();
var negativePromptSchema = external_exports.string().max(ASTRA_VIDEO_MAX_PROMPT_CHARS).optional();
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
var loraSchema = external_exports.array(external_exports.enum(ASTRA_VIDEO_LORAS)).max(ASTRA_VIDEO_MAX_LORAS).refine((values) => new Set(values).size === values.length, { message: "lora values must be unique" }).optional();
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
    if (fast && (value < ASTRA_VIDEO_FAST_MIN_DIMENSION || value > ASTRA_VIDEO_FAST_MAX_DIMENSION)) {
      return `${name} must be between ${ASTRA_VIDEO_FAST_MIN_DIMENSION} and ${ASTRA_VIDEO_FAST_MAX_DIMENSION} for mode guided_fast (got ${value})`;
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
  tier: external_exports.enum(["default", "guided", "fast"]).optional().default("default"),
  numFrames: numFramesSchema("generate"),
  autoDuration: autoDurationSchema,
  width: widthSchema,
  height: heightSchema,
  frameRate: frameRateSchema,
  seed: seedSchema,
  lora: loraSchema,
  negativePrompt: negativePromptSchema,
  numInferenceSteps: numInferenceStepsSchema,
  numGeneratedKeyframes: numGeneratedKeyframesSchema,
  ...outputFields
}).superRefine((data, ctx) => {
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
    for (const key of ["negativePrompt", "numInferenceSteps"]) {
      if (data[key] !== void 0) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: [key],
          message: `${key} is accepted only on tier "guided" or "fast"; mode generate has no such field.`
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
});
var astraImg2VideoSchema = external_exports.object({
  prompt: promptSchema,
  tier: external_exports.enum(["default", "guided"]).optional().default("default"),
  firstFramePath: external_exports.string().min(1, "firstFramePath is required"),
  lastFramePath: external_exports.string().optional(),
  strength: external_exports.number().min(0).max(1).optional(),
  numFrames: numFramesSchema("generate"),
  autoDuration: autoDurationSchema,
  width: widthSchema,
  height: heightSchema,
  frameRate: frameRateSchema,
  seed: seedSchema,
  lora: loraSchema,
  negativePrompt: negativePromptSchema,
  numInferenceSteps: numInferenceStepsSchema,
  numGeneratedKeyframes: numGeneratedKeyframesSchema,
  ...outputFields
}).superRefine((data, ctx) => {
  const mode = ASTRA_VIDEO_TIERS[data.tier];
  if (data.numFrames !== void 0 && data.numFrames > ASTRA_VIDEO_FRAME_LIMITS[mode]) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["numFrames"], message: `numFrames must be at most ${ASTRA_VIDEO_FRAME_LIMITS[mode]} for mode ${mode}` });
  }
  if (mode === "generate") {
    for (const key of ["negativePrompt", "numInferenceSteps"]) {
      if (data[key] !== void 0) {
        ctx.addIssue({
          code: external_exports.ZodIssueCode.custom,
          path: [key],
          message: `${key} is accepted only on tier "guided"; mode generate has no such field.`
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
  if (mode === "guided") {
    if ((data.width ?? 1536) !== 1536 || (data.height ?? 1024) !== 1024) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["width"], message: "guided images require 1536x1024" });
    }
    if (data.lora?.length) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["lora"], message: 'lora is accepted only on tier "default"' });
    }
  }
  const dimensionError = checkDimensions(data.width, data.height, mode);
  if (dimensionError) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["width"], message: dimensionError });
  }
});
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
  negativePrompt: negativePromptSchema,
  numInferenceSteps: numInferenceStepsSchema,
  ...outputFields
}).superRefine((data, ctx) => {
  const dimensionError = checkDimensions(data.width, data.height, "keyframe");
  if (dimensionError) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["width"], message: dimensionError });
  }
  data.images.forEach((image, index) => {
    const frameError = checkFrameIdx(image.frameIdx, data.numFrames);
    if (frameError) {
      ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["images", index, "frameIdx"], message: frameError });
    }
  });
});
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
  negativePrompt: negativePromptSchema,
  numInferenceSteps: numInferenceStepsSchema,
  expectLipSync: external_exports.boolean().default(false),
  maxAttempts: external_exports.number().int().min(1).max(3).default(2),
  ...outputFields
}).superRefine((data, ctx) => {
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
});
var astraVideoRetakeSchema = external_exports.object({
  prompt: promptSchema,
  sourceVideoPath: external_exports.string().min(1, "sourceVideoPath is required"),
  startTime: external_exports.number().min(0),
  endTime: external_exports.number().positive(),
  seed: seedSchema,
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

// src/speech.ts
var voiceContract = () => nodeModule3.createRequire(import.meta.url)("../../skills/_shared/character-voice.js");
var actingContract = () => nodeModule3.createRequire(import.meta.url)("../../skills/_shared/scene-acting.js");
var delivery = external_exports.enum(["voiceover", "on_screen", "off_screen"]);
var speechManageSchema = external_exports.object({
  path: external_exports.string().min(1),
  action: external_exports.enum(["prepare", "list", "update", "attach_audio", "plan_audio", "plan_video", "attach_video"]),
  shotId: external_exports.string().optional(),
  lineId: external_exports.string().optional(),
  speaker: external_exports.string().optional(),
  query: external_exports.string().optional(),
  expectedRevision: external_exports.string().optional(),
  patch: external_exports.object({ tts: external_exports.string().min(1).optional(), sub: external_exports.string().optional(), speaker: external_exports.string().min(1).optional(), delivery: delivery.optional(), acting: actingSchema.nullable().optional() }).strict().optional(),
  audioPath: external_exports.string().optional(),
  videoPath: external_exports.string().optional(),
  generation: external_exports.object({ generator: external_exports.string().min(1), voiceSettings: external_exports.record(external_exports.unknown()), text: external_exports.string().min(1), language: external_exports.string().min(1).optional() }).strict().optional(),
  capabilities: external_exports.object({ provider: external_exports.string().min(1), model: external_exports.string().min(1), audioConditioning: external_exports.boolean(), lipSync: external_exports.boolean(), postLipSync: external_exports.boolean(), evidence: external_exports.string().min(1) }).strict().optional()
}).strict();
var hash = (s) => createHash2("sha256").update(s).digest("hex");
var object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
function speechRevision(line, character) {
  return hash(JSON.stringify(actingContract().speechRevisionPayload(line, character?.tts)));
}
function currentAudio(line, character) {
  try {
    return !!line.audio && line.audio.revision === speechRevision(line, character) && line.audio.generation?.text === line.tts && voiceContract().generationVoiceErrors(character?.tts, line.audio.generation, line).length === 0 && existsSync3(line.audio.path) && hash(readFileSync3(line.audio.path)) === line.audio.sha256;
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
  return { ...compiled, arguments: compiled.generation, expectedText: line.tts, speechRevision: speechRevision(line, character), language, direction, review: "not_reviewed" };
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
    if (historical && line.audio.revision === speechRevision(line, character) && line.audio.generation?.text === line.tts && hash(readFileSync3(line.audio.path)) === line.audio.sha256) return "preserved_historical_recording_unverified";
  } catch {
  }
  return "stale_or_missing";
}
function measuredDuration(line) {
  if (!line.audio || !existsSync3(line.audio.path)) return null;
  try {
    const value = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", line.audio.path], { encoding: "utf8", timeout: 1e4, stdio: ["ignore", "pipe", "ignore"] }).trim());
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
  return { ...timeline, warnings, promptLength, performanceRevision: hash(JSON.stringify(actingContract().scenePerformancePayload(scene))), videoPrompt, textPolicy: "no_visible_text", boundary: "one_shot_per_generation", instructions: "Generate only this shot. Preserve the ordered actions, addressees and reactions, including silent events. Concurrent actions share their speech interval. Match the source frame to the opening state; do not concatenate other shots sharing a reference image. " + actingContract().VIDEO_TEXT_POLICY, mode, provider: capabilities.provider, model: capabilities.model, capabilities, audioFirst: onScreen, lineIds: lines.map((line) => line.id), review: "not_reviewed" };
}
function manageSpeech(args) {
  args = speechManageSchema.parse(args);
  const { file, win, header } = readBoard(args.path);
  const before = readFileSync3(file, "utf8");
  const revision = hash(before);
  const mutates = ["prepare", "update", "attach_audio", "attach_video"].includes(args.action);
  if (mutates && args.expectedRevision !== revision) throw new Error("Read speech first and supply its current expectedRevision; the storyboard may have changed");
  const doc = object(win.SB_DOC);
  const rawCharacters = doc.characters;
  const characters = Array.isArray(rawCharacters) ? rawCharacters : Object.entries(object(rawCharacters)).map(([id, c]) => ({ ...object(c), id }));
  const character = (id) => characters.find((c) => c.id === id);
  const scenes = win.SCENES;
  let changed = false;
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
      const audioPath = resolve3(dirname3(file), args.audioPath);
      if (!args.generation || args.generation.text !== line.tts) throw new Error("Attach the actual generation arguments and exact line text");
      const voice = character(line.speaker)?.tts;
      const voiceErrors = voiceContract().generationVoiceErrors(voice, args.generation, line);
      if (voiceErrors.length) throw new Error("Generation arguments do not match the pinned character voice: " + voiceErrors.join("; "));
      const bytes = readFileSync3(audioPath);
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
    changed = true;
  }
  if (args.action === "plan_video" || args.action === "attach_video") {
    const scene = scenes.find((item) => item.id === args.shotId);
    if (!args.shotId || !scene) throw new Error("Select one existing shot");
    if (selected.some(({ line }) => !line.id || !line.speaker || !line.delivery)) throw new Error("Prepare explicit speech before planning video");
    if (args.lineId || args.speaker || args.query) throw new Error("Video planning uses all lines in the shot; remove line filters");
    for (const { line } of selected) actingSchema.nullable().optional().parse(line.acting);
    plan = speechVideoPlan({ ...scene, narration: selected.map(({ line }) => ({ ...line, audio: currentAudio(line, character(line.speaker)) ? line.audio : void 0 })) }, args.capabilities);
    const continuityContract = nodeModule3.createRequire(import.meta.url)("../../skills/storyboard/references/shot-continuity.js");
    plan = { ...plan, continuity: continuityContract.plan(win, scenes.indexOf(scene), dirname3(file)) };
    if (args.action === "attach_video") {
      if (!args.videoPath) throw new Error("videoPath is required");
      const videoPath = resolve3(dirname3(file), args.videoPath);
      const bytes = readFileSync3(videoPath);
      if (!bytes.length) throw new Error("Video file is empty");
      const audio = selected.map(({ line }) => {
        if (!line.audio || line.audio.revision !== speechRevision(line, character(line.speaker)) || hash(readFileSync3(line.audio.path)) !== line.audio.sha256) throw new Error("Generate and attach current speech before binding video");
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
      if (priorBinding.videoSha256 === videoSha256 && (performanceChanged || audioChanged)) {
        plan.warnings.push("Unchanged video bytes retain their original performance and audio binding; the revised performance or speech has not been generated in this footage.");
        video.speechStatus = "stale";
        invalidated = { video, edit: true };
      } else {
        video.clip = args.videoPath;
        video.speechBinding = { ...plan, audio, videoPath, videoSha256 };
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
    const work = resolve3(dirname3(file), "../.work/speech-history");
    mkdirSync2(work, { recursive: true });
    const backup = join4(work, revision + ".js");
    if (!existsSync3(backup)) writeFileSync2(backup, before);
    const nextSource = serializeBoard(win, header);
    if (hash(readFileSync3(file)) !== revision) throw new Error("Storyboard changed during speech edit");
    const tmp = file + "." + randomUUID() + ".tmp";
    writeFileSync2(tmp, nextSource);
    renameSync2(tmp, file);
  }
  return { revision: hash(readFileSync3(file)), changed, invalidated, plan, ...args.action === "plan_audio" ? { audioPlans: selected.map(({ scene, line }) => ({ shotId: scene.id, lineId: line.id, ...speechAudioPlan(line, character(line.speaker)) })) } : {}, lines: selected.map(({ scene, index, line }) => ({ shot: index + 1, shotId: scene.id, ...line, characterName: character(line.speaker)?.name, voice: character(line.speaker)?.tts, generationPlan: inspectionAudioPlan(line, character(line.speaker)), audioProvenanceStatus: audioProvenanceStatus(line, character(line.speaker)), speechRevision: speechRevision(line, character(line.speaker)), audioCurrent: currentAudio(line, character(line.speaker)) })) };
}

// src/video-duration.ts
var import_video_duration = __toESM(require_video_duration(), 1);

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
var MAX_MLX_IMAGE_REFS = 3;
var imageDimension = external_exports.number().int().min(MIN_MLX_IMAGE_DIMENSION).max(MAX_MLX_IMAGE_DIMENSION).refine((v) => v % MLX_IMAGE_DIMENSION_STEP === 0, {
  message: `width/height must be a multiple of ${MLX_IMAGE_DIMENSION_STEP} (for 9:16 that's 1088\xD71920, not 1080\xD71920). FLUX.2-klein is fixed at 1024\xD71024 \u2014 pick a Krea/Mage-Flow model for other sizes.`
});
var videoDimension = external_exports.number().int().min(MIN_MLX_VIDEO_DIMENSION).max(MAX_MLX_VIDEO_DIMENSION).refine((v) => v % MLX_VIDEO_DIMENSION_STEP_ONE_STAGE === 0, {
  message: `width/height must be a multiple of ${MLX_VIDEO_DIMENSION_STEP_ONE_STAGE} (LTX grid), and of ${MLX_VIDEO_DIMENSION_STEP} unless you pass pipeline:"one_stage". 1080 is on neither grid \u2014 use 1088\xD71920 or the default 768\xD71280.`
});
var mlxImageGenerateSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required").max(32e3),
  model: external_exports.string().min(1).optional(),
  width: imageDimension.optional().default(DEFAULT_MLX_IMAGE_SIZE),
  height: imageDimension.optional().default(DEFAULT_MLX_IMAGE_SIZE),
  steps: external_exports.number().int().min(1).max(50).optional(),
  seed: external_exports.number().int().min(0).optional(),
  imagePath: external_exports.string().min(1).optional(),
  strength: external_exports.number().min(0).max(1).optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("image").optional()
});
var mlxImageEditSchema = external_exports.object({
  prompt: external_exports.string().min(1, "Prompt is required").max(32e3),
  imagePath: external_exports.string().min(1, "imagePath is required"),
  refImagePaths: external_exports.array(external_exports.string().min(1)).max(MAX_MLX_IMAGE_REFS).optional(),
  model: external_exports.string().min(1).optional(),
  width: imageDimension.optional(),
  height: imageDimension.optional(),
  steps: external_exports.number().int().min(1).max(50).optional(),
  seed: external_exports.number().int().min(0).optional(),
  outputPath: external_exports.string().optional(),
  filename: bareFilenameSchema("image").optional()
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
  for (const key of ["durationSeconds", "numFrames", "frames", "autoDuration", "audioMaxDuration"]) {
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
    const mode = tool === "astra_audio2video" ? "audio2video" : tool === "astra_keyframe_video" ? "keyframe" : input.tier === "guided" ? "guided" : input.tier === "fast" ? "guided_fast" : "generate";
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

// src/usage-ledger.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import path3 from "node:path";
var EPISODE_MARKER = path3.join("storyboard", "scenes.js");
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
    const out = execFileSync2("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
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
  if (tool === "music_generate_clip") return { key: "music.lyria-clip", quantity: 1 };
  if (tool === "music_generate" || tool === "music_generate_advanced") {
    return {
      key: "music.lyria-realtime",
      quantity: num(args.durationSeconds, 30),
      note: "unit price unconfirmed \u2014 the report excludes this item rather than counting it as 0"
    };
  }
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
export {
  astraAudio2VideoSchema,
  astraImg2VideoSchema,
  manageSpeech,
  priceOf,
  readBoard,
  resolveVideoDuration,
  serializeBoard
};
