# Security Policy

## Supported Versions

| Version  | Supported          |
| -------- | ------------------ |
| 1.0.x    | :white_check_mark: |
| 0.4.x    | :white_check_mark: (security fixes only) |
| < 0.4    | :x:                |

We support the latest minor release on the current major and apply security
fixes to the immediately preceding minor for 90 days after a new minor ships.

## Reporting a Vulnerability

Please **do not file a public issue**.

**Preferred:** Use the GitHub Security Advisory workflow:
<https://github.com/HUMBLEF0OL/coherence/security/advisories/new>

This routes the report privately to the maintainers and lets us coordinate a
fix + CVE without leaking the issue.

**Fallback:** Email `coherence-security@noreply.invalid` with the subject
`coherence vulnerability: <short title>`. Please include:

- The version (`coherence --version` or the `version` field in `.claude-plugin/plugin.json`).
- Reproduction steps or a proof-of-concept.
- The impact you observed.
- Any suggested mitigation.

We will acknowledge receipt within **3 business days** and aim to provide a
remediation timeline within **10 business days** for valid reports.

## Disclosure Policy

We follow coordinated disclosure:

1. We confirm the issue and prepare a patch in private.
2. We notify the reporter when a fix is ready and (optionally) credit them in
   the advisory.
3. We release the fix in the next supported minor or patch and publish the
   security advisory.
4. We request that reporters allow **up to 90 days** between report and public
   disclosure, unless an active exploit is observed in the wild (in which case
   we move faster, typically within 14 days).

## Out of Scope

- Vulnerabilities in dependencies (please report upstream).
- Issues that require an attacker with write access to the user's home
  directory or `.claude/coherence/` state (the local-only privacy model
  assumes a trusted host filesystem).
- Theoretical timing-side-channel attacks on the trust ledger summary cache.

## Verification

Release tarballs published to GitHub Releases are signed with Sigstore
`cosign` keyless OIDC. See the **Verification** section of `README.md` for
the verify command.
