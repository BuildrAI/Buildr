## 1. Authorization contract

- [x] 1.1 Update `buildr.task-retrospective/v2` so generic retrospective processing requests remain read-only until the user authorizes a concrete disposition and Task effects.
- [x] 1.2 Update the `task-retrospective` provider Skill with the two-phase discussion/mutation flow, direct-action exception, and re-authorization rule when facts or effects change.

## 2. Regression coverage

- [x] 2.1 Extend the package contract test to assert the provider and capability contract both preserve the explicit-authorization boundary.
- [x] 2.2 Run focused contract tests and strict OpenSpec validation for the completed implementation.

## 3. Knowledge and convergence readiness

- [x] 3.1 Record the Change Brief and current-knowledge impact for the new authorization boundary.
- [x] 3.2 Reconcile the implementation against the delta spec and leave the Change ready for deterministic convergence before formal Task Verification.
