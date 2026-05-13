#!/usr/bin/env node
/**
 * v1.0 M4 — populate the `## Verification` block in README.md from
 * `package.json#repository.url`. Idempotent: regenerates content between
 * the `<!-- BEGIN: coherence-verification -->` and
 * `<!-- END: coherence-verification -->` markers.
 *
 * Designed to be safe under `npm run build` so forks/clones keep the
 * verification command pointed at their own repository URL.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const pkgPath = path.join(rootDir, 'package.json');
const readmePath = path.join(rootDir, 'README.md');

if (!existsSync(pkgPath)) {
  console.error('[render-readme-verification] package.json not found');
  process.exit(1);
}
if (!existsSync(readmePath)) {
  console.error('[render-readme-verification] README.md not found');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const repoUrl = typeof pkg.repository === 'string'
  ? pkg.repository
  : pkg.repository?.url ?? '';

if (!repoUrl) {
  console.error('[render-readme-verification] no repository.url in package.json — skipping');
  process.exit(0);
}

// Derive owner/repo for cosign --certificate-identity-regexp
const match = repoUrl.replace(/\.git$/, '').match(/github\.com[/:]([^/]+)\/([^/]+)/);
if (!match) {
  console.error(`[render-readme-verification] cannot derive owner/repo from ${repoUrl}`);
  process.exit(0);
}
const owner = match[1];
const repo = match[2];
// npm tarball uses the package name from package.json#name, NOT the repo name.
const tgz = `${pkg.name}-${pkg.version}.tgz`;
const identityRe = `^https://github.com/${owner}/${repo}/\\.github/workflows/release\\.yml@refs/tags/v.*$`;

const block = `\
> Release artifacts are signed with [Sigstore \`cosign\`](https://docs.sigstore.dev/) keyless OIDC.
> Verify the published tarball with:
>
> \`\`\`bash
> cosign verify-blob ${tgz} \\
>   --signature ${tgz}.sig \\
>   --certificate ${tgz}.pem \\
>   --certificate-identity-regexp '${identityRe}' \\
>   --certificate-oidc-issuer https://token.actions.githubusercontent.com
> \`\`\`
>
> A successful verification prints \`Verified OK\`. The certificate's Rekor
> transparency-log entry is searchable at <https://search.sigstore.dev/>.
> Gate names asserted at release time: \`M-SIGN-1\`, \`M-SIGN-2\`, \`M-SIGN-3\`.
`;

const BEGIN = '<!-- BEGIN: coherence-verification -->';
const END = '<!-- END: coherence-verification -->';
const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);

let readme = readFileSync(readmePath, 'utf8');
const replacement = `${BEGIN}\n${block}${END}`;

if (re.test(readme)) {
  // Use a replacer FUNCTION rather than a string so `$` inside `block`
  // (e.g. the regex end-of-line anchor in --certificate-identity-regexp)
  // isn't interpreted as a backreference token like $&, $1, $`, $'.
  readme = readme.replace(re, () => replacement);
} else {
  // Append a fresh Verification section before the last newline
  readme = readme.replace(/\s*$/, '');
  readme += `\n\n## Verification\n\n${replacement}\n`;
}

writeFileSync(readmePath, readme, 'utf8');
console.log(`[render-readme-verification] wrote ${block.length}-char block (repo=${owner}/${repo}, version=${pkg.version}).`);
