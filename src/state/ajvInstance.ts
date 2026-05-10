/**
 * Shared AJV instance. Using createRequire for CJS interop in ESM.
 * Avoids TypeScript constructor-type constraints on the require'd module.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
const AjvCtor = require('ajv');
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
const addFormatsFn = require('ajv-formats');

export interface AjvLike {
  addSchema(schema: object, id: string): void;
  getSchema(id: string): unknown;
  validate(schemaOrId: string | object, data: unknown): boolean;
  errorsText(errors?: unknown, opts?: unknown): string;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
const rawAjv: AjvLike = new AjvCtor({ allErrors: true });
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
addFormatsFn(rawAjv);

export const ajv: AjvLike = rawAjv;
