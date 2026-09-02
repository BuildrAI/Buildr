const freezeOwnership = (value) => Object.freeze({
  inputs: Object.freeze(value.inputs),
  inputExclusions: Object.freeze(value.inputExclusions),
  preflightInputs: Object.freeze(value.preflightInputs ?? []),
});

export const VERIFICATION_STEP_OWNERSHIP = Object.freeze(Object.fromEntries(
  Object.entries({
  "typecheck": {
    "inputs": [
      "src/**/*.ts",
      "tsconfig.json",
      "tsconfig.test-context.json",
      "package.json",
      "package-lock.json"
    ],
    "inputExclusions": []
  },
  "unit": {
    "inputs": [
      "test/unit/**",
      "src/**",
      "services/buildr-web/**",
      "test/verification/dag-scheduler.mjs",
      "test/verification/planner.mjs",
      "test/verification/test-files.mjs",
      "test/verification/run-node-tests.mjs",
      "test/verification/resource-coordinator.mjs",
      "test/verification/registry.mjs",
      "test/verification/browser-selector-dispatcher.mjs",
      "test/verification/unit-coverage.mjs"
    ],
    "inputExclusions": []
  },
  "component": {
    "inputs": [
      "test/component/**",
      "src/workspace/application/service-application.mjs"
    ],
    "inputExclusions": []
  },
  "integration": {
    "inputs": [
      "test/integration/**",
      "test/verification/integration.mjs",
      "test/verification/worker-budget.mjs",
      "src/bootstrap/**",
      "src/infrastructure/content/**",
      "src/infrastructure/final-doctor-process.mjs",
      "src/infrastructure/git/checkout-identity.mjs",
      "src/infrastructure/process.mjs",
      "buildr",
      "tools/development/run-development-cli"
    ],
    "inputExclusions": [
      "test/integration/application-payload-release.test.mjs",
      "test/integration/npm-launcher.test.mjs",
      "test/integration/core-diagnostics-and-package.test.mjs",
      "test/integration/internal-workflow-route-diagnostics.test.mjs",
      "test/integration/project-verification-map.test.ts",
      "test/integration/change-application.test.mjs",
      "test/integration/openspec-convergence-preflight.test.mjs",
      "test/integration/openspec-convergence-recovery.test.mjs",
      "test/integration/openspec-convergence-transaction.test.mjs",
      "test/integration/openspec-deterministic-sync.test.mjs",
      "test/integration/openspec-domain.test.mjs",
      "test/integration/openspec-projected-validator.test.mjs",
      "test/integration/verification-entrypoints-cli.test.mjs",
      "test/integration/task-verification-report.test.ts",
      "test/integration/verification-resource-coordinator.test.mjs",
      "test/integration/test-context-runtime.test.mjs",
      "test/integration/node-test-context-host.test.mjs",
      "test/integration/verification-test-files.test.mjs",
      "test/integration/capability-contracts.test.mjs",
      "test/integration/capability-runtime.test.mjs",
      "test/integration/buildr-web-read-executor.test.mjs",
      "test/integration/buildr-web-runtime.test.mjs",
      "test/integration/buildr-web-workspace.test.mjs",
      "test/integration/preview-ownership.test.mjs",
      "test/integration/runtime-skills.test.mjs",
      "test/integration/task-record-http-contract.test.mjs",
      "test/integration/task-manager-capability-graph.test.mjs",
      "test/integration/task-pre-create-git-capability-graph.test.mjs",
      "test/integration/web-dist-verification.test.mjs",
      "test/integration/open-source-release-filesystem.test.mjs",
      "test/integration/product-installation-identity.test.mjs",
      "test/integration/product-installation-registry.test.mjs",
      "test/integration/workspace-management-fence.test.mjs",
      "test/integration/workspace-sqlite.test.mjs",
      "test/integration/project-environment-preparation-diagnostics.test.mjs",
      "test/integration/task-environment-controller-handoff.test.mjs",
      "test/integration/task-environment-preparation-plan.test.mjs",
      "test/integration/task-environment-repository.test.mjs",
      "test/integration/self-bootstrap-closeout.test.mjs",
      "test/integration/task-overview-repository.test.ts",
      "test/integration/task-planning-identity-application.test.mjs",
      "test/integration/task-retrospective-repository.test.mjs",
      "test/integration/parent-coordination-application.test.ts",
      "test/integration/parent-coordination-repository.test.ts",
      "test/integration/publication-application.test.mjs",
      "test/integration/project-daily-progress-application.test.mjs",
      "test/integration/task-development-application.test.ts",
      "test/integration/task-development-application-shard-2.test.mjs",
      "test/integration/task-development-application-shard-3.test.mjs",
      "test/integration/task-development-application-shard-4.test.mjs",
      "test/integration/task-development-driver-discovery.test.mjs",
      "test/integration/task-development-driver-profile.test.mjs",
      "test/integration/task-development-repository.test.mjs",
      "test/integration/task-review-repository.test.ts",
      "test/integration/task-verification-report.test.ts",
      "test/integration/task-finish-sqlite.test.mjs",
      "test/integration/task-finish-maintenance.test.mjs",
      "test/integration/task-finish-retained-cleanup.test.mjs",
      "test/integration/task-finish-task-contribution.test.mjs",
    ]
  },
  "integration-declarations": {
    "inputs": [
      "test/integration/core-diagnostics-and-package.test.mjs",
      "test/integration/internal-workflow-route-diagnostics.test.mjs",
      "test/integration/project-verification-map.test.ts",
      "src/task/contracts/internal-workflow-route-catalog.mjs",
      "src/system/doctor/application/internal-workflow-route-diagnostics.mjs",
      "src/system/doctor/application/project-environment-preparation-diagnostics.mjs",
      "src/verification/application/project-verification-diagnostics.mjs",
      "src/task/domain/project-environment-preparation.mjs",
      "src/system/doctor/application/diagnostics.mjs",
      "src/system/doctor/application/result-model.mjs",
      "src/system/doctor/application/scope-diagnostics.mjs",
      "src/agent-assets/application/package-maintenance/verification-registry.mjs"
    ],
    "inputExclusions": []
  },
  "integration-openspec": {
    "inputs": [
      "test/integration/change-application.test.mjs",
      "test/integration/openspec-convergence-preflight.test.mjs",
      "test/integration/openspec-convergence-recovery.test.mjs",
      "test/integration/openspec-convergence-transaction.test.mjs",
      "test/integration/openspec-deterministic-sync.test.mjs",
      "test/integration/openspec-domain.test.mjs",
      "test/integration/openspec-projected-validator.test.mjs",
      "src/task/change/**",
      "src/task/openspec/**"
    ],
    "inputExclusions": []
  },
  "integration-verification": {
    "inputs": [
      "test/integration/task-verification-report.test.ts",
      "test/integration/verification-resource-coordinator.test.mjs",
      "test/integration/test-context-runtime.test.mjs",
      "test/integration/node-test-context-host.test.mjs",
      "test/integration/verification-test-files.test.mjs",
      "test/context/**",
      "test/fixtures/node-test-context/**",
      "test-context.mjs",
      "src/infrastructure/testing/context-runtime/**",
      "package/targets/test-context/**",
      "tools/testing/test-context-build.mjs",
      "tsconfig.test-context.json",
      "src/verification/infrastructure/capability-runner.mjs",
      "src/verification/infrastructure/process-executor.mjs",
      "src/verification/infrastructure/owned-process.mjs",
      "src/verification/domain/verification-deadline.mjs",
      "src/verification/domain/verification-plan.mjs",
      "src/verification/infrastructure/preparation-admission.mjs",
      "src/verification/infrastructure/resource-coordinator.mjs",
      "src/verification/application/verification-application.mjs",
      "test/verification/audit.mjs",
      "test/verification/changed.mjs",
      "test/verification/changed-paths.mjs",
      "test/verification/dag-scheduler.mjs",
      "test/verification/executor.mjs",
      "test/verification/focus.mjs",
      "test/verification/integration.mjs",
      "test/verification/plan-runner.mjs",
      "test/verification/planner.mjs",
      "test/verification/profile.mjs",
      "test/verification/resource-coordinator.mjs",
      "test/verification/run-node-tests.mjs",
      "test/verification/test-files.mjs",
      "test/verification/worker-budget.mjs"
    ],
    "inputExclusions": []
  },
  "integration-runtime": {
    "inputs": [
      "test/integration/capability-contracts.test.mjs",
      "test/integration/capability-runtime.test.mjs",
      "test/integration/buildr-web-read-executor.test.mjs",
      "test/integration/buildr-web-runtime.test.mjs",
      "test/integration/buildr-web-workspace.test.mjs",
      "test/integration/preview-ownership.test.mjs",
      "test/integration/runtime-skills.test.mjs",
      "test/integration/task-record-http-contract.test.mjs",
      "test/integration/task-manager-capability-graph.test.mjs",
      "test/integration/task-pre-create-git-capability-graph.test.mjs",
      "test/integration/web-dist-verification.test.mjs",
      "src/bootstrap/**",
      "src/infrastructure/contracts/json-schema-validator.mjs",
      "src/task/module.mjs",
      "src/task/interfaces/http/**",
      "src/agent-assets/infrastructure/runtime/**",
      "src/workspace/**",
      "src/web/**",
      "tools/contracts/**",
      "services/buildr-web/src/api/**",
      "services/buildr-web/src/App.tsx",
      "services/buildr-web/src/pages/TasksPage.tsx",
      "services/buildr-web/src/pages/TaskDetailPage.tsx",
      "services/buildr-web/src/pages/task-detail/shared.tsx",
      "test/verification/web-dist.mjs",
      "resources/workspace/skills/buildr/task-manager/**",
      "resources/workspace/skills/buildr/task-triage/**"
    ],
    "inputExclusions": []
  },
  "integration-release": {
    "inputs": [
      "test/integration/open-source-release-filesystem.test.mjs",
      "test/integration/product-installation-identity.test.mjs",
      "test/integration/product-installation-registry.test.mjs",
      "tools/release/**",
      "src/system/installation/application/product-installation-status.mjs",
      "src/system/installation/application/npm-installation-enrollment.mjs",
      "src/system/installation/**",
      "src/infrastructure/product-invocation/**",
      "src/infrastructure/product-resources/**"
    ],
    "inputExclusions": []
  },
  "integration-data-store": {
    "inputs": [
      "test/integration/workspace-management-fence.test.mjs",
      "test/integration/workspace-sqlite.test.mjs",
      "src/workspace/**",
      "src/infrastructure/index.mjs",
      "src/infrastructure/sqlite/**",
      "src/task/application/task-execution-record-application.mjs",
      "src/task/persistence/task-execution-record-body-store.mjs",
      "src/task/persistence/task-execution-record-repository.mjs"
    ],
    "inputExclusions": []
  },
  "integration-task-environment": {
    "inputs": [
      "test/integration/project-environment-preparation-diagnostics.test.mjs",
      "test/integration/task-environment-controller-handoff.test.mjs",
      "test/integration/task-environment-preparation-plan.test.mjs",
      "test/integration/task-environment-repository.test.mjs",
      "src/task/application/task-environment-application.mjs",
      "src/task/domain/project-environment-preparation.mjs",
      "src/task/persistence/task-environment-repository.mjs"
    ],
    "inputExclusions": []
  },
  "integration-self-bootstrap": {
    "inputs": [
      "test/integration/self-bootstrap-closeout.test.mjs",
      "skills/buildr-self-bootstrap-sync/**",
      "resources/workspace/skills/buildr/buildr-self-bootstrap-sync/**",
      "src/system/installation/application/release-awareness.mjs"
    ],
    "inputExclusions": []
  },
  "integration-task-read-models": {
    "inputs": [
      "src/task/application/task-entry-snapshot-application.mjs",
      "src/task/application/task-overview-application.mjs",
      "src/task/persistence/task-overview-repository.mjs",
      "src/task/persistence/task-overview-repository.ts",
      "test/integration/task-overview-repository.test.ts",
      "test/integration/task-planning-identity-application.test.mjs",
      "test/integration/task-retrospective-repository.test.mjs",
      "src/task/application/task-overview-application.ts",
      "src/task/application/task-planning-identity-application.mjs",
      "src/task/application/task-retrospective-application.mjs",
      "src/task/domain/task-retrospective.mjs",
      "src/task/interfaces/http/task-retrospective-http.mjs",
      "src/task/interfaces/internal/task-retrospective-driver.mjs",
      "src/task/persistence/task-retrospective-repository.mjs"
    ],
    "inputExclusions": []
  },
  "integration-task-coordination": {
    "inputs": [
      "src/task/application/parent-coordination-application.mjs",
      "test/integration/parent-coordination-application.test.ts",
      "test/integration/parent-coordination-repository.test.ts",
      "test/integration/publication-application.test.mjs",
      "src/task/application/parent-coordination-application.ts",
      "src/task/domain/parent-coordination.ts",
      "src/task/domain/terminal-contribution-reconciliation.mjs",
      "src/task/persistence/parent-coordination-repository.mjs",
      "src/task/persistence/terminal-contribution-reconciliation-repository.mjs",
      "src/system/publication/**"
    ],
    "inputExclusions": []
  },
  "integration-project-daily-progress": {
    "inputs": [
      "test/integration/project-daily-progress-application.test.mjs",
      "src/workspace/domain/project-daily-progress.mjs",
      "src/workspace/application/project-daily-progress-application.mjs",
      "src/workspace/persistence/project-daily-progress-repository.mjs",
      "src/workspace/interfaces/cli/project-daily-progress.mjs",
      "src/workspace/interfaces/http/workspace-http.mjs",
      "src/workspace/module.mjs"
    ],
    "inputExclusions": []
  },
  "integration-task-development": {
    "inputs": [
      "src/task/application/task-development*.mjs",
      "test/integration/task-development-application.test.ts",
      "test/integration/task-development-application-shard-2.test.mjs",
      "test/integration/task-development-application-shard-3.test.mjs",
      "test/integration/task-development-application-shard-4.test.mjs",
      "test/integration/task-development-driver-discovery.test.mjs",
      "test/integration/task-development-driver-profile.test.mjs",
      "test/integration/task-development-repository.test.mjs",
      "test/integration/task-review-repository.test.ts",
      "test/integration/task-verification-report.test.ts",
      "test/helpers/task-verification-result-fixture.mjs",
      "src/task/domain/task-development.mjs",
      "src/task/persistence/task-development-repository.mjs",
      "src/task/persistence/task-review-repository.ts",
      "src/task/persistence/task-verification-repository.mjs",
      "src/task/application/task-review-application.ts",
      "src/task/domain/task-review.ts",
      "src/task/interfaces/cli/task-review.ts",
      "src/task/interfaces/http/task-review-http.ts",
      "src/task/application/task-verification-application.mjs",
      "src/task/interfaces/internal/task-development-driver.mjs",
      "src/task/interfaces/internal/task-development-driver-runner.mjs"
    ],
    "inputExclusions": []
  },
  "integration-task-finish": {
    "inputs": [
      "src/task/application/finish/**",
      "test/helpers/legacy-finish-history.mjs",
      "test/integration/task-finish-sqlite.test.mjs",
      "test/integration/task-finish-maintenance.test.mjs",
      "test/helpers/task-finish-sqlite-fixture.mjs",
      "src/task/application/finish/task-finish-application.mjs",
      "src/task/application/finish/task-finish-current-facts.mjs",
      "src/task/application/finish/task-finish-delivery-commit.mjs",
      "src/task/application/finish/task-finish-repository-set.mjs",
      "src/task/application/finish/task-finish-result-projection.mjs",
      "src/task/application/finish/task-finish-self-bootstrap-projection.mjs",
      "src/task/application/finish/task-finish-run.mjs",
      "src/task/application/finish/task-finish-maintenance.mjs",
      "src/task/persistence/task-finish-repository.mjs"
    ],
    "inputExclusions": []
  },
  "integration-task-finish-delivery": {
    "inputs": [
      "src/task/application/task-terminal-delivery-application.mjs",
      "test/integration/task-finish-retained-cleanup.test.mjs",
      "test/integration/task-finish-task-contribution.test.mjs",
      "src/task/application/finish/git-task-contribution.mjs",
      "src/task/application/finish/task-finish-delivery-commit.mjs",
      "src/task/application/task-terminal-delivery-application.ts"
    ],
    "inputExclusions": []
  },
  "contract": {
    "inputs": [
      "test/contract/**",
      "test/fixtures/**",
      ".node-version",
      "preparation.yml",
      "verification.yml",
      "task-finish.yml",
      "src/infrastructure/sqlite/migrations/**",
      "src/bootstrap/module-registry.mjs",
      "src/bootstrap/runtime.mjs",
      "src/bootstrap/cli/registry.mjs",
      "src/task/module.mjs",
      "src/web/http/server.mjs",
      ".github/workflows/publish.yml",
      ".github/workflows/verify.yml",
      "tools/release/release-authority.mjs",
      "tools/release/release-authority-oidc-probe.mjs",
      "tools/release/release-authority-preflight.mjs",
      "tools/release/release-task-evidence-correlation.mjs",
      "tools/release/release-transaction-evidence.mjs",
      "tools/release/release-transaction-runner.mjs",
      "tools/release/release-lifecycle.mjs",
      "tools/release/release-phase-timeline.mjs",
      "tools/release/release-orchestration-runner.mjs",
      "tools/release/release-tag-ensure.mjs",
      "tools/release/release-contract.mjs",
      "tools/release/trusted-publish.mjs",
      "src/system/installation/domain/release-version.mjs",
      "src/agent-assets/infrastructure/runtime/render-claude-code.mjs",
      "test/verification/candidate.mjs",
      "test/verification/candidate-ci.mjs",
      "test/verification/candidate-ci-evidence.mjs",
      "test/verification/changed.mjs",
      "test/verification/focus.mjs",
      "test/verification/executor.mjs",
      "test/verification/package/run.mjs",
      "test/verification/plan-runner.mjs",
      "test/verification/planner.mjs",
      "test/verification/profile.mjs",
      "test/verification/registry.mjs",
      "test/verification/release/**",
      "test/verification/workspace/suites.mjs",
      "test/verification/verify-buildr-product",
      "test/verification/verify-buildr-product-daily-full",
      "test/verification/verify-buildr-product-core",
      "test/verification/verify-buildr-product-fast",
      "test/verification/verify-buildr-product-ci",
      "tools/development/resolve-development-node",
      "tools/development/run-development-node",
      "tools/development/run-development-npm",
      "tools/development/run-development-npm.mjs",
      "resources/manifest.yml",
      "resources/workspace/AGENTS.md",
      "resources/workspace/skills/**",
      "package/targets/runtime/skills/**",
      "skills/buildr-release/**",
      "docs/skill-capability-contracts.md",
      "package.json",
      "package-lock.json",
      "test/verification/ownership.mjs"
    ],
    "inputExclusions": [],
    "preflightInputs": [
      "resources/workspace/skills/buildr/task-development/**",
      "test/contract/task-development.test.mjs"
    ]
  },
  "system-verification-admission": {
    "inputs": [
      "test/system/verification-changed-paths.test.mjs",
      "test/verification/candidate.mjs",
      "test/verification/verify-buildr-product-daily-full",
      "test/verification/verify-buildr-product-core",
      "test/verification/dag-scheduler.mjs",
      "test/verification/plan-runner.mjs",
      "test/verification/planner.mjs",
      "test/verification/product-provider-entry.mjs",
      "test/verification/registry.mjs",
      "src/verification/application/**",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs",
      "test/verification/ownership.mjs"
    ],
    "inputExclusions": []
  },
  "system-verification-contracts": {
    "inputs": [
      "test/system/verification-resource-coordination.test.mjs",
      "test/system/verification-timing.test.mjs",
      "test/system/workspace-verification.test.mjs",
      "test/verification/focus.mjs",
      "test/verification/executor.mjs",
      "test/verification/plan-runner.mjs",
      "test/verification/resource-coordinator.mjs",
      "test/verification/timing/**",
      "test/verification/workspace/**",
      "src/verification/infrastructure/capability-runner.mjs",
      "src/verification/infrastructure/preparation-admission.mjs",
      "src/verification/infrastructure/process-executor.mjs",
      "src/verification/infrastructure/owned-process.mjs",
      "src/verification/domain/verification-deadline.mjs",
      "src/verification/infrastructure/resource-coordinator.mjs",
      "src/verification/application/verification-application.mjs",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": []
  },
  "system-public-json-contracts": {
    "inputs": [
      "test/system/public-json-contracts.test.mjs",
      "src/infrastructure/contracts/public-json.mjs",
      "src/bootstrap/cli/**",
      "src/task/interfaces/cli/**",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": []
  },
  "system-openspec-contract-audit": {
    "inputs": [
      "test/system/openspec-contract-audit.test.mjs",
      "src/task/openspec/**",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": []
  },
  "system-workspace-lifecycle": {
    "inputs": [
      "test/system/package-capability-retirement.test.mjs",
      "test/system/project-product.test.mjs",
      "test/system/service-product.test.mjs",
      "test/system/workspace-manifest-registry.test.mjs",
      "src/workspace/**",
      "src/infrastructure/platform.mjs",
      "src/infrastructure/product-layout.mjs",
      "test/helpers/prepared-fixtures.mjs",
      "test/helpers/workspace-product-suite.mjs",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": []
  },
  "system-task-lifecycle": {
    "inputs": [
      "src/task/persistence/task-record-repository.mjs",
      "src/task/application/task-development-application.ts",
      "src/task/application/task-record*.mjs",
      "src/task/persistence/task-record-repository.ts",
      "test/system/task-development-generic-journey.test.mjs",
      "test/system/task-record-change-resolver.test.mjs",
      "test/system/task-record-buildr-web.test.mjs",
      "test/system/task-record-product.test.mjs",
      "test/system/task-review-product.test.ts",
      "test/system/task-verification-product.test.ts",
      "test/system/product-verification-provider-cli.test.mjs",
      "test/system/task-verification-product.test.mjs",
      "test/system/verification-run-cli.test.mjs",
      "src/bootstrap/**",
      "src/task/change/**",
      "test/helpers/task-record-system-fixture.mjs",
      "src/task/module.mjs",
      "src/task/domain/task-record.mjs",
      "src/task/domain/task-development.mjs",
      "src/task/domain/task-verification.mjs",
      "src/task/domain/task-review.ts",
      "src/task/domain/task-retrospective.mjs",
      "src/task/domain/task-planning-identity.mjs",
      "src/task/domain/parent-coordination.ts",
      "src/task/domain/terminal-contribution-reconciliation.mjs",
      "src/task/application/task-verification-application.mjs",
      "src/task/application/task-review-application.ts",
      "src/task/application/task-retrospective-application.mjs",
      "src/task/application/task-planning-identity-application.mjs",
      "src/task/application/task-overview-application.ts",
      "src/task/application/parent-coordination-application.ts",
      "src/task/persistence/parent-coordination-repository.mjs",
      "src/task/persistence/terminal-contribution-reconciliation-repository.mjs",
      "src/task/interfaces/cli/task-record.mjs",
      "src/task/interfaces/cli/task-review.ts",
      "src/task/interfaces/cli/task-verification.mjs",
      "src/task/interfaces/cli/parent-coordination.ts",
      "src/task/interfaces/http/**",
      "src/task/interfaces/internal/**",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": [
      "src/task/persistence/task-finish-repository.mjs"
    ]
  },
  "system-worktree-lifecycle": {
    "inputs": [
      "test/system/worktree-create.test.mjs",
      "src/task/infrastructure/**",
      "src/task/application/task-environment-application.mjs",
      "src/task/domain/project-environment-preparation.mjs",
      "src/infrastructure/git/**",
      "test/helpers/workspace-product-suite.mjs",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": []
  },
  "system-runtime-recovery": {
    "inputs": [
      "test/system/cli-update.test.mjs",
      "test/system/runtime-target-authority.test.mjs",
      "test/system/workspace-runtime-recovery.test.mjs",
      "src/system/installation/application/cli-update.mjs",
      "src/system/installation/application/release-awareness.mjs",
      "src/agent-assets/application/runtime-projection.mjs",
      "src/infrastructure/filesystem/**",
      "src/infrastructure/network/**",
      "src/agent-assets/infrastructure/runtime/**",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": []
  },
  "system-buildr-web-http": {
    "inputs": [
      "test/system/buildr-web-http.test.mjs",
      "test/system/task-professional-http-contract.test.mjs",
      "test/system/workspace-buildr-web-http.test.mjs",
      "src/bootstrap/**",
      "src/workspace/module.mjs",
      "src/workspace/interfaces/http/**",
      "src/task/module.mjs",
      "src/task/change/interfaces/http/**",
      "src/task/interfaces/http/**",
      "src/system/publication/interfaces/http/**",
      "src/web/http/**",
      "src/infrastructure/sqlite/**",
      "services/buildr-web/src/api/**",
      "test/helpers/workspace-product-suite.mjs",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": []
  },
  "system-app-process": {
    "inputs": [
      "test/system/development-workspace-smoke-isolation.test.mjs",
      "test/system/buildr-web-channel-isolation.test.mjs",
      "test/system/buildr-web-launcher.test.mjs",
      "test/system/workspace-app-process.test.mjs",
      "src/web/**",
      "src/infrastructure/process.mjs",
      "package/launchers/**",
      "tools/development/run-isolated-workspace-smoke.mjs",
      "tools/development/workspace-smoke.mjs",
      "test/fixtures/failing-workspace-smoke.mjs",
      "test/helpers/workspace-product-suite.mjs",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": []
  },
  "system-task-finish-cli": {
    "inputs": [
      "src/task/application/finish/task-finish-application.mjs",
      "src/task/application/finish/task-finish-run.mjs",
      "src/task/persistence/task-finish-repository.mjs",
      "test/system/task-finish-*.test.mjs",
      "test/system/task-finish-cli.test.mjs",
      "src/bootstrap/cli/**",
      "src/task/application/finish/task-finish-result-projection.mjs",
      "src/task/application/finish/task-finish-self-bootstrap-projection.mjs",
      "src/infrastructure/contracts/public-json.mjs",
      "src/task/interfaces/cli/**",
      "test/helpers/task-finish-sqlite-fixture.mjs",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": []
  },
  "system-fresh-build": {
    "inputs": [
      "test/system/task-environment-fresh-build-web.test.mjs",
      "test/verification/http-contract-fresh-build-inventory.mjs",
      "src/task/application/task-environment-application.mjs",
      "src/task/domain/project-environment-preparation.mjs",
      "preparation.yml",
      "services/buildr-web/package.json",
      "services/buildr-web/package-lock.json",
      "services/buildr-web/vite.config.*",
      "services/buildr-web/tsconfig*.json",
      "test/helpers/clean-product-source.mjs",
      "test/verification/system-suites.mjs",
      "test/verification/system.mjs",
      "test/helpers/task-lifecycle-system-context.mjs",
      "test/verification/system-file-timing-reporter.mjs"
    ],
    "inputExclusions": []
  },
  "system-windows-platform": {
    "inputs": [
      "test/system/cli-update.test.mjs",
      "test/system/buildr-web-launcher.test.mjs",
      "test/system/task-environment-fresh-build-web.test.mjs",
      "test/system/workspace-runtime-recovery.test.mjs",
      "test/system/worktree-create.test.mjs",
      "test/helpers/task-finish-sqlite-fixture.mjs",
      "src/system/installation/application/cli-update.mjs",
      "src/task/application/finish/**",
      "src/task/application/task-environment-application.mjs",
      "src/task/domain/project-environment-preparation.mjs",
      "src/task/infrastructure/**",
      "src/infrastructure/filesystem/**",
      "src/infrastructure/git/**",
      "src/agent-assets/infrastructure/runtime/**",
      "src/web/**",
      "resources/workspace/**",
      "services/buildr-web/package.json",
      "services/buildr-web/package-lock.json",
      "services/buildr-web/vite.config.*",
      "services/buildr-web/tsconfig*.json"
    ],
    "inputExclusions": []
  },
  "cli-architecture": {
    "inputs": [
      "bin/**",
      "src/bootstrap/**",
      "src/task/interfaces/cli/**",
      "src/web/http/server.mjs",
      "src/web/**",
      "src/task/**",
      "src/infrastructure/contracts/public-json.mjs",
      "resources/**",
      "web-dist/**",
      "tools/**",
      "package/**",
      "test/verification/cli/**",
      "package.json"
    ],
    "inputExclusions": []
  },
  "openspec-spec-quality": {
    "inputs": [
      "openspec/**/*.md",
      "openspec/**/*.yaml",
      "test/verification/openspec/spec-quality.mjs"
    ],
    "inputExclusions": []
  },
  "openspec-strict": {
    "inputs": [
      "openspec/**"
    ],
    "inputExclusions": []
  },
  "runtime-adapter-contract": {
    "inputs": [
      "src/agent-assets/infrastructure/runtime/**",
      "src/agent-assets/application/runtime.mjs",
      "src/system/doctor/application/runtime-diagnostics.mjs",
      "test/verification/runtime/adapter-contract.mjs",
      "package/targets/runtime/**",
      "docs/agent-runtime-adapters.md"
    ],
    "inputExclusions": []
  },
  "integration-candidate-release": {
    "inputs": [
      "test/integration-candidate-release/**",
      "tools/release/release-git-convergence.mjs",
      "tools/release/release-authority.mjs",
      "tools/release/release-contract.mjs",
      "tools/release/release-task-evidence-correlation.mjs",
      "tools/release/release-transaction-evidence.mjs",
      "tools/release/release-transaction-runner.mjs",
      "tools/release/release-lifecycle.mjs",
      "tools/release/release-phase-timeline.mjs",
      "tools/release/release-orchestration-runner.mjs",
      "tools/release/release-convergence.mjs",
      "tools/release/release-files.mjs",
      "tools/release/release-notes.mjs",
      "src/system/installation/domain/release-version.mjs"
    ],
    "inputExclusions": []
  },
  "concurrent-task-acceptance": {
    "inputs": [
      "test/verification/concurrency/**",
      "test/helpers/child-process-supervisor.mjs",
      "test/helpers/clean-product-source.mjs",
      "src/task/infrastructure/**",
      "src/task/application/task-verification-application.mjs",
      "src/verification/application/**",
      "src/web/application/preview-lifecycle.mjs",
      "openspec/specs/concurrent-task-acceptance/**",
      "openspec/specs/task-environments/**"
    ],
    "inputExclusions": []
  },
  "host-node-contract": {
    "inputs": [
      "package.json",
      "test/verification/host-node/**",
      "test/verification/host-node.mjs"
    ],
    "inputExclusions": []
  },
  "host-node-boundaries": {
    "inputs": [
      "test/integration/process-infrastructure.test.mjs",
      "test/integration/workspace-sqlite.test.mjs",
      "src/infrastructure/process.mjs",
      "src/infrastructure/filesystem/**",
      "src/infrastructure/sqlite/**",
      "test/verification/host-node.mjs",
      "test/verification/host-node/**"
    ],
    "inputExclusions": []
  },
  "candidate-tarball": {
    "inputs": [
      "package.json",
      "package-lock.json",
      "LICENSE",
      "README.md",
      "tools/release/application-payload.mjs",
      "tools/release/application-payload-entry.mjs",
      "tools/release/release-artifact.mjs",
      "src/**",
      "resources/**",
      "web-dist/**",
      "package/**",
      "test/verification/release/candidate-package.mjs",
      "test/verification/executor.mjs",
      ".github/workflows/publish.yml"
    ],
    "inputExclusions": [
      "package/launchers/**"
    ]
  },
  "application-payload-release": {
    "inputs": [
      "tools/release/application-payload.mjs",
      "tools/release/application-payload-entry.mjs",
      "tools/release/release-artifact.mjs",
      "src/**",
      "resources/**",
      "web-dist/**",
      "package/**",
      "test/integration/application-payload-release.test.mjs",
      "test/verification/release/candidate-package.mjs",
      "test/verification/executor.mjs",
      ".github/workflows/publish.yml"
    ],
    "inputExclusions": [
      "package/launchers/**"
    ]
  },
  "npm-launcher-candidate": {
    "inputs": [
      "src/system/installation/**",
      "src/bootstrap/cli/identity.ts",
      "src/system/installation/interfaces/cli/launcher.mjs",
      "src/web/http/server.mjs",
      "tools/release/application-payload.mjs",
      "tools/release/application-payload-entry.mjs",
      "test/integration/npm-launcher.test.mjs",
      "test/verification/release/release-smoke.mjs",
      ".github/workflows/publish.yml"
    ],
    "inputExclusions": []
  },
  "host-node-cli-smoke": {
    "inputs": [
      "buildr",
      "bin/buildr.mjs",
      "src/bootstrap/**",
      "src/task/interfaces/cli/**",
      "src/system/doctor/**",
      "src/workspace/application/workspace-operations.mjs",
      "package.json",
      "package-lock.json",
      "test/verification/host-node.mjs",
      "test/verification/host-node/**",
      "test/verification/release/candidate-package.mjs"
    ],
    "inputExclusions": []
  },
  "open-source-candidate": {
    "inputs": [
      "package.json",
      "package-lock.json",
      ".npmignore",
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      ".github/workflows/publish.yml",
      "docs/cli-reference.md",
      "docs/cli-architecture.md",
      "docs/known-limitations.md",
      "docs/agent-runtime-adapters.md"
    ],
    "inputExclusions": []
  },
  "openspec-candidate-audit": {
    "inputs": [
      "openspec/**",
      "test/verification/openspec/contract-audit.mjs"
    ],
    "inputExclusions": []
  },
  "managed-mutations": {
    "inputs": [
      "src/infrastructure/testing/context-runtime/node-test.ts",
      "src/infrastructure/testing/context-runtime/node-runner.ts",
      "src/agent-assets/application/package-maintenance/**",
      "src/workspace/application/workspace-operations.mjs",
      "src/workspace/persistence/**",
      "src/workspace/interfaces/cli/**",
      "src/infrastructure/filesystem/**",
      "src/agent-assets/infrastructure/runtime/**",
      "package.json"
    ],
    "inputExclusions": []
  },
  "capability-cli-integration": {
    "inputs": [
      "test/capability-cli.integration.mjs",
      "src/agent-assets/application/package-maintenance/package-assets.mjs",
      "src/agent-assets/application/skills.mjs",
      "src/system/doctor/application/capability-diagnostics.mjs",
      "src/agent-assets/application/package-maintenance/builtin-lifecycle.mjs",
      "src/agent-assets/application/package-maintenance/static-validation.mjs",
      "src/agent-assets/infrastructure/runtime/skills/**",
      "resources/workspace/skills/**",
      "package/targets/runtime/skills/**",
      "skills/**",
      "capabilities.yml"
    ],
    "inputExclusions": []
  },
  "commands-cli-integration": {
    "inputs": [
      "commands.yml",
      "test/commands-cli.integration.mjs",
      "src/agent-assets/application/commands.mjs",
      "src/agent-assets/application/components.mjs",
      "src/agent-assets/application/skills.mjs",
      "src/workspace/**",
      "src/system/doctor/**",
      "src/bootstrap/cli/help.mjs",
      "resources/manifest.yml"
    ],
    "inputExclusions": []
  },
  "openspec-contract-fixtures": {
    "inputs": [
      "src/task/openspec/application/openspec-application.mjs",
      "src/task/openspec/application/**",
      "test/verification/openspec/contract.mjs",
      "resources/workspace/skills/buildr/openspec-contract-guard/**"
    ],
    "inputExclusions": []
  },
  "openspec-convergence-recovery": {
    "inputs": [
      "src/task/openspec/application/openspec-application.mjs",
      "src/task/openspec/application/**",
      "test/verification/openspec/contract.mjs",
      "resources/workspace/skills/buildr/openspec-contract-guard/**",
      "resources/workspace/skills/buildr/task-development/**",
      "resources/workspace/skills/buildr/current-knowledge-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-static": {
    "inputs": [
      "resources/**",
      "web-dist/**",
      "tools/**",
      "package/**",
      "package.json",
      "package-lock.json",
      "src/agent-assets/application/package-maintenance/**",
      "test/verification/package/**"
    ],
    "inputExclusions": []
  },
  "package-workspace": {
    "inputs": [
      "resources/manifest.yml",
      "resources/workspace/AGENTS.md",
      "resources/workspace/components/**",
      "src/workspace/**",
      "src/workspace/application/workspace-operations.mjs",
      "src/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-commands": {
    "inputs": [
      "resources/workspace/commands/**",
      "src/agent-assets/application/commands.mjs",
      "src/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-rules": {
    "inputs": [
      "resources/workspace/rules/**",
      "src/agent-assets/application/rules.mjs",
      "src/agent-assets/infrastructure/runtime/**",
      "src/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-skills": {
    "inputs": [
      "resources/workspace/skills/**",
      "package/targets/runtime/skills/**",
      "src/agent-assets/application/skills.mjs",
      "src/agent-assets/infrastructure/runtime/skills/**",
      "src/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-runtime": {
    "inputs": [
      "package/targets/runtime/**",
      "resources/workspace/rules/**",
      "src/agent-assets/infrastructure/runtime/**",
      "src/agent-assets/application/runtime.mjs",
      "src/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "runtime-skill-projection": {
    "inputs": [
      "test/verification/runtime/skill-projection.mjs",
      "test/verification/runtime/fixture.mjs",
      "resources/manifest.yml",
      "resources/workspace/skills/buildr/**",
      "resources/workspace/skills/openspec/**"
    ],
    "inputExclusions": []
  },
  "runtime-adapter-parity": {
    "inputs": [
      "src/agent-assets/infrastructure/runtime/**",
      "src/agent-assets/application/runtime.mjs",
      "src/system/doctor/application/runtime-diagnostics.mjs",
      "test/verification/runtime/adapter-parity.mjs",
      "test/verification/runtime/fixture.mjs",
      "package/targets/runtime/**",
      "resources/workspace/rules/**"
    ],
    "inputExclusions": []
  },
  "workspace-lifecycle": {
    "inputs": [
      "src/workspace/**",
      "src/agent-assets/application/commands.mjs",
      "src/agent-assets/application/rules.mjs",
      "src/agent-assets/application/skills.mjs",
      "test/verification/workspace/fixture.mjs",
      "test/verification/workspace/workspace-lifecycle.mjs"
    ],
    "inputExclusions": []
  },
  "ownership-recovery": {
    "inputs": [
      "src/agent-assets/application/components.mjs",
      "src/agent-assets/application/package-maintenance/**",
      "test/verification/workspace/fixture.mjs",
      "test/verification/workspace/ownership-recovery.mjs"
    ],
    "inputExclusions": []
  },
  "runtime-reconciliation": {
    "inputs": [
      "src/agent-assets/infrastructure/runtime/**",
      "src/agent-assets/application/runtime.mjs",
      "test/verification/workspace/fixture.mjs",
      "test/verification/workspace/runtime-reconciliation.mjs",
      "package/targets/runtime/**",
      "resources/workspace/rules/**"
    ],
    "inputExclusions": []
  },
  "repository-onboarding": {
    "inputs": [
      "buildr",
      "tools/development/run-development-cli",
      "test/verification/onboarding/repository.mjs",
      "services/**",
      "package.json",
      "package-lock.json",
      "README.md"
    ],
    "inputExclusions": [
      "services/buildr-web/**"
    ]
  },
  "init-onboarding": {
    "inputs": [
      "src/workspace/**",
      "src/workspace/application/workspace-operations.mjs",
      "test/verification/onboarding/init.mjs",
      "resources/workspace/manifest.yml",
      "resources/workspace/AGENTS.md",
      "resources/workspace/components/**"
    ],
    "inputExclusions": []
  },
  "cli-compatibility": {
    "inputs": [
      "buildr",
      "bin/buildr.mjs",
      "src/bootstrap/**",
      "src/workspace/interfaces/cli/**",
      "src/task/interfaces/cli/**",
      "src/infrastructure/contracts/public-json.mjs",
      "src/agent-assets/application/runtime.mjs",
      "src/agent-assets/infrastructure/runtime/adapter-contract.mjs",
      "test/verification/cli/compatibility.mjs",
      "docs/cli-reference.md"
    ],
    "inputExclusions": []
  },
  "cli-package-parity": {
    "inputs": [
      "buildr",
      "bin/buildr.mjs",
      "src/bootstrap/**",
      "src/workspace/interfaces/cli/**",
      "src/task/interfaces/cli/**",
      "src/infrastructure/contracts/public-json.mjs",
      "src/task/application/finish/task-finish-result-projection.mjs",
      "src/task/application/finish/task-finish-self-bootstrap-projection.mjs",
      "src/infrastructure/product-layout.mjs",
      "test/verification/cli/package-parity.mjs",
      "package.json",
      "package-lock.json"
    ],
    "inputExclusions": []
  },
  "service-branch-contract": {
    "inputs": [
      "src/workspace/**",
      "test/verification/onboarding/service-branch.mjs",
      "services/**"
    ],
    "inputExclusions": [
      "services/buildr-web/**"
    ]
  },
  "remote-skill-timeout": {
    "inputs": [
      "src/infrastructure/network/**",
      "src/infrastructure/product-invocation/**",
      "src/bootstrap/cli/main.mjs",
      "tools/release/application-payload-entry.mjs",
      "src/agent-assets/application/skills.mjs",
      "test/verification/network/**"
    ],
    "inputExclusions": []
  },
  "release-tarball-smoke": {
    "inputs": [
      "buildr",
      "bin/buildr.mjs",
      "src/bootstrap/**",
      "src/task/interfaces/cli/**",
      "src/system/installation/application/cli-update.mjs",
      "src/agent-assets/application/package-maintenance/**",
      "src/agent-assets/application/package-maintenance.mjs",
      "src/workspace/application/workspace-operations.mjs",
      "src/infrastructure/product-layout.mjs",
      "package.json",
      "package-lock.json",
      "test/verification/release/**",
      ".github/workflows/publish.yml"
    ],
    "inputExclusions": []
  },
  "managed-data-integrity": {
    "inputs": [
      "src/agent-assets/application/package-maintenance/**",
      "src/agent-assets/application/package-maintenance.mjs",
      "src/workspace/application/workspace-operations.mjs",
      "src/agent-assets/application/commands.mjs",
      "src/agent-assets/application/components.mjs",
      "src/agent-assets/application/rules.mjs",
      "src/agent-assets/application/skills.mjs",
      "src/workspace/**",
      "src/system/doctor/**",
      "src/infrastructure/filesystem/**",
      "src/agent-assets/infrastructure/runtime/**",
      "resources/manifest.yml",
      "resources/workspace/manifest.yml",
      "resources/workspace/components/**",
      "resources/workspace/skills/buildr/task-retrospective/**",
      "test/verification/integrity/**"
    ],
    "inputExclusions": []
  },
  "docs-quality": {
    "inputs": [
      "**/*.md",
      "openspec/**/*.html",
      "docs/publications/assets/**",
      "test/verification/docs/quality.mjs"
    ],
    "inputExclusions": []
  }
}).map(([id, value]) => [id, freezeOwnership(value)]),
));

export const VERIFICATION_IGNORED_INPUTS = Object.freeze([
  "node_modules/**",
  ".buildr/**",
  ".gitignore"
]);

export const VERIFICATION_GOVERNED_REPOSITORY_INPUTS = Object.freeze([
  ".github/workflows/publish.yml",
  ".github/workflows/verify.yml"
]);

const fullScopeAuthority = (pattern, code, explanation) => Object.freeze({ pattern, code, explanation });

export const VERIFICATION_FULL_SCOPE_AUTHORITIES = Object.freeze([
  fullScopeAuthority('.github/workflows/verify.yml', 'execution-graph-change', 'Candidate and development verification workflow topology changed.'),
  fullScopeAuthority('.node-version', 'execution-foundation-change', 'The retained Product development Node authority changed.'),
  fullScopeAuthority('preparation.yml', 'environment-authority-change', 'Formal verification preparation authority changed.'),
  fullScopeAuthority('verification.yml', 'verification-authority-change', 'Public verification capability authority changed.'),
  fullScopeAuthority('package.json', 'package-execution-metadata-change', 'non-version package metadata changes may affect scripts, dependencies, or execution semantics.'),
  fullScopeAuthority('package-lock.json', 'package-execution-metadata-change', 'non-version package metadata changes may affect locked dependencies or execution semantics.'),
  ...[
    'tsconfig.json', 'tsconfig.test-context.json', 'test-context.mjs',
    'src/infrastructure/testing/context-runtime/**', 'package/targets/test-context/**',
    'tools/testing/test-context-build.mjs', 'test/context/**',
  ].map((pattern) => fullScopeAuthority(pattern, 'execution-foundation-change', 'Shared TypeScript or Test Context execution foundation changed.')),
  ...[
    'test/verification/verify-buildr-product', 'test/verification/verify-buildr-product-daily-full',
    'test/verification/verify-buildr-product-core', 'test/verification/verify-buildr-product-fast',
    'test/verification/verify-buildr-product-ci', 'test/verification/candidate.mjs',
    'test/verification/candidate-ci.mjs', 'test/verification/candidate-ci-evidence.mjs',
    'test/verification/dag-scheduler.mjs', 'test/verification/executor.mjs',
    'test/verification/plan-runner.mjs', 'test/verification/profile.mjs',
    'test/verification/registry.mjs', 'test/verification/resource-coordinator.mjs',
    'test/verification/timing/parallel-runner.mjs',
  ].map((pattern) => fullScopeAuthority(pattern, 'execution-graph-change', 'Verification execution graph, profile, scheduler, executor, or resource semantics changed.')),
  ...[
    'test/verification/changed.mjs', 'test/verification/changed-paths.mjs', 'test/verification/planner.mjs',
  ].map((pattern) => fullScopeAuthority(pattern, 'selection-authority-change', 'Affected and full selection authority changed.')),
  fullScopeAuthority('test/verification/ownership.mjs', 'ownership-authority-change', 'Changed path ownership and full-scope authority changed.'),
  ...[
    'tools/development/resolve-development-node', 'tools/development/run-development-node',
    'tools/development/run-development-npm', 'tools/development/run-development-npm.mjs',
  ].map((pattern) => fullScopeAuthority(pattern, 'runtime-authority-change', 'Development runtime invocation authority changed.')),
]);

export const VERIFICATION_FULL_SCOPE_INPUTS = Object.freeze(VERIFICATION_FULL_SCOPE_AUTHORITIES.map((item) => item.pattern));

export const VERIFICATION_DELEGATED_INPUTS = Object.freeze([
  {
    "owner": "product.browser-smoke",
    "inputs": [
      "test/browser-smoke/**",
      "test/verification/browser-selector-dispatcher.mjs",
      "test/verification/web-dist.mjs"
    ]
  }
].map((item) => Object.freeze({ owner: item.owner, inputs: Object.freeze(item.inputs) })));

export const VERIFICATION_PRODUCTION_OWNER_ALLOWLIST = Object.freeze([
  {
    "path": "src/infrastructure/contracts/declaration-intake.mjs",
    "owner": "unit",
    "reason": "The trigger is pure declaration selection glue; declaration Application and CLI behavior have separate owners."
  },
  {
    "path": "src/infrastructure/product-resources/index.mjs",
    "owner": "application-payload-release",
    "reason": "The resource resolver is exercised directly by the application payload release verifier."
  }
].map((item) => Object.freeze(item)));

export const VERIFICATION_SELECTION_METADATA_INPUTS = Object.freeze(['verification.yml', 'package.json', 'package-lock.json']);

export function verificationStepOwnership(id) {
  const value = VERIFICATION_STEP_OWNERSHIP[id];
  if (!value) throw new Error(`Missing verification ownership declaration: ${id}`);
  return value;
}

export function validateVerificationStepOwnership(stepIds) {
  const expected = new Set(stepIds);
  const findings = [];
  for (const id of expected) if (!VERIFICATION_STEP_OWNERSHIP[id]) findings.push({ step: id, code: 'missing_step_ownership' });
  for (const id of Object.keys(VERIFICATION_STEP_OWNERSHIP)) if (!expected.has(id)) findings.push({ step: id, code: 'unknown_step_ownership' });
  return Object.freeze({ ok: findings.length === 0, findings: Object.freeze(findings) });
}
