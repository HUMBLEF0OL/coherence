<!-- url: https://www.notion.so/35f010d46a70810ba08efc45a1ae3261 -->
<!-- id: 35f010d4-6a70-810b-a08e-fc45a1ae3261 -->
<!-- title: TS-4 — asserts: Validation Pipeline -->
TS-4 — ASSERTS: VALIDATION PIPELINE. Maps to FR-ASSERTS-1..5, DD-133, DD-141, DD-143.
Frontmatter parsing extension (src/detection/parseAnchors.ts): existing js-yaml parser supports nested object lists. asserts: key parsed as Array<{type, param?, policy?: 'block'|'warn'}>. Validation: type required, param optional, policy defaults 'warn'. Unknown keys silently dropped (forward compatible). Max 10 enforced via slice(0,10); 11+ ignored with stderr warning. Unknown type ignored with stderr (FR-ASSERTS-5). One combined warning per section per session.
Assertion registry (src/validation/assertions/index.ts): Map<type, fn>. v1.0 registered (7): has_example, no_placeholder_links, max_words, min_words, no_todo_comments, symbol_exists, file_exists. Deferred (logged+ignored): export_documented, signature_matches, AST-based.
Text-pattern impls (src/validation/assertions/textPatterns.ts):
- has_example: section.content matches fenced code block /```[\s\S]*?```/.
- no_placeholder_links: NOT match /\[[^\]]+\]\((TODO|#|)\)/.
- max_words/min_words: words = section.content.trim().split(/\s+/).length.
- no_todo_comments: NOT match /<!--\s*(TODO|FIXME)/i.
Codebase-linked (src/validation/assertions/codebaseLinked.ts) per DD-141: param parses LAST colon for language suffix in {typescript, javascript, python, go, rust}; else full param is symbol. Language: explicit suffix or detectProjectLanguage() from src/validation/hallucination.ts.
symbol_exists (Audit#2 corrected): NOT ripgrep (not guaranteed). Uses Node-native fast-glob (existing v0.3 dep) + readFile + content.includes(symbol). Per-session file-list cache; parallel batches of 10 via Promise.all; short-circuit on first match. Worst-case 1000 TS files × 5 KB ≈ 50 ms wall-clock; cache hit sub-ms.
file_exists: fs.statSync(path.resolve(getCoherenceDir() parent, param)). Pass 2 #2: NOT detectProjectRoot — actual helper is getCoherenceDir() in src/state/init.ts. Project root = path.dirname(path.dirname(getCoherenceDir())).
Pipeline integration (src/validation/apply.ts): after hallucination check, before patch application. Per affected section, load asserts list; dispatch each (max 10); collect (assertion, passed, message). Policy: any block-fail → reject; any warn-fail → attach review warning. Block wins in mixed scenarios.
Test map: M-ASSERTS-1..4.
Audit minor: has_example restricted to fenced (no indented to avoid false positives). min_words 0 always passes; max_words 0 only valid if empty.
