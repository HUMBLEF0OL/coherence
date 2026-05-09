'use strict';

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-pattern': [
      2,
      'always',
      /^(\[coherence\]|feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .+/,
    ],
  },
  parserPreset: {
    parserOpts: {
      headerPattern:
        /^(\[coherence\]|feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: (.+)$/,
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
};
