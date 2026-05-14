/**
 * v1.0 M4 — populate the `## Verification` block in README.md from
 * `package.json#repository.url`. Idempotent: regenerates content between
 * the `<!-- BEGIN: coherence-verification -->` and
 * `<!-- END: coherence-verification -->` markers.
 *
 * Designed to be safe under `npm run build` so forks/clones keep the
 * verification command pointed at their own repository URL.
 *
 * The pure render is exported as `renderVerification(readmeText, pkg)`
 * for direct unit testing. The CLI entry point (only fired when the
 * module is executed directly) handles disk I/O.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BEGIN = '<!-- BEGIN: coherence-verification -->';
const END = '<!-- END: coherence-verification -->';

/**
 * Build the verification block body (the lines between BEGIN/END markers).
 * Returns `null` when the repository URL is unparseable; the caller can
 * decide whether to skip.
 */
export function buildVerificationBlock(pkg) {
  const repoUrl = typeof pkg.repository === 'string'
    ? pkg.repository
    : pkg.repository?.url ?? '';
  if (!repoUrl) return null;

  const match = repoUrl.replace(/\.git$/, '').match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if (!match) return null;

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

  return { block, owner, repo, identityRe };
}

/**
 * Pure README transform: rewrite (or append) the verification block.
 * Returns `null` if there's no repository URL or it cannot be parsed —
 * the CLI maps that to a no-op exit-0.
 */
export function renderVerification(readmeText, pkg) {
  const built = buildVerificationBlock(pkg);
  if (!built) return null;

  const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
  const replacement = `${BEGIN}\n${built.block}${END}`;

  if (re.test(readmeText)) {
    // Use a replacer FUNCTION rather than a string so `$` inside `block`
    // (e.g. the regex end-of-line anchor in --certificate-identity-regexp)
    // isn't interpreted as a backreference token like $&, $1, $`, $'.
    return readmeText.replace(re, () => replacement);
  }
  // Append a fresh Verification section before the last newline.
  const trimmed = readmeText.replace(/\s*$/, '');
  return `${trimmed}\n\n## Verification\n\n${replacement}\n`;
}

// ---- CLI ------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  const __dirname = path.dirname(__filename);
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
  const readmeText = readFileSync(readmePath, 'utf8');
  const updated = renderVerification(readmeText, pkg);

  if (updated === null) {
    const built = buildVerificationBlock(pkg);
    if (!built) {
      console.error('[render-readme-verification] no parseable repository.url — skipping');
      process.exit(0);
    }
  } else {
    writeFileSync(readmePath, updated, 'utf8');
    const built = buildVerificationBlock(pkg);
    console.log(
      `[render-readme-verification] wrote ${built.block.length}-char block ` +
      `(repo=${built.owner}/${built.repo}, version=${pkg.version}).`,
    );
  }
}
