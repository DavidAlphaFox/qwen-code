/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import AjvPkg, { type AnySchema, type Ajv } from 'ajv';
// Ajv2020 is the documented way to use draft-2020-12: https://ajv.js.org/json-schema.html#draft-2020-12
// eslint-disable-next-line import/no-internal-modules
import Ajv2020Pkg from 'ajv/dist/2020.js';
import * as addFormats from 'ajv-formats';
import { createDebugLogger } from './debugLogger.js';

// Ajv's ESM/CJS interop: use 'any' for compatibility as recommended by Ajv docs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvClass = (AjvPkg as any).default || AjvPkg;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv2020Class = (Ajv2020Pkg as any).default || Ajv2020Pkg;

const debugLogger = createDebugLogger('SchemaValidator');

const ajvOptions = {
  // See: https://ajv.js.org/options.html#strict-mode-options
  // strictSchema defaults to true and prevents use of JSON schemas that
  // include unrecognized keywords. The JSON schema spec specifically allows
  // for the use of non-standard keywords and the spec-compliant behavior
  // is to ignore those keywords. Note that setting this to false also
  // allows use of non-standard or custom formats (the unknown format value
  // will be logged but the schema will still be considered valid).
  strictSchema: false,
};

// Draft-07 validator (default)
const ajvDefault: Ajv = new AjvClass(ajvOptions);

// Draft-2020-12 validator for MCP servers using rmcp
const ajv2020: Ajv = new Ajv2020Class(ajvOptions);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormatsFunc = (addFormats as any).default || addFormats;
addFormatsFunc(ajvDefault);
addFormatsFunc(ajv2020);

// Canonical draft-2020-12 meta-schema URI (used by rmcp MCP servers)
const DRAFT_2020_12_SCHEMA = 'https://json-schema.org/draft/2020-12/schema';

/**
 * 根据模式的 $schema 字段返回适当的验证器
 * @param schema - JSON Schema 对象
 * @returns Ajv 验证器实例
 */
function getValidator(schema: AnySchema): Ajv {
  if (
    typeof schema === 'object' &&
    schema !== null &&
    '$schema' in schema &&
    schema.$schema === DRAFT_2020_12_SCHEMA
  ) {
    return ajv2020;
  }
  return ajvDefault;
}

/**
 * 简单的实用程序，用于根据 JSON Schema 验证对象
 * 支持 draft-07（默认）和 draft-2020-12 模式
 */
export class SchemaValidator {
  /**
   * 如果数据符合模式描述的 schema 则返回 null（或者如果 schema 为 null）
   * 否则返回描述错误的字符串
   * @param schema - JSON Schema 或 undefined
   * @param data - 要验证的数据
   * @returns 错误消息或 null
   */
  static validate(schema: unknown | undefined, data: unknown): string | null {
    if (!schema) {
      return null;
    }
    if (typeof data !== 'object' || data === null) {
      return 'Value of params must be an object';
    }

    const anySchema = schema as AnySchema;
    const validator = getValidator(anySchema);

    // Try to compile and validate; skip validation if schema can't be compiled.
    // This handles schemas using JSON Schema versions AJV doesn't support
    // (e.g., draft-2019-09, future versions).
    // This matches LenientJsonSchemaValidator behavior in mcp-client.ts.
    let validate;
    try {
      validate = validator.compile(anySchema);
    } catch (error) {
      // Schema compilation failed (unsupported version, invalid $ref, etc.)
      // Skip validation rather than blocking tool usage.
      debugLogger.warn(
        `Failed to compile schema (${
          (schema as Record<string, unknown>)?.['$schema'] ?? '<no $schema>'
        }): ${error instanceof Error ? error.message : String(error)}. ` +
          'Skipping parameter validation.',
      );
      return null;
    }

    let valid = validate(data);
    if (!valid && validate.errors) {
      // Coerce string boolean values ("true"/"false") to actual booleans
      fixBooleanValues(data as Record<string, unknown>);

      valid = validate(data);
      if (!valid && validate.errors) {
        return validator.errorsText(validate.errors, { dataVar: 'params' });
      }
    }
    return null;
  }
}

/**
 * 将字符串布尔值强制转换为实际布尔值
 * 这可以处理 LLM 返回 "true"/"false" 字符串而不是布尔值的情况
 * 这在自托管 LLM 中很常见
 *
 * 转换：
 * - "true", "True", "TRUE" -> true
 * - "false", "False", "FALSE" -> false
 * @param data - 要修复的数据对象
 */
function fixBooleanValues(data: Record<string, unknown>) {
  for (const key of Object.keys(data)) {
    if (!(key in data)) continue;
    const value = data[key];

    if (typeof value === 'object' && value !== null) {
      fixBooleanValues(value as Record<string, unknown>);
    } else if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true') {
        data[key] = true;
      } else if (lower === 'false') {
        data[key] = false;
      }
    }
  }
}
