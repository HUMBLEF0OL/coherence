# Release ceremony (shared reference)

Every phase plan ends with a short "Release Task" that points at this document. The ceremony is identical across releases — only the version number, RELEASE_NOTES contents, and rc-window decision differ.

This doc is **not** a standalone plan to execute. It's a procedure reference quoted by each phase's release task.

---

## Inputs the calling task provides

When a phase plan invokes this pattern, it specifies:

- `<version>` — target version (e.g. `1.1.0`, `1.1.1`)
- `<phase-name>` — short label for the commit subject (e.g. "Phase 1 — foundational hygiene")
- `<rc-policy>` — one of:
  - **rc-required** — cut `<version>-rc.1`, run install-smoke + tester window, then GA
  - **rc-optional** — maintainer's choice; default skip
  - **rc-skip** — go straight to GA (docs-only releases)

## Procedure

### Step R1: Bump all 7 version sources

Run: `npm run bump <version>`
Expected: `[bump] all 7 sources now at <version>. Run \`npm run build\` to regenerate README cosign block.`

(If the bump script doesn't exist yet — it's introduced in Phase 1 Task 3 — fall back to the manual procedure documented in [v1.0.3's release commit](https://github.com/HUMBLEF0OL/coherence/commit/905a6cb).)

### Step R2: Verify

Run:

```bash
node -e "const fs=require('fs');const f=p=>JSON.parse(fs.readFileSync(p,'utf8'));console.log('pkg:',f('package.json').version);console.log('lock:',f('package-lock.json').version);console.log('plugin:',f('.claude-plugin/plugin.json').version);const m=f('.claude-plugin/marketplace.json');console.log('mk-v:',m.plugins[0].version);console.log('mk-ref:',m.plugins[0].source.ref);console.log('init:',/PLUGIN_VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync('src/state/init.ts','utf8'))[1])"
```

Expected: All 7 sources at `<version>`; marketplace ref at `v<version>`.

### Step R3: Rebuild

Run: `npm run build`
Expected: Build clean. README cosign block now references `coherence-<version>.tgz`. (After Phase 4 T6 ships, also emits `dist/sbom.cdx.json`.)

### Step R4: Draft `RELEASE_NOTES_v<version>.md`

If Phase 4 T8 has shipped (`scripts/release-notes.mjs`), generate the commit-grouped section:

Run: `node scripts/release-notes.mjs v<previous-version> > release-notes-commits.tmp.md`

Then write the hand-written narrative on top covering this release's specific changes, link to the migration doc if applicable, and append the auto-generated commit list:

```bash
node -e "require('fs').appendFileSync('RELEASE_NOTES_v<version>.md', '\n## Full change log\n' + require('fs').readFileSync('release-notes-commits.tmp.md','utf8'))"
```

Delete the temp file after.

Before T8 ships (Phase 1, Phase 2, Phase 3): write notes by hand, modeled on `RELEASE_NOTES_v1.0.3.md`.

### Step R5: Run release gates

In order, stop on first failure:

| Gate | Command | When introduced |
|---|---|---|
| Typecheck | `npm run typecheck` | Existing |
| Lint | `npm run lint` | Existing |
| Test suite | `npm test` | Existing |
| Properties | `npm run properties` | Phase 4 T2 |
| Coverage | `npm run coverage:check` | Phase 4 T3 |
| Ship gates | `npm run gates` | Existing |
| Plugin validate | `claude plugin validate .` | Existing |
| Pack size | `npm run pack:size` | Existing |
| Mutation (slow) | `npm run mutate` | Phase 4 T1 (optional for GA) |

Each gate command lists the *earliest* phase that introduces it. Gates introduced in later phases don't apply to earlier phases' releases.

### Step R6: Commit the version bump + notes

```bash
git add package.json package-lock.json .claude-plugin/ src/state/init.ts README.md RELEASE_NOTES_v<version>.md
# also: any other artifacts the build produced (e.g. dist/sbom.cdx.json should be gitignored, not committed)
git commit -m "chore(release): v<version> — <phase-name>

[hand-written body summarizing this phase's changes; reference move IDs;
link to migration doc if applicable]

Release-gate pass:
  [list each gate that ran and its result]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Step R7 (if `<rc-policy>` is rc-required or rc-optional + chosen): Cut rc tag

```bash
git tag -a v<version>-rc.1 -m "v<version>-rc.1 — pre-release for tester window"
git push origin dev v<version>-rc.1
```

CI workflows fire on the rc tag:
- Install-smoke (Phase 2 D3) — verifies the published install path works
- SLSA-L3 (Phase 4 T5) — emits provenance

Verify both green via `gh run list --limit 5` before proceeding.

**Tester window** (only if `<rc-policy>` is rc-required, or rc-optional + chosen):
- Onboard 3 testers per `docs/testers.md`
- Run for ~1 week
- Triage incoming `/coherence:feedback` issues:
  - **P1** (regression / broken install / data corruption) → patch on dev, cut `v<version>-rc.2`, restart
  - **P2/P3** → file for the *next* version, don't gate this release

If P1 issues land and require another rc, repeat Step R7 with the next rc number.

After the window:
- Confirm all P1 issues closed
- Optional: write `docs/testers-v<version>-report.md` (local, not shipped)

### Step R8: Final bump to GA (if rc was used)

Re-run R1 with the GA version (strips the `-rc.N` suffix).

Run `npm run build` again to refresh the cosign block + SBOM for the GA version.

Update `RELEASE_NOTES_v<version>.md` to replace any `-rc.1` references with the GA version. Add a "Tester feedback incorporated" subsection if any patches landed during the rc window.

Re-run the gate suite (Step R5).

Commit:

```bash
git add package.json package-lock.json .claude-plugin/ src/state/init.ts README.md RELEASE_NOTES_v<version>.md
git commit -m "chore(release): v<version> GA — incorporates tester feedback from rc window"
```

### Step R9: Fast-forward staging + master

```bash
git checkout staging
git merge --ff-only dev

git checkout master
git merge --ff-only staging
```

Both must be clean fast-forwards. If either fails, stop and investigate (unexpected commit on master/staging means something happened outside this plan; don't paper over it).

### Step R10: Tag and push

```bash
git tag -a v<version> -m "v<version> — <phase-name>"
git checkout dev   # land back on dev
git push origin master staging dev v<version>
```

### Step R11: Verify CI workflows

Run: `gh run list --limit 5`

Wait for these to complete on the GA tag:
- `install-smoke` (Phase 2+) → success
- `slsa-provenance` (Phase 4+) → success
- `release` (cosign signing) → success — verify the release page has `.sig`, `.pem`, `sbom.cdx.json`, `.intoto.jsonl` (SLSA) attached

If any fail, fix-forward. **Do not** force-move an announced tag. If a re-cut is needed post-announcement, increment patch (`v<version>+1`) instead.

### Step R12: Verify the published install (manual)

Run: `node scripts/install-smoke.mjs --tag v<version>`
Expected: `[install-smoke] PASS: v<version>`.

This is the smoke test from the maintainer's machine. The CI version of this already ran; this is the human confirmation.

### Step R13 (after the final phase only): Re-score against the rubric

Once the last v1.1.x release lands, re-run the rubric scoring (10 axes from the spec) and capture results in `docs/superpowers/specs/<date>-postmortem.md`. Identify gaps and queue them for follow-up.

This step does NOT run after every phase release — only after the final one.

---

## Rc-policy guidance per phase

| Phase | Version | rc-policy | Why |
|---|---|---|---|
| Phase 1 | v1.1.0 | **rc-required** | Slug rename is install-breaking; testers catch the migration UX |
| Phase 2 | v1.1.1 | **rc-required** | Command consolidation breaks scripts that called `/coherence:propose-list` etc. |
| Phase 3 | v1.1.2 | **rc-skip** | Docs-only; no behavior change |
| Phase 4 | v1.1.3 | **rc-optional** | Hardening is mostly internal; SLSA/SBOM are new artifacts users may want to verify |
| Phase 5 | v1.1.4 | **rc-required** | Pluggable engines is new API surface; third-party engine authors are stakeholders |

---

## Rollback procedure

If a release goes out and the install-smoke CI job fails AFTER the announcement:

1. Don't move the announced tag — semver expects tags to be immutable.
2. Cut `v<version>+1` (e.g. v1.1.0 broken → cut v1.1.0.1 patch — wait, semver doesn't support 4 numbers; use v1.1.1 if available, otherwise just call the next phase's version that one earlier).
3. Update `marketplace.json` `source.ref` to the new patch tag.
4. Run the full Release procedure with `<rc-policy: rc-required>` regardless of phase.
5. Document the incident in `docs/incidents/<date>-<short-name>.md`.

Pre-announcement (between `git tag` and any external mention), you CAN move the tag with `git tag -af` + `git push -f origin v<version>` if you catch the issue within minutes. Anything later is post-announcement by Coherence's own definitions.
