#!/usr/bin/env node
import { runHook } from './_runHook.mjs';
await runHook('stop', 'stopHook');
