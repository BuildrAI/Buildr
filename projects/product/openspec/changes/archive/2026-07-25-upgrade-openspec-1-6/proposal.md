## Why

Buildr currently pins its OpenSpec Component, external CLI declaration, bundled workflow Skills, and contract guard to OpenSpec 1.4.1, while upstream 1.6.0 adds planning-artifact reconciliation and fixes validation and archive safety issues. The version boundary must be upgraded as one verified integration so that Buildr keeps its external-tool and contract-guard boundaries instead of silently drifting from the upstream workflow it distributes.

## What Changes

- Upgrade the packaged OpenSpec CLI development dependency, OpenSpec Component upstream metadata, and external Command declaration from 1.4.1 to 1.6.0.
- Refresh the supported upstream workflow Skills and their integrity records, while preserving Buildr's rule that sidebar contributions are derived at runtime rather than written into the external Skill sources.
- Evaluate and, when it passes the integration criteria, include the new upstream `openspec-update-change` workflow for revising existing planning artifacts without implementation changes.
- Slim `openspec-contract-guard` to Buildr-specific proposal/baseline alignment, active-change conflicts, canonical drift, pre-sync receipt, and post-sync evidence; remove parser and archive-safety checks now provided by OpenSpec 1.6.0.
- Consolidate path-reporting sidebars already covered by upstream status context, while retaining Buildr-specific worktree, Candidate, contract-gate, and Task Finish constraints.
- Keep upstream Stores out of Buildr's default workflow because it remains an unstable upstream beta surface; do not add Store ownership, commands, or migration behavior.
- Verify the upgraded CLI, bundled Skills, Buildr contract guard, component lifecycle, and product package checks together before treating 1.6.0 as supported.

## Capabilities

### New Capabilities

- `openspec-upgrade-integration`: Define Buildr's evaluated adoption boundary for a supported OpenSpec upstream release and optional upstream workflow additions.

### Modified Capabilities

- `managed-components`: The packaged OpenSpec Component's upstream version, external workflow member set, integrity evidence, and upgrade verification requirements change.

## Impact

Affected areas include `projects/product/services/buildr/package.json` and its lockfile, the OpenSpec Component definition and command collection, upstream workflow Skill sources and generated package targets, Buildr OpenSpec sidebar/contract-guard responsibilities, and product verification fixtures. The change does not introduce a capability contract for each sidebar; existing cross-Skill contracts continue to protect worktree, verification, Git integration, asset review, and Task Finish. No external CLI is installed or upgraded on user machines by this change; Buildr continues to declare and diagnose it only.
