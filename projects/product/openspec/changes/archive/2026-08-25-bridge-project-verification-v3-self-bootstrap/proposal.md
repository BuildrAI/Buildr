# Change: Bridge Project Verification v3 self-bootstrap

## Why

The current retained Buildr controller only understands `buildr.project-verification/v2`. A Candidate that changes the Product live declaration to v3 cannot be observed by that retained authority, so Task Development cannot form a Content Target without violating canonical writer provenance. The v3-only cutover therefore cannot be delivered atomically in a self-hosting Workspace.

## What Changes

- Add a bounded v2 declaration reader that validates the closed legacy shape and normalizes it into the new Plan input model without inventing v3 evidence semantics.
- Keep Product's live declaration on v2 for this transition delivery while all new Skills, templates, APIs and v3 fixtures continue to use v3.
- Record the exact exit gate: the transition delivery must be delivered and self-bootstrapped, then all controlled live declarations must migrate before a dependent Contribution removes the reader.
- Correct roadmap and canonical wording that currently claims both immediate deletion and indefinite compatibility.

## Capabilities

### New Capabilities

- None. The transition stays inside the existing Project Verification and package-asset authorities.

### Modified Capabilities

- `project-test-capabilities`: permit a bounded, closed v2 reader while keeping v3 as the only authoring contract.
- `buildr-package-assets`: distinguish an owned transition reader from forbidden v2 Skills, templates and guidance.

## Impact

- Affected specs: `project-test-capabilities`, `buildr-package-assets`.
- Affected implementation: Project verification diagnostics/normalization, Product declaration, package validation, tests and roadmap/current knowledge.
- This Change does not authorize candidate writes to canonical Task state and does not migrate external Workspaces.
