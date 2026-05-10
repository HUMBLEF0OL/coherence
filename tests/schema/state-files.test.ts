/**
 * Schema round-trip validation: valid fixtures pass, corrupt fixtures fail.
 */
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line import/no-named-as-default
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const ajv = addFormats(new Ajv({ allErrors: true })) as Ajv;

const SCHEMA_DIR = path.resolve('src/state/schemas');
const VALID_DIR = path.resolve('tests/fixtures/state/valid');
const CORRUPT_DIR = path.resolve('tests/fixtures/state/corrupt');

function loadSchema(name: string): object {
  return JSON.parse(readFileSync(path.join(SCHEMA_DIR, name), 'utf8')) as object;
}

describe('config.json schema', () => {
  const schema = loadSchema('config.schema.json');

  it('accepts valid config', () => {
    const data = JSON.parse(readFileSync(path.join(VALID_DIR, 'config.json'), 'utf8'));
    const valid = ajv.validate(schema, data);
    expect(valid).toBe(true);
  });

  it('rejects invalid mode', () => {
    const data = JSON.parse(readFileSync(path.join(CORRUPT_DIR, 'config.json'), 'utf8'));
    const valid = ajv.validate(schema, data);
    expect(valid).toBe(false);
  });
});

describe('version.json schema', () => {
  const schema = loadSchema('version.schema.json');

  it('accepts valid version', () => {
    const data = JSON.parse(readFileSync(path.join(VALID_DIR, 'version.json'), 'utf8'));
    const valid = ajv.validate(schema, data);
    expect(valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const valid = ajv.validate(schema, { schema_version: 1 });
    expect(valid).toBe(false);
  });
});
