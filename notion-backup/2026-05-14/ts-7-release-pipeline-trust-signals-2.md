<!-- url: https://www.notion.so/35f010d46a7081668d14c784be3ddba8 -->
<!-- id: 35f010d4-6a70-8166-8d14-c784be3ddba8 -->
<!-- title: TS-7 — Release Pipeline & Trust Signals -->
TS-7 — RELEASE PIPELINE & TRUST SIGNALS. Maps to FR-SIGN-1..5, NFR-SECURITY-N2, DD-137, DD-145.
cosign keyless signing (FR-SIGN-1, DD-145): .github/workflows/release.yml adds sign step after npm pack. sigstore/cosign-installer@v3 installs cosign; runs cosign sign-blob --yes cohrence-1.0.0.tgz --output-signature .sig --output-certificate .pem. OIDC token from GitHub Actions (id-token: write). Fulcio cert + Rekor log automatic. .sig + .pem attached via gh release upload. Adds < 5 s.
Local release fail-closed (FR-SIGN-2, NFR-SECURITY-N2): release-ga.mjs checks process.env.GITHUB_ACTIONS === 'true'. If true: cosign sign-blob. If false AND --unsigned not passed: exit 1 with stderr msg requiring --unsigned. If false AND --unsigned: rename to cohrence-1.0.0-UNSIGNED.tgz with prominent warning.
SHA-256 manifest (FR-SIGN-3): release-artifacts/cohrence-<version>.sha256 generated post-pack. Committed to repo for provenance. v1.0 introduces release-artifacts/ subfolder. Release notes body includes SHA-256 line. .npmignore excludes release-artifacts/. M-LEGACY-1 extended: npm pack --dry-run asserts no release-artifacts/ paths.
SECURITY.md (FR-SIGN-4): project root standard. Required headings (M-SIGN-3 pass3): ## Reporting a Vulnerability (PGP email + GHSA path); ## Disclosure Policy (90-day); ## Supported Versions (v1.x.y; v0.x deprecated). Static-analysis greps headings.
README Verification section (FR-SIGN-5): ## Verification, ### Signature Verification (cosign verify-blob example), ### Static-Analysis Gates (M-ARCH-1, M-PRIVACY-1, M-LEGACY-1, M-TRIPLEX-1 with file paths).
cosign verify example: cosign verify-blob cohrence-1.0.0.tgz --signature .sig --certificate .pem --certificate-identity-regexp '^https://github\.com/HUMBLEF0OL/coherence/' --certificate-oidc-issuer https://token.actions.githubusercontent.com.
Rekor: rekor-cli search --sha cohrence-1.0.0.tgz.
Release pipeline order: build → assertVersionSync → validate-plugin → gates → calibrate → test → npm pack → sha256 → sign (CI-only or --unsigned) → git tag → gh release create with .sig + .pem + .sha256.
Audit#3 (Critical): cosign verify-blob README example must work for forks. Amended: scripts/render-readme-verification.mjs reads package.json#repository.url → produces --certificate-identity-regexp dynamically. Forkers get correct verify command. M-SIGN-3 verifies regex matches package.json repo URL.
Audit#11: SECURITY.md PGP email = 'security@<your-domain>' placeholder; maintainer fills. Fallback: 'Or use GitHub Security Advisories at https://github.com/<owner>/<repo>/security/advisories/new'. M-SIGN-3 verifies GHSA URL present.
Audit minor: failure rollback no-op; partial git tag → manual 'git tag -d'. assertVersionSync + validate-plugin run early.
