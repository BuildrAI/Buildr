const freezeOwnership: any = (value: any) => Object.freeze({
  inputs: Object.freeze(value.inputs),
  inputExclusions: Object.freeze(value.inputExclusions),
  preflightInputs: Object.freeze(value.preflightInputs ?? []),
});

export const VERIFICATION_STEP_OWNERSHIP: any = Object.freeze(Object.fromEntries(
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
      "test/verification/dag-scheduler.ts",
      "test/verification/planner.ts",
      "test/verification/test-files.ts",
      "test/verification/run-node-tests.ts",
      "test/verification/resource-coordinator.ts",
      "test/verification/registry.ts",
      "test/verification/browser-selector-dispatcher.ts",
      "test/verification/unit-coverage.ts"
    ],
    "inputExclusions": []
  },
  "component": {
    "inputs": [
      "test/component/**",
      "src/workspace/application/service-application.ts"
    ],
    "inputExclusions": []
  },
  "integration": {
    "inputs": [
      "test/integration/**",
      "test/verification/integration.ts",
      "test/verification/worker-budget.ts",
      "src/bootstrap/**",
      "src/infrastructure/content/**",
      "src/infrastructure/final-doctor-process.ts",
      "src/infrastructure/git/checkout-identity.ts",
      "src/infrastructure/process.ts",
      "buildr",
      "tools/development/run-development-cli"
    ],
    "inputExclusions": [
      "test/integration/application-payload-release.test.ts",
      "test/integration/npm-launcher.test.ts",
      "test/integration/core-diagnostics-and-package.test.ts",
      "test/integration/project-verification-map.test.ts",
      "test/integration/change-application.test.ts",
      "test/integration/openspec-convergence-preflight.test.ts",
      "test/integration/openspec-convergence-recovery.test.ts",
      "test/integration/openspec-convergence-transaction.test.ts",
      "test/integration/openspec-deterministic-sync.test.ts",
      "test/integration/openspec-domain.test.ts",
      "test/integration/openspec-projected-validator.test.ts",
      "test/integration/verification-entrypoints-cli.test.ts",
      "test/integration/task-verification-report.test.ts",
      "test/integration/verification-resource-coordinator.test.ts",
      "test/integration/test-context-runtime.test.ts",
      "test/integration/node-test-context-host.test.ts",
      "test/integration/verification-test-files.test.ts",
      "test/integration/capability-contracts.test.ts",
      "test/integration/capability-runtime.test.ts",
      "test/integration/buildr-web-read-executor.test.ts",
      "test/integration/buildr-web-runtime.test.ts",
      "test/integration/buildr-web-workspace.test.ts",
      "test/integration/preview-ownership.test.ts",
      "test/integration/runtime-skills.test.ts",
      "test/integration/task-record-http-contract.test.ts",
      "test/integration/task-manager-capability-graph.test.ts",
      "test/integration/task-pre-create-git-capability-graph.test.ts",
      "test/integration/web-dist-verification.test.ts",
      "test/integration/open-source-release-filesystem.test.ts",
      "test/integration/product-installation-identity.test.ts",
      "test/integration/product-installation-registry.test.ts",
      "test/integration/workspace-management-fence.test.ts",
      "test/integration/workspace-sqlite.test.ts",
      "test/integration/self-bootstrap-closeout.test.ts",
      "test/integration/parent-coordination-application.test.ts",
      "test/integration/parent-coordination-repository.test.ts",
      "test/integration/publication-application.test.ts",
      "test/integration/project-daily-progress-application.test.ts",
      "test/integration/task-review-repository.test.ts",
      "test/integration/task-verification-report.test.ts",
    ]
  },
  "integration-declarations": {
    "inputs": [
      "test/integration/core-diagnostics-and-package.test.ts",
      "test/integration/project-verification-map.test.ts",
      "src/verification/application/project-verification-diagnostics.ts",
      "src/system/doctor/application/diagnostics.ts",
      "src/system/doctor/application/result-model.ts",
      "src/system/doctor/application/scope-diagnostics.ts",
      "src/agent-assets/application/package-maintenance/verification-registry.ts"
    ],
    "inputExclusions": []
  },
  "integration-openspec": {
    "inputs": [
      "test/integration/change-application.test.ts",
      "test/integration/openspec-convergence-preflight.test.ts",
      "test/integration/openspec-convergence-recovery.test.ts",
      "test/integration/openspec-convergence-transaction.test.ts",
      "test/integration/openspec-deterministic-sync.test.ts",
      "test/integration/openspec-domain.test.ts",
      "test/integration/openspec-projected-validator.test.ts",
      "src/task/change/**",
      "src/task/openspec/**"
    ],
    "inputExclusions": []
  },
  "integration-verification": {
    "inputs": [
      "test/integration/task-verification-report.test.ts",
      "test/integration/verification-resource-coordinator.test.ts",
      "test/integration/test-context-runtime.test.ts",
      "test/integration/node-test-context-host.test.ts",
      "test/integration/verification-test-files.test.ts",
      "test/context/**",
      "test/fixtures/node-test-context/**",
      "test-context.mjs",
      "src/infrastructure/testing/context-runtime/**",
      "tools/build/**",
      "tools/testing/test-context-build.ts",
      "tsconfig.test-context.json",
      "src/verification/infrastructure/capability-runner.ts",
      "src/verification/infrastructure/process-executor.ts",
      "src/verification/infrastructure/owned-process.ts",
      "src/verification/domain/verification-deadline.ts",
      "src/verification/domain/verification-plan.ts",
      "src/verification/infrastructure/preparation-admission.ts",
      "src/verification/infrastructure/resource-coordinator.ts",
      "src/verification/application/verification-application.ts",
      "test/verification/audit.ts",
      "test/verification/changed.ts",
      "test/verification/changed-paths.ts",
      "test/verification/dag-scheduler.ts",
      "test/verification/executor.ts",
      "test/verification/focus.ts",
      "test/verification/integration.ts",
      "test/verification/plan-runner.ts",
      "test/verification/planner.ts",
      "test/verification/profile.ts",
      "test/verification/resource-coordinator.ts",
      "test/verification/run-node-tests.ts",
      "test/verification/test-files.ts",
      "test/verification/worker-budget.ts"
    ],
    "inputExclusions": []
  },
  "integration-runtime": {
    "inputs": [
      "test/integration/capability-contracts.test.ts",
      "test/integration/capability-runtime.test.ts",
      "test/integration/buildr-web-read-executor.test.ts",
      "test/integration/buildr-web-runtime.test.ts",
      "test/integration/buildr-web-workspace.test.ts",
      "test/integration/preview-ownership.test.ts",
      "test/integration/runtime-skills.test.ts",
      "test/integration/task-record-http-contract.test.ts",
      "test/integration/task-manager-capability-graph.test.ts",
      "test/integration/task-pre-create-git-capability-graph.test.ts",
      "test/integration/web-dist-verification.test.ts",
      "src/bootstrap/**",
      "src/infrastructure/contracts/json-schema-validator.ts",
      "src/task/module.ts",
      "src/task/interfaces/http/**",
      "src/agent-assets/infrastructure/runtime/**",
      "src/workspace/**",
      "src/web/**",
      "tools/contracts/**",
      "services/buildr-web/src/api/**",
      "services/buildr-web/src/App.tsx",
      "services/buildr-web/src/features/task-record/pages/TasksPage.tsx",
      "services/buildr-web/src/features/task-record/pages/TaskDetailPage.tsx",
      "services/buildr-web/src/features/task-record/components/shared.tsx",
      "test/verification/web-dist.ts",
      "resources/workspace/skills/buildr/task-manager/**",
      "resources/workspace/skills/buildr/task-triage/**"
    ],
    "inputExclusions": []
  },
  "integration-release": {
    "inputs": [
      "test/integration/open-source-release-filesystem.test.ts",
      "test/integration/product-installation-identity.test.ts",
      "test/integration/product-installation-registry.test.ts",
      "tools/release/**",
      "src/system/installation/application/product-installation-status.ts",
      "src/system/installation/application/npm-installation-enrollment.ts",
      "src/system/installation/**",
      "src/infrastructure/product-invocation/**",
      "src/infrastructure/product-resources/**"
    ],
    "inputExclusions": []
  },
  "integration-data-store": {
    "inputs": [
      "test/integration/workspace-management-fence.test.ts",
      "test/integration/workspace-sqlite.test.ts",
      "src/workspace/**",
      "src/infrastructure/index.ts",
      "src/infrastructure/sqlite/**"
    ],
    "inputExclusions": []
  },
  "integration-self-bootstrap": {
    "inputs": [
      "test/integration/self-bootstrap-closeout.test.ts",
      "skills/buildr-self-bootstrap-sync/**",
      "resources/workspace/skills/buildr/buildr-self-bootstrap-sync/**",
      "src/system/installation/application/release-awareness.ts"
    ],
    "inputExclusions": []
  },
  "integration-task-read-models": {
    "inputs": [
      "src/task/persistence/task-retrospective-document.ts",
      "src/task/application/task-review-application.ts",
      "src/task/persistence/task-review-repository.ts",
      "test/integration/task-review-repository.test.ts",
      "test/system/task-record-product.test.ts"
    ],
    "inputExclusions": []
  },
  "integration-task-coordination": {
    "inputs": [
      "test/integration/parent-coordination-application.test.ts",
      "test/integration/parent-coordination-repository.test.ts",
      "test/integration/publication-application.test.ts",
      "src/task/application/parent-coordination-application.ts",
      "src/task/domain/parent-coordination.ts",
      "src/system/publication/**"
    ],
    "inputExclusions": []
  },
  "integration-project-daily-progress": {
    "inputs": [
      "test/integration/project-daily-progress-application.test.ts",
      "src/workspace/domain/project-daily-progress.ts",
      "src/workspace/application/project-daily-progress-application.ts",
      "src/workspace/persistence/project-daily-progress-repository.ts",
      "src/workspace/interfaces/cli/project-daily-progress.ts",
      "src/workspace/interfaces/http/workspace-http.ts",
      "src/workspace/module.ts"
    ],
    "inputExclusions": []
  },
  "contract": {
    "inputs": [
      "test/contract/**",
      "test/verification/http-contract-fresh-build-inventory.ts",
      "test/fixtures/**",
      ".node-version",
      "preparation.yml",
      "verification.yml",
      "task-finish.yml",
      "src/infrastructure/sqlite/migrations/**",
      "src/bootstrap/module-registry.ts",
      "src/bootstrap/runtime.ts",
      "src/bootstrap/cli/registry.ts",
      "src/task/module.ts",
      "src/web/http/server.ts",
      ".github/workflows/publish.yml",
      ".github/workflows/verify.yml",
      "tools/release/release-authority.ts",
      "tools/release/release-authority-oidc-probe.ts",
      "tools/release/release-authority-preflight.ts",
      "tools/release/release-task-evidence-correlation.ts",
      "tools/release/release-transaction-evidence.ts",
      "tools/release/release-transaction-runner.ts",
      "tools/release/release-lifecycle.ts",
      "tools/release/release-phase-timeline.ts",
      "tools/release/release-orchestration-runner.ts",
      "tools/release/release-tag-ensure.ts",
      "tools/release/release-contract.ts",
      "tools/release/trusted-publish.ts",
      "src/system/installation/domain/release-version.ts",
      "src/agent-assets/infrastructure/runtime/render-claude-code.ts",
      "test/verification/candidate.ts",
      "test/verification/candidate-ci.ts",
      "test/verification/candidate-ci-evidence.ts",
      "test/verification/changed.ts",
      "test/verification/focus.ts",
      "test/verification/executor.ts",
      "test/verification/package/run.ts",
      "test/verification/plan-runner.ts",
      "test/verification/planner.ts",
      "test/verification/profile.ts",
      "test/verification/registry.ts",
      "test/verification/release/**",
      "test/verification/workspace/suites.ts",
      "test/verification/verify-buildr-product",
      "test/verification/verify-buildr-product-daily-full",
      "test/verification/verify-buildr-product-core",
      "test/verification/verify-buildr-product-fast",
      "test/verification/verify-buildr-product-ci",
      "tools/development/resolve-development-node",
      "tools/development/run-development-node",
      "tools/development/run-development-npm",
      "tools/development/run-development-npm.ts",
      "resources/manifest.yml",
      "resources/workspace/AGENTS.md",
      "resources/workspace/skills/**",
      "package/targets/runtime/skills/**",
      "skills/buildr-release/**",
      "docs/skill-capability-contracts.md",
      "package.json",
      "package-lock.json",
      "test/verification/ownership.ts"
    ],
    "inputExclusions": [],
    "preflightInputs": [
    ]
  },
  "system-verification-admission": {
    "inputs": [
      "test/system/verification-changed-paths.test.ts",
      "test/verification/candidate.ts",
      "test/verification/verify-buildr-product-daily-full",
      "test/verification/verify-buildr-product-core",
      "test/verification/dag-scheduler.ts",
      "test/verification/plan-runner.ts",
      "test/verification/planner.ts",
      "test/verification/product-provider-entry.ts",
      "test/verification/registry.ts",
      "src/verification/application/**",
      "test/verification/system-suites.ts",
      "test/verification/system.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts",
      "test/verification/ownership.ts"
    ],
    "inputExclusions": []
  },
  "system-verification-contracts": {
    "inputs": [
      "test/system/verification-resource-coordination.test.ts",
      "test/system/verification-timing.test.ts",
      "test/system/workspace-verification.test.ts",
      "test/verification/focus.ts",
      "test/verification/executor.ts",
      "test/verification/plan-runner.ts",
      "test/verification/resource-coordinator.ts",
      "test/verification/timing/**",
      "test/verification/workspace/**",
      "src/verification/infrastructure/capability-runner.ts",
      "src/verification/infrastructure/preparation-admission.ts",
      "src/verification/infrastructure/process-executor.ts",
      "src/verification/infrastructure/owned-process.ts",
      "src/verification/domain/verification-deadline.ts",
      "src/verification/infrastructure/resource-coordinator.ts",
      "src/verification/application/verification-application.ts",
      "test/verification/system-suites.ts",
      "test/verification/system.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "system-public-json-contracts": {
    "inputs": [
      "test/system/public-json-contracts.test.ts",
      "src/infrastructure/contracts/public-json.ts",
      "src/bootstrap/cli/**",
      "src/task/interfaces/cli/**",
      "test/verification/system-suites.ts",
      "test/verification/system.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "system-openspec-contract-audit": {
    "inputs": [
      "test/system/openspec-contract-audit.test.ts",
      "src/task/openspec/**",
      "test/verification/system-suites.ts",
      "test/verification/system.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "system-workspace-lifecycle": {
    "inputs": [
      "test/system/package-capability-retirement.test.ts",
      "test/system/project-product.test.ts",
      "test/system/service-product.test.ts",
      "test/system/workspace-manifest-registry.test.ts",
      "src/workspace/**",
      "src/infrastructure/platform.ts",
      "src/infrastructure/product-layout.ts",
      "test/helpers/prepared-fixtures.ts",
      "test/helpers/workspace-product-suite.ts",
      "test/verification/system-suites.ts",
      "test/verification/system.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "system-task-lifecycle": {
    "inputs": [
      "src/task/persistence/task-repository.ts",
      "src/task/persistence/task-project-repository.ts",
      "src/task/persistence/task-service-repository.ts",
      "src/task/persistence/task-change-repository.ts",
      "test/system/task-record-change-resolver.test.ts",
      "test/system/task-record-buildr-web.test.ts",
      "test/system/task-record-product.test.ts",
      "test/system/task-review-product.test.ts",
      "test/system/task-verification-product.test.ts",
      "test/system/product-verification-provider-cli.test.ts",
      "src/bootstrap/**",
      "src/task/change/**",
      "test/helpers/task-record-system-fixture.ts",
      "test/helpers/task-verification-result-fixture.ts",
      "src/task/module.ts",
      "src/task/domain/task.ts",
      "src/task/domain/task-project.ts",
      "src/task/domain/task-service.ts",
      "src/task/domain/task-change.ts",
      "src/task/domain/task-verification.ts",
      "src/task/domain/task-review.ts",
      "src/task/domain/parent-coordination.ts",
      "src/task/application/task-verification-application.ts",
      "src/task/application/task-review-application.ts",
      "src/task/application/parent-coordination-application.ts",
      "src/task/application/task-query-application.ts",
      "src/task/application/task-command-application.ts",
      "src/task/application/task-dto.ts",
      "src/task/application/task-validation.ts",
      "src/task/interfaces/cli/task.ts",
      "src/task/interfaces/cli/task-review.ts",
      "src/task/interfaces/cli/task-verification.ts",
      "src/task/interfaces/cli/parent-coordination.ts",
      "src/task/interfaces/http/**",
      "test/verification/system-suites.ts",
      "test/verification/system.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "system-worktree-lifecycle": {
    "inputs": [
      "test/system/worktree-create.test.ts",
      "src/task/infrastructure/**",
      "src/infrastructure/git/**",
      "test/helpers/workspace-product-suite.ts",
      "test/verification/system-suites.ts",
      "test/verification/system.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "system-runtime-recovery": {
    "inputs": [
      "test/system/cli-update.test.ts",
      "test/system/runtime-target-authority.test.ts",
      "test/system/workspace-runtime-recovery.test.ts",
      "src/system/installation/application/cli-update.ts",
      "src/system/installation/application/release-awareness.ts",
      "src/agent-assets/application/runtime-projection.ts",
      "src/infrastructure/filesystem/**",
      "src/infrastructure/network/**",
      "src/agent-assets/infrastructure/runtime/**",
      "test/verification/system-suites.ts",
      "test/verification/system.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "system-buildr-web-http": {
    "inputs": [
      "test/system/buildr-web-http.test.ts",
      "test/system/task-professional-http-contract.test.ts",
      "test/system/workspace-buildr-web-http.test.ts",
      "src/bootstrap/**",
      "src/workspace/module.ts",
      "src/workspace/interfaces/http/**",
      "src/task/module.ts",
      "src/task/change/interfaces/http/**",
      "src/task/interfaces/http/**",
      "src/system/publication/interfaces/http/**",
      "src/web/http/**",
      "src/infrastructure/sqlite/**",
      "services/buildr-web/src/api/**",
      "test/helpers/workspace-product-suite.ts",
      "test/verification/system-suites.ts",
      "test/verification/system.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "system-app-process": {
    "inputs": [
      "test/system/development-workspace-smoke-isolation.test.ts",
      "test/system/buildr-web-channel-isolation.test.ts",
      "test/system/buildr-web-launcher.test.ts",
      "test/system/workspace-app-process.test.ts",
      "src/web/**",
      "src/infrastructure/process.ts",
      "package/launchers/**",
      "tools/development/run-isolated-workspace-smoke.ts",
      "tools/development/workspace-smoke.ts",
      "test/fixtures/failing-workspace-smoke.ts",
      "test/helpers/workspace-product-suite.ts",
      "test/verification/system-suites.ts",
      "test/verification/system.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "system-windows-platform": {
    "inputs": [
      "test/system/cli-update.test.ts",
      "test/system/buildr-web-launcher.test.ts",
      "test/system/workspace-runtime-recovery.test.ts",
      "test/system/worktree-create.test.ts",
      "test/helpers/task-finish-sqlite-fixture.ts",
      "src/system/installation/application/cli-update.ts",
      "src/task/application/finish/**",
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
      "src/web/http/server.ts",
      "src/web/**",
      "src/task/**",
      "src/infrastructure/contracts/public-json.ts",
      "resources/**",
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
      "test/verification/openspec/spec-quality.ts"
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
      "src/agent-assets/application/runtime.ts",
      "src/system/doctor/application/runtime-diagnostics.ts",
      "test/verification/runtime/adapter-contract.ts",
      "package/targets/runtime/**",
      "docs/agent-runtime-adapters.md"
    ],
    "inputExclusions": []
  },
  "integration-candidate-release": {
    "inputs": [
      "test/integration-candidate-release/**",
      "tools/release/release-git-convergence.ts",
      "tools/release/release-authority.ts",
      "tools/release/release-contract.ts",
      "tools/release/release-task-evidence-correlation.ts",
      "tools/release/release-transaction-evidence.ts",
      "tools/release/release-transaction-runner.ts",
      "tools/release/release-lifecycle.ts",
      "tools/release/release-phase-timeline.ts",
      "tools/release/release-orchestration-runner.ts",
      "tools/release/release-convergence.ts",
      "tools/release/release-files.ts",
      "tools/release/release-notes.ts",
      "src/system/installation/domain/release-version.ts"
    ],
    "inputExclusions": []
  },
  "concurrent-task-acceptance": {
    "inputs": [
      "test/verification/concurrency/**",
      "test/helpers/child-process-supervisor.ts",
      "test/helpers/clean-product-source.ts",
      "src/task/infrastructure/**",
      "src/task/application/task-verification-application.ts",
      "src/verification/application/**",
      "src/web/application/preview-lifecycle.ts",
      "openspec/specs/concurrent-task-acceptance/**",
      "openspec/specs/task-environments/**"
    ],
    "inputExclusions": []
  },
  "host-node-contract": {
    "inputs": [
      "package.json",
      "test/verification/host-node/**",
      "test/verification/host-node.ts"
    ],
    "inputExclusions": []
  },
  "host-node-boundaries": {
    "inputs": [
      "test/integration/process-infrastructure.test.ts",
      "test/integration/workspace-sqlite.test.ts",
      "src/infrastructure/process.ts",
      "src/infrastructure/filesystem/**",
      "src/infrastructure/sqlite/**",
      "test/verification/host-node.ts",
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
      "tools/release/application-payload.ts",
      "tools/release/application-payload-entry.ts",
      "tools/release/release-artifact.ts",
      "src/**",
      "resources/**",
      "package/**",
      "test/verification/release/candidate-package.ts",
      "test/verification/executor.ts",
      ".github/workflows/publish.yml"
    ],
    "inputExclusions": [
      "package/launchers/**"
    ]
  },
  "application-payload-release": {
    "inputs": [
      "tools/release/application-payload.ts",
      "tools/release/application-payload-entry.ts",
      "tools/release/release-artifact.ts",
      "src/**",
      "resources/**",
      "package/**",
      "test/integration/application-payload-release.test.ts",
      "test/verification/release/candidate-package.ts",
      "test/verification/executor.ts",
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
      "src/system/installation/interfaces/cli/launcher.ts",
      "src/web/http/server.ts",
      "tools/release/application-payload.ts",
      "tools/release/application-payload-entry.ts",
      "test/integration/npm-launcher.test.ts",
      "test/verification/release/release-smoke.ts",
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
      "src/workspace/application/workspace-operations.ts",
      "package.json",
      "package-lock.json",
      "test/verification/host-node.ts",
      "test/verification/host-node/**",
      "test/verification/release/candidate-package.ts"
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
      "test/verification/openspec/contract-audit.ts"
    ],
    "inputExclusions": []
  },
  "managed-mutations": {
    "inputs": [
      "src/infrastructure/testing/context-runtime/node-test.ts",
      "src/infrastructure/testing/context-runtime/node-runner.ts",
      "src/agent-assets/application/package-maintenance/**",
      "src/workspace/application/workspace-operations.ts",
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
      "test/capability-cli.integration.ts",
      "src/agent-assets/application/package-maintenance/package-assets.ts",
      "src/agent-assets/application/skills.ts",
      "src/system/doctor/application/capability-diagnostics.ts",
      "src/agent-assets/application/package-maintenance/builtin-lifecycle.ts",
      "src/agent-assets/application/package-maintenance/static-validation.ts",
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
      "test/commands-cli.integration.ts",
      "src/agent-assets/application/commands.ts",
      "src/agent-assets/application/components.ts",
      "src/agent-assets/application/skills.ts",
      "src/workspace/**",
      "src/system/doctor/**",
      "src/bootstrap/cli/help.ts",
      "resources/manifest.yml"
    ],
    "inputExclusions": []
  },
  "openspec-contract-fixtures": {
    "inputs": [
      "src/task/openspec/application/openspec-application.ts",
      "src/task/openspec/application/**",
      "test/verification/openspec/contract.ts",
      "resources/workspace/skills/buildr/openspec-contract-guard/**"
    ],
    "inputExclusions": []
  },
  "openspec-convergence-recovery": {
    "inputs": [
      "src/task/openspec/application/openspec-application.ts",
      "src/task/openspec/application/**",
      "test/verification/openspec/contract.ts",
      "resources/workspace/skills/buildr/openspec-contract-guard/**",
      "resources/workspace/skills/buildr/current-knowledge-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-static": {
    "inputs": [
      "resources/**",
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
      "src/workspace/application/workspace-operations.ts",
      "src/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-commands": {
    "inputs": [
      "resources/workspace/commands/**",
      "src/agent-assets/application/commands.ts",
      "src/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-rules": {
    "inputs": [
      "resources/workspace/rules/**",
      "src/agent-assets/application/rules.ts",
      "src/agent-assets/infrastructure/runtime/**",
      "src/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-skills": {
    "inputs": [
      "resources/workspace/skills/**",
      "package/targets/runtime/skills/**",
      "src/agent-assets/application/skills.ts",
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
      "src/agent-assets/application/runtime.ts",
      "src/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "runtime-skill-projection": {
    "inputs": [
      "test/verification/runtime/skill-projection.ts",
      "test/verification/runtime/fixture.ts",
      "resources/manifest.yml",
      "resources/workspace/skills/buildr/**",
      "resources/workspace/skills/openspec/**"
    ],
    "inputExclusions": []
  },
  "runtime-adapter-parity": {
    "inputs": [
      "src/agent-assets/infrastructure/runtime/**",
      "src/agent-assets/application/runtime.ts",
      "src/system/doctor/application/runtime-diagnostics.ts",
      "test/verification/runtime/adapter-parity.ts",
      "test/verification/runtime/fixture.ts",
      "package/targets/runtime/**",
      "resources/workspace/rules/**"
    ],
    "inputExclusions": []
  },
  "workspace-lifecycle": {
    "inputs": [
      "src/workspace/**",
      "src/agent-assets/application/commands.ts",
      "src/agent-assets/application/rules.ts",
      "src/agent-assets/application/skills.ts",
      "test/verification/workspace/fixture.ts",
      "test/verification/workspace/workspace-lifecycle.ts"
    ],
    "inputExclusions": []
  },
  "ownership-recovery": {
    "inputs": [
      "src/agent-assets/application/components.ts",
      "src/agent-assets/application/package-maintenance/**",
      "test/verification/workspace/fixture.ts",
      "test/verification/workspace/ownership-recovery.ts"
    ],
    "inputExclusions": []
  },
  "runtime-reconciliation": {
    "inputs": [
      "src/agent-assets/infrastructure/runtime/**",
      "src/agent-assets/application/runtime.ts",
      "test/verification/workspace/fixture.ts",
      "test/verification/workspace/runtime-reconciliation.ts",
      "package/targets/runtime/**",
      "resources/workspace/rules/**"
    ],
    "inputExclusions": []
  },
  "repository-onboarding": {
    "inputs": [
      "buildr",
      "tools/development/run-development-cli",
      "test/verification/onboarding/repository.ts",
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
      "src/workspace/application/workspace-operations.ts",
      "test/verification/onboarding/init.ts",
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
      "src/infrastructure/contracts/public-json.ts",
      "src/agent-assets/application/runtime.ts",
      "src/agent-assets/infrastructure/runtime/adapter-contract.ts",
      "test/verification/cli/compatibility.ts",
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
      "src/infrastructure/contracts/public-json.ts",
      "src/task/application/finish/task-finish-result-projection.ts",
      "src/task/application/finish/task-finish-self-bootstrap-projection.ts",
      "src/infrastructure/product-layout.ts",
      "test/verification/cli/package-parity.ts",
      "package.json",
      "package-lock.json"
    ],
    "inputExclusions": []
  },
  "service-branch-contract": {
    "inputs": [
      "src/workspace/**",
      "test/verification/onboarding/service-branch.ts",
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
      "src/bootstrap/cli/main.ts",
      "tools/release/application-payload-entry.ts",
      "src/agent-assets/application/skills.ts",
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
      "src/system/installation/application/cli-update.ts",
      "src/agent-assets/application/package-maintenance/**",
      "src/agent-assets/application/package-maintenance.ts",
      "src/workspace/application/workspace-operations.ts",
      "src/infrastructure/product-layout.ts",
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
      "src/agent-assets/application/package-maintenance.ts",
      "src/workspace/application/workspace-operations.ts",
      "src/agent-assets/application/commands.ts",
      "src/agent-assets/application/components.ts",
      "src/agent-assets/application/rules.ts",
      "src/agent-assets/application/skills.ts",
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
      "test/verification/docs/quality.ts"
    ],
    "inputExclusions": []
  }
}).map(([id, value]: any) => [id, freezeOwnership(value)]),
));

export const VERIFICATION_IGNORED_INPUTS: any = Object.freeze([
  "node_modules/**",
  ".buildr/**",
  ".gitignore"
]);

export const VERIFICATION_GOVERNED_REPOSITORY_INPUTS: any = Object.freeze([
  ".github/workflows/publish.yml",
  ".github/workflows/verify.yml"
]);

const fullScopeAuthority: any = (pattern: any, code: any, explanation: any) => Object.freeze({ pattern, code, explanation });

export const VERIFICATION_FULL_SCOPE_AUTHORITIES: any = Object.freeze([
  fullScopeAuthority('.github/workflows/verify.yml', 'execution-graph-change', 'Candidate and development verification workflow topology changed.'),
  fullScopeAuthority('.node-version', 'execution-foundation-change', 'The retained Product development Node authority changed.'),
  fullScopeAuthority('preparation.yml', 'project-preparation-entry-change', 'Project preparation entry authority changed.'),
  fullScopeAuthority('verification.yml', 'verification-authority-change', 'Public verification capability authority changed.'),
  fullScopeAuthority('package.json', 'package-execution-metadata-change', 'non-version package metadata changes may affect scripts, dependencies, or execution semantics.'),
  fullScopeAuthority('package-lock.json', 'package-execution-metadata-change', 'non-version package metadata changes may affect locked dependencies or execution semantics.'),
  ...[
    'tsconfig.json', 'tsconfig.test-context.json', 'test-context.mjs',
    'src/infrastructure/testing/context-runtime/**', 'tools/build/**',
    'tools/contracts/**', 'tools/testing/test-context-build.ts', 'test/context/**',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'execution-foundation-change', 'Shared TypeScript or Test Context execution foundation changed.')),
  ...[
    'test/verification/verify-buildr-product', 'test/verification/verify-buildr-product-daily-full',
    'test/verification/verify-buildr-product-core', 'test/verification/verify-buildr-product-fast',
    'test/verification/verify-buildr-product-ci', 'test/verification/candidate.ts',
    'test/verification/candidate-ci.ts', 'test/verification/candidate-ci-evidence.ts',
    'test/verification/dag-scheduler.ts', 'test/verification/executor.ts',
    'test/verification/plan-runner.ts', 'test/verification/profile.ts',
    'test/verification/registry.ts', 'test/verification/resource-coordinator.ts',
    'test/verification/timing/parallel-runner.ts',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'execution-graph-change', 'Verification execution graph, profile, scheduler, executor, or resource semantics changed.')),
  ...[
    'test/verification/changed.ts', 'test/verification/changed-paths.ts', 'test/verification/planner.ts',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'selection-authority-change', 'Affected and full selection authority changed.')),
  fullScopeAuthority('test/verification/ownership.ts', 'ownership-authority-change', 'Changed path ownership and full-scope authority changed.'),
  ...[
    'tools/development/resolve-development-node', 'tools/development/run-development-node',
    'tools/development/run-development-npm', 'tools/development/run-development-npm.ts',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'runtime-authority-change', 'Development runtime invocation authority changed.')),
]);

export const VERIFICATION_FULL_SCOPE_INPUTS: any = Object.freeze(VERIFICATION_FULL_SCOPE_AUTHORITIES.map((item: any) => item.pattern));

export const VERIFICATION_DELEGATED_INPUTS: any = Object.freeze([
  {
    "owner": "product.browser-smoke",
    "inputs": [
      "test/browser-smoke/**",
      "test/verification/browser-selector-dispatcher.ts",
      "test/verification/web-dist.ts"
    ]
  }
].map((item: any) => Object.freeze({ owner: item.owner, inputs: Object.freeze(item.inputs) })));

export const VERIFICATION_PRODUCTION_OWNER_ALLOWLIST: any = Object.freeze([
  {
    "path": "src/infrastructure/contracts/declaration-intake.ts",
    "owner": "unit",
    "reason": "The trigger is pure declaration selection glue; declaration Application and CLI behavior have separate owners."
  },
  {
    "path": "src/infrastructure/product-resources/index.ts",
    "owner": "application-payload-release",
    "reason": "The resource resolver is exercised directly by the application payload release verifier."
  }
].map((item: any) => Object.freeze(item)));

export const VERIFICATION_SELECTION_METADATA_INPUTS: any = Object.freeze(['verification.yml', 'package.json', 'package-lock.json']);

export function verificationStepOwnership(id: any): any  {
  const value: any = VERIFICATION_STEP_OWNERSHIP[id];
  if (!value) throw new Error(`Missing verification ownership declaration: ${id}`);
  return value;
}

export function validateVerificationStepOwnership(stepIds: any): any  {
  const expected: any = new Set(stepIds);
  const findings: any[] = [];
  for (const id of expected) if (!VERIFICATION_STEP_OWNERSHIP[id]) findings.push({ step: id, code: 'missing_step_ownership' });
  for (const id of Object.keys(VERIFICATION_STEP_OWNERSHIP)) if (!expected.has(id)) findings.push({ step: id, code: 'unknown_step_ownership' });
  return Object.freeze({ ok: findings.length === 0, findings: Object.freeze(findings) });
}
