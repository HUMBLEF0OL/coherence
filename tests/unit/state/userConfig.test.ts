/**
 * userConfig env-var bridge (C4).
 *
 * Claude Code surfaces install-time userConfig values as
 * `CLAUDE_PLUGIN_OPTION_<UPPERCASE_KEY>` env vars. The resolver reads them
 * with explicit type coercion + validation, falling through to built-in
 * defaults when unset.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveDefaultMode,
  resolveTelemetryOptIn,
} from '../../../src/state/userConfig.js';

describe('userConfig bridge', () => {
  const origMode = process.env['CLAUDE_PLUGIN_OPTION_DEFAULTMODE'];
  const origTel = process.env['CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN'];

  afterEach(() => {
    if (origMode === undefined) delete process.env['CLAUDE_PLUGIN_OPTION_DEFAULTMODE'];
    else process.env['CLAUDE_PLUGIN_OPTION_DEFAULTMODE'] = origMode;
    if (origTel === undefined) delete process.env['CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN'];
    else process.env['CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN'] = origTel;
  });

  it('returns env-var value when set', () => {
    process.env['CLAUDE_PLUGIN_OPTION_DEFAULTMODE'] = 'graduated';
    expect(resolveDefaultMode()).toBe('graduated');
  });

  it('returns observe as built-in default', () => {
    delete process.env['CLAUDE_PLUGIN_OPTION_DEFAULTMODE'];
    expect(resolveDefaultMode()).toBe('observe');
  });

  it('rejects invalid mode values', () => {
    process.env['CLAUDE_PLUGIN_OPTION_DEFAULTMODE'] = 'frobnicate';
    expect(() => resolveDefaultMode()).toThrow(/invalid mode/i);
  });

  it('parses truthy values for telemetryOptIn', () => {
    process.env['CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN'] = 'true';
    expect(resolveTelemetryOptIn()).toBe(true);
    process.env['CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN'] = '1';
    expect(resolveTelemetryOptIn()).toBe(true);
    process.env['CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN'] = 'false';
    expect(resolveTelemetryOptIn()).toBe(false);
  });

  it('returns false when telemetryOptIn is unset', () => {
    delete process.env['CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN'];
    expect(resolveTelemetryOptIn()).toBe(false);
  });
});
