<!-- url: https://www.notion.so/35f010d46a708198a92ad3af574c43a6 -->
<!-- id: 35f010d4-6a70-8198-a92a-d3af574c43a6 -->
<!-- title: BRD-1 — Personas & Use Cases -->
BRD-1 — PERSONAS & USE CASES (v1.0)
All v0.4 personas continue; v1.0 introduces P6 (mature-install developer) as the primary new persona served by the trust ladder.
- P1 — Solo developer (continued). v1.0 changes: personal trust ledger accumulates session signal; sections crossing 0.85 trust score auto-apply modifying patches; asserts: protect sections from patches that violate declared invariants.
- P2 — Team developer (continued). v1.0 changes: team trust aggregate via per-developer files at coherence/trust/\<author-hash\>.json (committed, no merge conflicts); /coherence:metrics surfaces aggregate scores alongside personal scores; conflict (\~0 aggregate) signals need for human review.
- P3 — Tech lead / reviewer (continued). v1.0 changes: /coherence:metrics revert hotspots identify problem sections; --deep audit surfaces cross-section consistency issues using LLM; trust scores show which areas have accumulated team confidence vs which need attention.
- P4 — First installer / marketplace browser (elevated). v1.0 changes: signed tarball via cosign keyless signing visible via cosign verify; SECURITY.md at project root surfaces responsible disclosure path; README Verification section links Rekor transparency log.
- P5 — Plugin marketplace curator (continued). v1.0 changes: cosign signature provides supply-chain verification independent of any centralised key management; M6 static-analysis gates reframed as verifiable README claims; SHA-256 manifest committed for independent audit.
- P6 — Mature-install developer (NEW in v1.0). 30+ days of coherence usage with accumulated personal trust signal. Wants reduced review friction for high-trust sections without losing the safety net on net-new files. v1.0 optimises for this transition via /coherence:trust --promote with --auto-land scope control (DD-139 / DD-146).
