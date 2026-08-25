# Design

## Context

Task Development observes declarations through the retained controller because canonical Task, Review, Verification and Execution Record writes cannot be delegated to unintegrated candidate code. The retained controller is v2-only, while the current Candidate declaration is v3-only. No single YAML declaration can satisfy both closed schemas.

## Goals / Non-Goals

**Goals:**

- Deliver the v3 lifecycle without bypassing retained canonical authority.
- Bound v2 reading to the self-bootstrap transition and make deletion evidence-driven.
- Keep v3 as the only authoring model.

**Non-Goals:**

- Do not migrate external Workspaces from this Product worktree.
- Do not give v2 Product Candidate or Published Release semantics.
- Do not introduce a permanent compatibility policy.

## Decisions

### 1. Use a delivery-bounded transition, not an indefinite compatibility policy

This delivery keeps the Product declaration on v2 and ships a new runtime capable of reading both v2 and v3. A dependent Parent Contribution is already registered to migrate Product and the controlled Jixian pilots, verify the retained controller identity and final Doctor, and then delete v2.

### 2. Normalize v2 without pretending it is v3 evidence

The adapter validates the exact v2 schema, maps `applicability.paths` to discovery sources, maps only `requiredForDelivery: true` to `task-delivery`, and maps the single invocation to the full entry. Because v2 has no evidence boundary, normalized Plan items carry `legacy-declared` rather than guessing Static, Unit, Integration or System. Capabilities not required for delivery remain in diagnostics but are not automatically usable for new target kinds.

### 3. Keep v3 as the only authoring model

Skills, templates, CLI documentation and new declarations continue to teach v3 only. Doctor reports a non-blocking migration notice for a valid v2 declaration. Invalid v2 declarations remain blocking. No writer generates v2.

### 4. Make deletion mechanically decidable

The reader may be removed only when all of the following are proven:

1. This transition Candidate is delivered and Buildr self-bootstrap completes.
2. The retained controller identity resolves to the delivered dual-reader runtime and Workspace Doctor is ready.
3. Product, Pig, FreshX and Foundation live declarations are v3 under their own formal authorities.
4. Required gap, affected, dependency expansion and full scenarios have matching evidence.
5. An active-authority scan is clean apart from immutable archive/Git provenance.

## Rejected alternatives

- Candidate controller writes canonical lifecycle state: rejected because it violates retained authority and SQLite provenance.
- One document accepted by both closed schemas: impossible because schemaVersion and capability fields conflict.
- Date-based deprecation: rejected because elapsed time does not prove consumers migrated.

## Risks / Trade-offs

- The transition temporarily carries two readers. This is accepted only because the dependent deletion Contribution and its gates already exist in the Parent Plan.
- v2 lacks evidence boundaries. The adapter preserves that fact as `legacy-declared` instead of guessing a v3 evidence type.

## Migration Plan

1. Ship the bounded reader with Product still declaring v2.
2. Complete formal delivery and Buildr self-bootstrap.
3. Migrate controlled live declarations under their own authorities.
4. Run the registered dependent Contribution to delete v2 and transition wording.

## Open Questions

- None. The Parent Plan records the owner, dependency and exit evidence.
