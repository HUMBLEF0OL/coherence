# Extending Coherence

Three pluggable surfaces a new contributor is most likely to touch:

| Surface | When to extend | Tutorial |
| ------- | -------------- | -------- |
| Asserts engines | You want a new contract a Markdown section can declare in its YAML frontmatter (`asserts:`). | [how-to-add-an-asserts-engine.md](how-to-add-an-asserts-engine.md) |
| Hallucination language registry | You want to harden the post-Stage-2 hallucination grep against drift in a language Coherence doesn't yet parse. | [how-to-add-a-language-to-hallucination-detection.md](how-to-add-a-language-to-hallucination-detection.md) |
| Hook event handler | You want Coherence to react to a new Claude Code lifecycle event. | [how-to-add-a-hook-event-handler.md](how-to-add-a-hook-event-handler.md) |

Each tutorial follows the same shape: **what** the extension is, **where**
it lives in the tree, the **interface** it implements, a **worked example**
you can copy, the **tests** it must pass, and the **gotchas** that trip
people up. Read [architecture.md](../architecture.md) first if you haven't
already — these tutorials assume you know what the Stop pipeline does and
where state lives.

## Future surfaces

Phase 5 of the S+ roadmap (S9) sketches a more general pluggable-engine
mechanism that would let third parties ship assertion engines + language
registries from outside the tree. Until that lands, the three extension
points above are the supported way to add behaviour.
