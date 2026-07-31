## Summary

<!-- One or two sentences: what changed and why. -->

## Linked Issue

<!-- Closes #... or "Supersedes #..." or "Part of #...". If none, write "None — housekeeping / discussed in #..." and link the conversation. -->

## Type of Change

<!-- Pick one. -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds capability)
- [ ] Breaking change (fix or feature that would cause existing behaviour to change)
- [ ] Refactor (no behaviour change)
- [ ] Documentation
- [ ] Tests only
- [ ] Chore / tooling

## Checklist

<!-- Reviewers will not approve until every box below is checked or explicitly waived in a comment. -->

- [ ] Tests added or updated — and they fail without the change
- [ ] `bun run check:all` passes locally
- [ ] `cargo check` passes locally (if Rust was touched)
- [ ] Commit title follows Conventional Commits (`<type>(<scope>): <description>`)
- [ ] Documentation updated (`docs/developer/`, `README.md`, in-app i18n — whichever applies)
- [ ] No new ESLint warnings (`bun run lint` is `--max-warnings 0`)
- [ ] Coverage maintained: ≥ 97 % lines, ≥ 95 % branches (run `bun run test:coverage`)
- [ ] One logical change per PR — no unrelated edits bundled in
- [ ] No manual edits to Beads state (`.beads/`, `.dolt/`, JSONL)

## Testing Performed

<!-- What did you actually run? `bun run check:all`, E2E suite, manual repro, etc. -->

## Screenshots / Recordings

<!-- If the change is user-visible, attach before / after screenshots or a screen recording. -->

## Notes for Reviewers

<!-- Anything reviewers should look at closely: design trade-offs, things you intentionally didn't do, follow-up work tracked elsewhere. -->
