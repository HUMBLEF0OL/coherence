/**
 * Velocity state machine tests. DD-011, DD-051
 */
import { describe, it, expect } from 'vitest';
import {
  initialVelocity,
  recordRevert,
  recordDefer,
  resetDefer,
} from '../../../src/buffer/velocity.js';

describe('velocity state machine', () => {
  it('initializes with zero counts', () => {
    const v = initialVelocity();
    expect(v.revert_count).toBe(0);
    expect(v.consecutive_defer_sessions).toBe(0);
    expect(v.auto_ignored).toHaveLength(0);
  });

  it('records first revert without auto-ignoring', () => {
    const v = initialVelocity();
    const { updated, shouldAutoIgnore } = recordRevert(v, '/docs/x.md#section');
    expect(updated.revert_count).toBe(1);
    expect(shouldAutoIgnore).toBe(false);
  });

  it('auto-ignores section on 2nd revert within 30 days (FR-BUFFER-5)', () => {
    let v = initialVelocity();
    ({ updated: v } = recordRevert(v, '/docs/x.md#section'));
    const { updated, shouldAutoIgnore } = recordRevert(v, '/docs/x.md#section');
    expect(shouldAutoIgnore).toBe(true);
    expect(updated.auto_ignored).toContain('/docs/x.md#section');
  });

  it('does not double-add to auto_ignored', () => {
    let v = initialVelocity();
    ({ updated: v } = recordRevert(v, '/docs/x.md#section'));
    ({ updated: v } = recordRevert(v, '/docs/x.md#section'));
    ({ updated: v } = recordRevert(v, '/docs/x.md#section'));
    expect(v.auto_ignored.filter((x) => x === '/docs/x.md#section')).toHaveLength(1);
  });

  it('increments consecutive defer sessions', () => {
    const v = initialVelocity();
    const v2 = recordDefer(v, 'session-1');
    const v3 = recordDefer(v2, 'session-2');
    expect(v3.consecutive_defer_sessions).toBe(2);
  });

  it('resets defer count on successful pipeline run', () => {
    let v = initialVelocity();
    v = recordDefer(v, 'session-1');
    v = recordDefer(v, 'session-2');
    v = resetDefer(v);
    expect(v.consecutive_defer_sessions).toBe(0);
  });
});
