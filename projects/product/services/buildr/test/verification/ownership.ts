import { MACOS_SOURCE_BOUNDARY_INPUTS, WINDOWS_SOURCE_BOUNDARY_INPUTS } from './platform-boundaries.ts';
const freezeOwnership: any = (value: any) => Object.freeze({
  inputs: Object.freeze(value.inputs),
  inputExclusions: Object.freeze(value.inputExclusions),
  preflightInputs: Object.freeze(value.preflightInputs ?? []),
});

export const VERIFICATION_STEP_OWNERSHIP: any = Object.freeze(Object.fromEntries(
  Object.entries({
  "typecheck": {
    "inputs": [
      "skills/buildr-release/scripts/release-targets.ts",
      "skills/buildr-release/scripts/package-compatibility.ts",
      "skills/buildr-release/scripts/package-artifact-observation.ts",
      "skills/buildr-release/scripts/release-package-evidence.ts",
      "skills/buildr-release/scripts/plugin-hosted-release.ts",
      "skills/buildr-release/scripts/package-release-operation.ts",
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
      "skills/buildr-release/scripts/release-targets.ts",
      "skills/buildr-release/scripts/package-compatibility.ts",
      "skills/buildr-release/scripts/package-artifact-observation.ts",
      "skills/buildr-release/scripts/release-package-evidence.ts",
      "skills/buildr-release/scripts/plugin-hosted-release.ts",
      "skills/buildr-release/scripts/package-release-operation.ts",
      "test/unit/**",
      "src/**",
      "services/buildr-web/**",
      "test/verification/dag-scheduler.ts",
      "test/verification/verification-reuse.ts",
      "test/verification/verification-source-inputs.ts",
      "test/verification/verification-inputs.ts",
      "test/verification/source.ts",
      "test/verification/local-source-verification.ts",
      "test/verification/planner.ts",
      "test/verification/cli.ts",
      "test/verification/test-files.ts",
      "test/verification/run-node-tests.ts",
      "test/verification/resource-coordinator.ts",
      "test/verification/registry.ts",
      "test/verification/browser-selector-dispatcher.ts",
      "test/verification/browser-selector-catalog.ts",
      "test/verification/unit-coverage.ts"
    ],
    "inputExclusions": []
  },
  "integration": {
    "inputs": [
      "services/buildr-agent/**",
      "test/integration/agent-service-delivery.test.ts",
      "test/integration/agent-service-http.test.ts",
      "src/modules/agent-service/**",
      "tools/build/**",
      "tools/codegen/**",
      "tools/testing/**",
      "tools/development/**",
      "tools/verification/candidate-environment.ts",
      "tools/verification/candidate-preparation-reuse.ts",
      "src/bootstrap/cli/identity.ts",
      "src/infrastructure/process.ts",
      "test/verification/worker-budget.ts",
      "test/verification/support/**",
      "test/verification/verification-reuse.ts",
      "test/verification/plan-runner.ts",
      "buildr"
    ],
    "inputExclusions": []
  },
  "integration-code": {
    "inputs": [
      "src/modules/installation/infrastructure/retire-legacy-agent-data.ts",
      "src/modules/code/**",
      "src/infrastructure/git/**",
      "src/modules/task/infrastructure/git-worktree-provider.ts",
      "test/helpers/code-git-configuration-fixture.ts",
      "test/helpers/code-operation-seeds.ts",
      "test/helpers/code-commit-application-fixture.ts",
      "test/helpers/code-sync-application-fixture.ts",
      "test/fixtures/code-commit-message-large-fixture.ts"
    ],
    "inputExclusions": []
  },
  "integration-knowledge": {
    "inputs": [
      "src/modules/knowledge/**",
      "knowledge/index.yml",
      "src/modules/agent-assets/application/source-query.ts",
      "src/modules/agent-assets/application/source-observations.ts",
      "src/modules/agent-assets/application/skill-content-query.ts",
      "src/modules/agent-assets/persistence/source-object-repository.ts",
      "src/modules/agent-assets/persistence/skill-content-repository.ts"
    ],
    "inputExclusions": []
  },
  "e2e-workspace-assets": {
    "inputs": ["src/modules/workspace/**", "src/modules/agent-assets/**", "src/infrastructure/filesystem/**", "src/infrastructure/product-resources/**", "resources/workspace/**", "tools/development/workspace-continuity-check.ts", "tools/development/run-isolated-workspace-check.ts", "test/helpers/asset-relationships.ts", "test/helpers/inline-core-fixture.ts"],
    "inputExclusions": []
  },
  "integration-workspace-assets": {
    "inputs": [
      "src/modules/workspace/**",
      "src/infrastructure/filesystem/finder-metadata.ts",
      "src/infrastructure/filesystem/atomic-files.ts",
      "src/infrastructure/filesystem/workspace-mutation.ts",
      "src/infrastructure/filesystem/workspace-path.ts",
      "src/infrastructure/product-resources/**",
      "src/infrastructure/semantic-version.ts",
      "tools/development/shared-resource-coexistence-check.ts",
      "src/modules/agent-assets/infrastructure/shared-skill-source.ts",
      "resources/workspace/AGENTS.md",
      "resources/workspace/components/**",
      "resources/workspace/skills/buildr/task-triage/**",
      "test/helpers/legacy-asset-catalog.ts", "test/helpers/asset-relationships.ts", "test/helpers/inline-core-fixture.ts"
    ],
    "inputExclusions": []
  },
  "integration-archify": {
    "inputs": [
      "src/infrastructure/filesystem/finder-metadata.ts",
      "src/modules/agent-assets/infrastructure/component-source.ts",
      "src/modules/agent-assets/infrastructure/runtime/**",
      "src/infrastructure/product-resources/**",
      "src/modules/agent-assets/application/package-maintenance/archify-retirement.ts",
      "src/modules/agent-assets/application/package-maintenance.ts",
      "src/modules/agent-assets/application/components.ts",
      "skills/buildr/archify/**",
      "test/helpers/archify-command-cost.ts",
      "tools/development/run-isolated-workspace-check.ts"
    ],
    "inputExclusions": []
  },
  "integration-task-records": {
    "inputs": [
      "src/modules/task/domain/**",
      "src/modules/task/materials/**",
      "src/modules/task/commits/**",
      "src/modules/task/changed-files/**",
      "src/modules/task/record/**",
      "src/modules/task/interfaces/http/**",
      "src/modules/workbench/**",
      "src/infrastructure/filesystem/markdown-images.ts",
      "src/infrastructure/sqlite/migrations/0026_migrate_legacy_parent_plan_history.sql"
    ],
    "inputExclusions": []
  },
  "integration-connections": {
    "inputs": [
      "src/modules/connection-skills/**",
      "src/modules/mysql-query/**",
      "src/modules/agent-assets/application/connection-skill-source.ts",
      "src/modules/agent-assets/application/connection-impact.ts",
      "bin/buildr-mysql.mjs",
      "resources/workspace/skills/connections/**",
      "resources/workspace/skills/buildr/connection-authoring/**",
      "test/fixtures/connection-skills-cli-check.ts",
      "test/fixtures/connection-authoring-cli-check.ts",
      "test/fixtures/connection-authoring-example/**"
    ],
    "inputExclusions": []
  },
  "integration-connections-cli": {
    "inputs": [
      "src/modules/connection-skills/**",
      "resources/workspace/skills/connections/**",
      "test/fixtures/connection-skills-cli-check.ts",
      "test/helpers/child-process-supervisor.ts",
      "test/verification/support/verification-deadline.ts",
      "tools/development/run-isolated-workspace-check.ts",
      "tools/development/isolated-workspace-state.ts"
    ],
    "inputExclusions": []
  },
  "integration-runtime-projection": {
    "inputs": [
      "src/infrastructure/filesystem/finder-metadata.ts",
      "src/modules/agent-assets/infrastructure/runtime/**",
      "src/modules/agent-assets/application/runtime-selection.ts",
      "src/modules/agent-assets/persistence/skill-manifest.ts",
      "src/modules/agent-assets/persistence/capability-graph-repository.ts",
      "src/modules/agent-assets/interfaces/cli/agent-assets.ts",
      "src/infrastructure/filesystem/exclusive-file-lock.ts",
      "resources/manifest.yml",
      "resources/workspace/skills/**",
      "resources/runtime/**"
    ],
    "inputExclusions": []
  },
  "integration-declarations": {
    "inputs": [
      "test/integration/core-diagnostics-and-package.test.ts",
      "test/integration/project-verification-map.test.ts",
      "src/modules/project-testing/**",
      "src/modules/diagnostics/application/diagnostics.ts",
      "src/modules/diagnostics/application/result-model.ts",
      "src/modules/diagnostics/application/scope-diagnostics.ts",
      "tools/verification/package-check/verification-registry.ts"
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
      "src/modules/task/change/**",
      "src/modules/task/materials/application/task-project-document-reader.ts",
      "src/modules/openspec/**"
    ],
    "inputExclusions": []
  },
  "integration-verification": {
    "inputs": [
      "test/register-development-entry.ts",
      "tools/development/isolated-workspace-state.ts",
      "test/integration/candidate-artifact-reuse.test.ts",
      "test/integration/verification-reuse.test.ts",
      "test/integration/verification-source-inputs.test.ts",
      "test/integration/verification-artifact.test.ts",
      "test/integration/verification-input-boundaries.test.ts",
      "test/verification/verification-input-discovery.ts",
      "test/verification/platform-boundaries.ts",
      "test/integration/task-verification-report.test.ts",
      "test/integration/verification-resource-coordinator.test.ts",
      "test/integration/test-context-runtime.test.ts",
      "test/integration/node-test-context-host.test.ts",
      "test/integration/verification-test-files.test.ts",
      "test/integration/frontend-logic-worker-budget.test.ts",
      "test/integration/browser-candidate.test.ts",
      "test/integration/docs-quality.test.ts",
      "test/context/**",
      "test/fixtures/node-test-context/**",
      "test-context.mjs",
      "src/infrastructure/testing/context-runtime/**",
      "tools/build/**",
      "tools/testing/test-context-build.ts",
      "tsconfig.test-context.json",
      "src/modules/project-testing/infrastructure/capability-runner.ts",
      "test/verification/support/process-executor.ts",
      "test/verification/support/owned-process.ts",
      "test/verification/support/verification-deadline.ts",
      "src/modules/project-testing/domain/verification-plan.ts",
      "src/modules/project-testing/infrastructure/preparation-admission.ts",
      "test/verification/support/resource-coordinator.ts",
      "src/modules/project-testing/application/verification-application.ts",
      "test/verification/audit.ts",
      "test/verification/changed-paths.ts",
      "test/verification/dag-scheduler.ts",
      "test/verification/executor.ts",
      "test/verification/plan-runner.ts",
      "test/verification/planner.ts",
      "test/verification/cli.ts",
      "test/verification/resource-coordinator.ts",
      "test/verification/run-node-tests.ts",
      "test/verification/test-files.ts",
      "test/verification/worker-budget.ts",
      "services/buildr-web/tools/run-logic-tests.mjs",
      "test/verification/release/browser-candidate.ts",
      "test/verification/docs/quality.ts"
    ],
    "inputExclusions": []
  },
  "integration-runtime": {
    "inputs": [
      "src/modules/service-runtime/**",
      "test/helpers/service-runtime-fixture.ts",
      "src/bootstrap/**",
      "src/web/**",
      "src/modules/workspace/**",
      "src/infrastructure/contracts/json-schema-validator.ts",
      "src/modules/task/module.ts",
      "tools/build/web-dist.ts",
      "test/verification/web-dist.ts",
      "services/buildr-web/src/features/task/hooks/useTaskRequestLifecycle.ts"
    ],
    "inputExclusions": []
  },
  "integration-release": {
    "inputs": [
      "test/integration/open-source-release-filesystem.test.ts",
      "test/integration/product-installation-identity.test.ts",
      "test/integration/development-runtime-inputs.test.ts",
      "test/integration/product-installation-registry.test.ts",
      "test/integration/update-flow-http-contract.test.ts",
      "test/integration/update-flow-recovery.test.ts",
      "test/integration/workspace-cli-routing.test.ts",
      "skills/buildr-release/scripts/**",
      "src/modules/installation/application/product-installation-status.ts",
      "src/modules/installation/application/npm-installation-enrollment.ts",
      "src/modules/installation/**",
      "src/infrastructure/product-invocation/**",
      "src/infrastructure/product-resources/**"
    ],
    "inputExclusions": []
  },
  "integration-data-store": {
    "inputs": [
      "test/integration/workspace-management-fence.test.ts",
      "test/integration/workspace-sqlite.test.ts",
      "test/integration/task-read-snapshot.test.ts",
      "src/modules/workspace/**",
      "src/infrastructure/index.ts",
      "src/infrastructure/sqlite/**"
    ],
    "inputExclusions": []
  },
  "integration-self-bootstrap": {
    "inputs": [
      "test/integration/self-bootstrap-closeout.test.ts",
      "src/modules/installation/infrastructure/development-runtime-inputs.ts",
      "skills/buildr-self-bootstrap-sync/**",
      "resources/workspace/skills/buildr/buildr-self-bootstrap-sync/**",
      "src/modules/installation/application/release-awareness.ts"
    ],
    "inputExclusions": []
  },
  "integration-task-read-models": {
    "inputs": [
      "src/modules/task/persistence/task-retrospective-document.ts",
      "src/modules/task/application/task-review-application.ts",
      "src/modules/task/persistence/task-review-repository.ts",
      "test/integration/task-review-repository.test.ts",
      "test/e2e/task-record-product.test.ts"
    ],
    "inputExclusions": []
  },
  "integration-task-coordination": {
    "inputs": [
      "test/integration/parent-coordination-application.test.ts",
      "test/integration/parent-coordination-repository.test.ts",
      "test/integration/publication-application.test.ts",
      "src/modules/task/application/parent-coordination-application.ts",
      "src/modules/task/domain/parent-coordination.ts",
      "src/modules/publication/**"
    ],
    "inputExclusions": []
  },
  "source-contracts": {
    "inputs": [
      "knowledge/index.yml",
      "test/static/**",
      "test/helpers/clean-product-source.ts",
      "test/helpers/legacy-asset-catalog.ts",
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
      "src/modules/task/module.ts",
      "src/web/http/server.ts",
      ".github/workflows/publish.yml",
      ".github/workflows/verify.yml",
      "skills/buildr-release/scripts/release-authority.ts",
      "skills/buildr-release/scripts/release-authority-oidc-probe.ts",
      "skills/buildr-release/scripts/release-authority-preflight.ts",
      "skills/buildr-release/scripts/release-task-evidence-correlation.ts",
      "skills/buildr-release/scripts/release-transaction-evidence.ts",
      "skills/buildr-release/scripts/release-transaction-runner.ts",
      "skills/buildr-release/scripts/release-lifecycle.ts",
      "skills/buildr-release/scripts/release-phase-timeline.ts",
      "skills/buildr-release/scripts/release-orchestration-runner.ts",
      "skills/buildr-release/scripts/release-tag-ensure.ts",
      "skills/buildr-release/scripts/release-contract.ts",
      "skills/buildr-release/scripts/trusted-publish.ts",
      "src/modules/installation/domain/release-version.ts",
      "src/infrastructure/semantic-version.ts",
      "src/modules/agent-assets/infrastructure/runtime/render-claude-code.ts",
      "test/verification/candidate.ts",
      "test/verification/candidate-ci.ts",
      "test/verification/candidate-ci-evidence.ts",
      "test/verification/executor.ts",
      "test/verification/package/run.ts",
      "test/verification/plan-runner.ts",
      "test/verification/planner.ts",
      "test/verification/cli.ts",
      "test/verification/registry.ts",
      "test/verification/release/**",
      "test/verification/workspace/suites.ts",
      "test/verification/verify-buildr-product-ci",
      "tools/development/resolve-development-node",
      "tools/development/run-development-node",
      "tools/development/run-development-npm",
      "tools/development/run-development-npm.ts",
      "resources/manifest.yml",
      "resources/workspace/AGENTS.md",
      "resources/workspace/skills/**",
      "resources/runtime/skills/**",
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
  "integration-changed-paths": {
    "inputs": [
      "test/integration/verification-changed-paths.test.ts",
      "test/verification/candidate.ts",
      "test/verification/dag-scheduler.ts",
      "test/verification/plan-runner.ts",
      "test/verification/planner.ts",
      "test/verification/cli.ts",
      "test/verification/registry.ts",
      "src/modules/project-testing/application/**",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts",
      "test/verification/ownership.ts"
    ],
    "inputExclusions": []
  },
  "integration-verification-runtime": {
    "inputs": [
      "test/integration/verification-resource-coordination.test.ts",
      "test/integration/verification-timing.test.ts",
      "test/integration/workspace-verification.test.ts",
      "test/verification/executor.ts",
      "test/verification/plan-runner.ts",
      "test/verification/resource-coordinator.ts",
      "test/verification/timing/**",
      "test/verification/workspace/**",
      "src/modules/project-testing/infrastructure/capability-runner.ts",
      "src/modules/project-testing/infrastructure/preparation-admission.ts",
      "test/verification/support/process-executor.ts",
      "test/verification/support/owned-process.ts",
      "test/verification/support/verification-deadline.ts",
      "test/verification/support/resource-coordinator.ts",
      "src/modules/project-testing/application/verification-application.ts",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "integration-public-json": {
    "inputs": [
      "test/integration/public-json-contracts.test.ts",
      "src/infrastructure/contracts/public-json.ts",
      "src/bootstrap/cli/**",
      "src/modules/task/interfaces/cli/**",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "integration-openspec-audit": {
    "inputs": [
      "test/integration/openspec-contract-audit.test.ts",
      "src/modules/openspec/**",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "e2e-workspace": {
    "inputs": [
      "test/e2e/package-capability-retirement.test.ts",
      "test/fixtures/legacy-task-record-contract-v3.md",
      "test/e2e/project-product.test.ts",
      "test/e2e/service-product.test.ts",
      "test/e2e/workspace-manifest-registry.test.ts",
      "src/modules/workspace/**",
      "src/infrastructure/platform.ts",
      "src/infrastructure/product-layout.ts",
      "test/helpers/prepared-fixtures.ts",
      "test/helpers/legacy-asset-catalog.ts",
      "test/helpers/workspace-product-suite.ts",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "e2e-task": {
    "inputs": [
      "test/helpers/legacy-asset-catalog.ts",
      "src/modules/task/persistence/task-repository.ts",
      "src/modules/task/persistence/task-project-repository.ts",
      "src/modules/task/persistence/task-service-repository.ts",
      "src/modules/task/persistence/task-change-repository.ts",
      "test/system/task-record-change-resolver.test.ts",
      "test/e2e/task-record-buildr-web.test.ts",
      "test/e2e/task-commits.test.ts",
      "src/modules/task/commits/**",
      "test/e2e/task-record-product.test.ts",
      "test/e2e/task-review-product.test.ts",
      "test/e2e/task-verification-product.test.ts",
      "test/system/product-verification-provider-cli.test.ts",
      "src/bootstrap/**",
      "src/modules/task/change/**",
      "test/helpers/task-record-system-fixture.ts",
      "test/helpers/task-verification-result-fixture.ts",
      "src/modules/task/module.ts",
      "src/modules/task/domain/task.ts",
      "src/modules/task/domain/task-project.ts",
      "src/modules/task/domain/task-service.ts",
      "src/modules/task/domain/task-change.ts",
      "src/modules/task/domain/task-verification.ts",
      "src/modules/task/domain/task-review.ts",
      "src/modules/task/domain/parent-coordination.ts",
      "src/modules/task/application/task-verification-application.ts",
      "src/modules/task/application/task-review-application.ts",
      "src/modules/task/application/parent-coordination-application.ts",
      "src/modules/task/application/task-query-application.ts",
      "src/modules/task/application/task-command-application.ts",
      "src/modules/task/application/task-dto.ts",
      "src/modules/task/application/task-validation.ts",
      "src/modules/task/interfaces/cli/task.ts",
      "src/modules/task/interfaces/cli/task-review.ts",
      "src/modules/task/interfaces/cli/task-verification.ts",
      "src/modules/task/interfaces/cli/parent-coordination.ts",
      "src/modules/task/interfaces/http/**",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "e2e-worktree": {
    "inputs": [
      "test/e2e/worktree-create.test.ts",
      "src/modules/task/infrastructure/**",
      "src/infrastructure/git/**",
      "test/helpers/workspace-product-suite.ts",
      "test/helpers/clean-product-source.ts",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "e2e-nested-git": {
    "inputs": [
      "test/e2e/worktree-nested-git-isolation.test.ts",
      "test/e2e/non-git-workspace-continuity.test.ts",
      "tools/development/run-isolated-workspace-check.ts",
      "src/modules/task/infrastructure/**",
      "src/infrastructure/git/**",
      "test/helpers/workspace-product-suite.ts",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "e2e-runtime-recovery": {
    "inputs": [
      "test/e2e/cli-update.test.ts",
      "test/e2e/runtime-target-authority.test.ts",
      "test/e2e/web-update-flow.test.ts",
      "test/e2e/workspace-runtime-recovery.test.ts",
      "src/modules/installation/application/cli-update.ts",
      "src/modules/installation/application/release-awareness.ts",
      "src/modules/installation/application/update-flow.ts",
      "src/modules/installation/application/update-launcher.ts",
      "src/modules/installation/domain/update-flow-state.ts",
      "src/modules/installation/infrastructure/update-flow-store.ts",
      "src/modules/agent-assets/application/runtime-projection.ts",
      "src/infrastructure/filesystem/**",
      "src/infrastructure/network/**",
      "src/modules/agent-assets/infrastructure/runtime/**",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "integration-web-http": {
    "inputs": [
      "test/integration/buildr-web-http.test.ts",
      "test/integration/task-professional-http-contract.test.ts",
      "test/integration/workspace-buildr-web-http.test.ts",
      "src/bootstrap/**",
      "src/modules/workspace/module.ts",
      "src/modules/workspace/interfaces/http/**",
      "src/modules/task/module.ts",
      "src/modules/task/change/interfaces/http/**",
      "src/modules/task/interfaces/http/**",
      "src/modules/publication/interfaces/http/**",
      "src/web/http/**",
      "src/infrastructure/sqlite/**",
      "services/buildr-web/src/api/**",
      "test/helpers/workspace-product-suite.ts",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "e2e-app-process": {
    "inputs": [
      "src/modules/installation/infrastructure/development-runtime-inputs.ts",
      "src/modules/installation/infrastructure/current-product-identity.ts",
      "src/modules/installation/infrastructure/installation-origin.ts",
      "test/integration/development-workspace-check-isolation.test.ts",
      "test/e2e/buildr-web-channel-isolation.test.ts",
      "test/e2e/buildr-web-launcher.test.ts",
      "test/e2e/workspace-app-process.test.ts",
      "src/web/**",
      "src/infrastructure/process.ts",
      "tools/build/launcher/**",
      "tools/development/run-isolated-workspace-check.ts",
      "tools/development/workspace-lifecycle-check.ts",
      "test/fixtures/failing-workspace-check.ts",
      "test/helpers/workspace-product-suite.ts",
      "test/verification/journey-suites.ts",
      "test/verification/journeys.ts",
      "test/helpers/task-lifecycle-system-context.ts",
      "test/verification/system-file-timing-reporter.ts"
    ],
    "inputExclusions": []
  },
  "integration-macos-native": { "inputs": MACOS_SOURCE_BOUNDARY_INPUTS, "inputExclusions": [] },
  "integration-windows-native": { "inputs": WINDOWS_SOURCE_BOUNDARY_INPUTS, "inputExclusions": [] },
  "cli-architecture": {
    "inputs": [
      "bin/**",
      "src/bootstrap/**",
      "src/modules/task/interfaces/cli/**",
      "src/web/http/server.ts",
      "src/web/**",
      "src/modules/task/**",
      "src/infrastructure/contracts/public-json.ts",
      "resources/**",
      "tools/**",
      "package/**",
      "test/verification/cli/**",
      "package.json"
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
      "src/modules/agent-assets/infrastructure/runtime/**",
      "src/modules/agent-assets/application/runtime.ts",
      "src/modules/diagnostics/application/runtime-diagnostics.ts",
      "test/verification/runtime/adapter-contract.ts",
      "resources/runtime/**",
      "docs/agent-runtime-adapters.md"
    ],
    "inputExclusions": []
  },
  "integration-candidate-release": {
    "inputs": [
      "skills/buildr-release/scripts/candidate-source-binding.ts",
      "skills/buildr-release/scripts/candidate-repair-operation.ts",
      "skills/buildr-release/scripts/release-failure.ts",
      "test/verification/candidate-repair.ts",
      "test/verification/candidate-repair-cli.ts",
      "skills/buildr-release/scripts/release-targets.ts",
      "skills/buildr-release/scripts/package-compatibility.ts",
      "skills/buildr-release/scripts/package-artifact-observation.ts",
      "skills/buildr-release/scripts/release-package-evidence.ts",
      "skills/buildr-release/scripts/plugin-hosted-release.ts",
      "skills/buildr-release/scripts/package-release-operation.ts",
      "skills/buildr-release/scripts/release-git-convergence.ts",
      "skills/buildr-release/scripts/release-authority.ts",
      "skills/buildr-release/scripts/release-contract.ts",
      "skills/buildr-release/scripts/release-task-evidence-correlation.ts",
      "skills/buildr-release/scripts/release-transaction-evidence.ts",
      "skills/buildr-release/scripts/release-transaction-runner.ts",
      "skills/buildr-release/scripts/release-lifecycle.ts",
      "skills/buildr-release/scripts/release-phase-timeline.ts",
      "skills/buildr-release/scripts/release-orchestration-runner.ts",
      "skills/buildr-release/scripts/release-convergence.ts",
      "skills/buildr-release/scripts/release-files.ts",
      "skills/buildr-release/scripts/release-notes.ts",
      "src/modules/installation/domain/release-version.ts"
    ],
    "inputExclusions": []
  },
  "integration-candidate-release-selection": {
    "inputs": [
      "skills/buildr-release/scripts/release-targets.ts",
      "skills/buildr-release/scripts/package-compatibility.ts",
      "skills/buildr-release/scripts/package-artifact-observation.ts",
      "skills/buildr-release/scripts/release-package-evidence.ts",
      "skills/buildr-release/scripts/plugin-hosted-release.ts",
      "skills/buildr-release/scripts/package-release-operation.ts",
      "skills/buildr-release/scripts/release-git-convergence.ts",
      "skills/buildr-release/scripts/release-authority.ts",
      "skills/buildr-release/scripts/release-contract.ts",
      "skills/buildr-release/scripts/release-task-evidence-correlation.ts",
      "skills/buildr-release/scripts/release-transaction-evidence.ts",
      "skills/buildr-release/scripts/release-transaction-runner.ts",
      "skills/buildr-release/scripts/release-lifecycle.ts",
      "skills/buildr-release/scripts/release-phase-timeline.ts",
      "skills/buildr-release/scripts/release-orchestration-runner.ts",
      "skills/buildr-release/scripts/release-convergence.ts",
      "skills/buildr-release/scripts/release-files.ts",
      "skills/buildr-release/scripts/release-notes.ts",
      "src/modules/installation/domain/release-version.ts"
    ],
    "inputExclusions": []
  },
  "integration-candidate-package-selection": {
    "inputs": [
      "skills/buildr-release/scripts/release-targets.ts",
      "skills/buildr-release/scripts/package-compatibility.ts",
      "skills/buildr-release/scripts/package-artifact-observation.ts",
      "skills/buildr-release/scripts/release-package-evidence.ts",
      "skills/buildr-release/scripts/plugin-hosted-release.ts",
      "skills/buildr-release/scripts/package-release-operation.ts",
      "skills/buildr-release/scripts/release-git-convergence.ts",
      "skills/buildr-release/scripts/release-authority.ts",
      "skills/buildr-release/scripts/release-contract.ts",
      "skills/buildr-release/scripts/release-task-evidence-correlation.ts",
      "skills/buildr-release/scripts/release-transaction-evidence.ts",
      "skills/buildr-release/scripts/release-transaction-runner.ts",
      "skills/buildr-release/scripts/release-lifecycle.ts",
      "skills/buildr-release/scripts/release-phase-timeline.ts",
      "skills/buildr-release/scripts/release-orchestration-runner.ts",
      "skills/buildr-release/scripts/release-convergence.ts",
      "skills/buildr-release/scripts/release-files.ts",
      "skills/buildr-release/scripts/release-notes.ts",
      "src/modules/installation/domain/release-version.ts"
    ],
    "inputExclusions": []
  },
  "integration-candidate-release-effects": {
    "inputs": [
      "skills/buildr-release/scripts/release-targets.ts",
      "skills/buildr-release/scripts/package-compatibility.ts",
      "skills/buildr-release/scripts/package-artifact-observation.ts",
      "skills/buildr-release/scripts/release-package-evidence.ts",
      "skills/buildr-release/scripts/plugin-hosted-release.ts",
      "skills/buildr-release/scripts/package-release-operation.ts",
      "skills/buildr-release/scripts/release-git-convergence.ts",
      "skills/buildr-release/scripts/release-authority.ts",
      "skills/buildr-release/scripts/release-contract.ts",
      "skills/buildr-release/scripts/release-task-evidence-correlation.ts",
      "skills/buildr-release/scripts/release-transaction-evidence.ts",
      "skills/buildr-release/scripts/release-transaction-runner.ts",
      "skills/buildr-release/scripts/release-lifecycle.ts",
      "skills/buildr-release/scripts/release-phase-timeline.ts",
      "skills/buildr-release/scripts/release-orchestration-runner.ts",
      "skills/buildr-release/scripts/release-convergence.ts",
      "skills/buildr-release/scripts/release-files.ts",
      "skills/buildr-release/scripts/release-notes.ts",
      "src/modules/installation/domain/release-version.ts"
    ],
    "inputExclusions": []
  },
  "integration-candidate-git-convergence": {
    "inputs": [
      "skills/buildr-release/scripts/release-targets.ts",
      "skills/buildr-release/scripts/package-compatibility.ts",
      "skills/buildr-release/scripts/package-artifact-observation.ts",
      "skills/buildr-release/scripts/release-package-evidence.ts",
      "skills/buildr-release/scripts/plugin-hosted-release.ts",
      "skills/buildr-release/scripts/package-release-operation.ts",
      "skills/buildr-release/scripts/release-git-convergence.ts",
      "skills/buildr-release/scripts/release-authority.ts",
      "skills/buildr-release/scripts/release-contract.ts",
      "skills/buildr-release/scripts/release-task-evidence-correlation.ts",
      "skills/buildr-release/scripts/release-transaction-evidence.ts",
      "skills/buildr-release/scripts/release-transaction-runner.ts",
      "skills/buildr-release/scripts/release-lifecycle.ts",
      "skills/buildr-release/scripts/release-phase-timeline.ts",
      "skills/buildr-release/scripts/release-orchestration-runner.ts",
      "skills/buildr-release/scripts/release-convergence.ts",
      "skills/buildr-release/scripts/release-files.ts",
      "skills/buildr-release/scripts/release-notes.ts",
      "src/modules/installation/domain/release-version.ts"
    ],
    "inputExclusions": []
  },
  "integration-candidate-git-selection": {
    "inputs": [
      "skills/buildr-release/scripts/release-targets.ts",
      "skills/buildr-release/scripts/package-compatibility.ts",
      "skills/buildr-release/scripts/package-artifact-observation.ts",
      "skills/buildr-release/scripts/release-package-evidence.ts",
      "skills/buildr-release/scripts/plugin-hosted-release.ts",
      "skills/buildr-release/scripts/package-release-operation.ts",
      "skills/buildr-release/scripts/release-git-convergence.ts",
      "skills/buildr-release/scripts/release-authority.ts",
      "skills/buildr-release/scripts/release-contract.ts",
      "skills/buildr-release/scripts/release-task-evidence-correlation.ts",
      "skills/buildr-release/scripts/release-transaction-evidence.ts",
      "skills/buildr-release/scripts/release-transaction-runner.ts",
      "skills/buildr-release/scripts/release-lifecycle.ts",
      "skills/buildr-release/scripts/release-phase-timeline.ts",
      "skills/buildr-release/scripts/release-orchestration-runner.ts",
      "skills/buildr-release/scripts/release-convergence.ts",
      "skills/buildr-release/scripts/release-files.ts",
      "skills/buildr-release/scripts/release-notes.ts",
      "src/modules/installation/domain/release-version.ts"
    ],
    "inputExclusions": []
  },
  "concurrent-task-acceptance": {
    "inputs": [
      "test/verification/concurrency/**",
      "test/helpers/child-process-supervisor.ts",
      "test/helpers/clean-product-source.ts",
      "src/modules/task/infrastructure/**",
      "src/modules/task/application/task-verification-application.ts",
      "src/modules/project-testing/application/**",
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
      "skills/buildr-release/scripts/application-payload.ts",
      "skills/buildr-release/scripts/application-payload-entry.ts",
      "skills/buildr-release/scripts/release-artifact.ts",
      "src/**",
      "resources/**",
      "package/**",
      "skills/buildr-release/scripts/candidate-package.ts",
      "test/verification/executor.ts",
      ".github/workflows/publish.yml"
    ],
    "inputExclusions": [
      "tools/build/launcher/**"
    ]
  },
  "integration-application-payload-source": {
    "inputs": [
      "skills/buildr-release/scripts/application-payload.ts",
      "skills/buildr-release/scripts/application-payload-entry.ts",
      "skills/buildr-release/scripts/release-artifact.ts",
      "src/**",
      "resources/**",
      "package/**",
      "test/integration/application-payload-source.test.ts",
      "test/helpers/generated-release-inputs.ts",
      "test/helpers/application-payload-release.ts",
      "skills/buildr-release/scripts/candidate-package.ts",
      "test/verification/executor.ts",
      ".github/workflows/publish.yml"
    ],
    "inputExclusions": [
      "tools/build/launcher/**"
    ]
  },
  "application-payload-artifact": {
    "inputs": [
      "skills/buildr-release/scripts/application-payload.ts",
      "skills/buildr-release/scripts/application-payload-entry.ts",
      "skills/buildr-release/scripts/release-artifact.ts",
      "src/**",
      "resources/**",
      "package/**",
      "test/integration/application-payload-artifact.test.ts",
      "test/helpers/application-payload-release.ts",
      "test/fixtures/test-context-consumer/**",
      "skills/buildr-release/scripts/candidate-package.ts",
      "test/verification/executor.ts",
      ".github/workflows/publish.yml"
    ],
    "inputExclusions": [
      "tools/build/launcher/**"
    ]
  },
  "application-payload-release": {
    "inputs": [
      "skills/buildr-release/scripts/application-payload.ts",
      "skills/buildr-release/scripts/application-payload-entry.ts",
      "skills/buildr-release/scripts/release-artifact.ts",
      "src/**",
      "resources/**",
      "package/**",
      "test/e2e/application-payload-release.test.ts",
      "test/helpers/legacy-asset-catalog.ts",
      "test/helpers/application-payload-release.ts",
      "skills/buildr-release/scripts/candidate-package.ts",
      "test/verification/executor.ts",
      ".github/workflows/publish.yml"
    ],
    "inputExclusions": [
      "tools/build/launcher/**"
    ]
  },
  "npm-launcher-candidate": {
    "inputs": [
      "src/modules/installation/**",
      "src/bootstrap/cli/identity.ts",
      "src/modules/installation/interfaces/cli/launcher.ts",
      "src/web/http/server.ts",
      "skills/buildr-release/scripts/application-payload.ts",
      "skills/buildr-release/scripts/application-payload-entry.ts",
      "test/integration/npm-launcher.test.ts",
      "test/verification/release/package-consumption.ts",
      ".github/workflows/publish.yml"
    ],
    "inputExclusions": []
  },
  "host-node-cli-consumption": {
    "inputs": [
      "buildr",
      "bin/buildr.mjs",
      "src/bootstrap/**",
      "src/modules/task/interfaces/cli/**",
      "src/modules/diagnostics/**",
      "src/modules/workspace/application/workspace-operations.ts",
      "package.json",
      "package-lock.json",
      "test/verification/host-node.ts",
      "test/verification/host-node/**",
      "skills/buildr-release/scripts/candidate-package.ts"
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
      "knowledge/archify/**/*.visual-check.json",
      "docs/cli-reference.md",
      "docs/cli-architecture.md",
      "docs/known-limitations.md",
      "docs/agent-runtime-adapters.md"
    ],
    "inputExclusions": []
  },
  "spec-change-consistency": {
    "inputs": [
      "openspec/**",
      "test/verification/openspec/spec-change-consistency.ts"
    ],
    "inputExclusions": []
  },
  "test-file-ownership": {
    "inputs": [
      "test/verification/integrity/test-file-ownership.ts",
      "test/verification/test-inventory-ownership.ts",
      "test/verification/test-files.ts",
      "test/verification/registry.ts",
      "test/verification/ownership.ts",
      "package.json",
      "test/**"
    ],
    "inputExclusions": []
  },
  "managed-mutations": {
    "inputs": [
      "test/verification/integrity/managed-mutations.ts",
      "test/verification/integrity/managed-mutation-analysis.ts",
      "src/modules/code/application/code-commit-application.ts",
      "src/modules/code/infrastructure/code-fetch-refs.ts",
      "src/modules/code/infrastructure/editable-file.ts",
      "src/modules/connection-skills/persistence/files.ts",
      "src/infrastructure/testing/context-runtime/node-test.ts",
      "src/infrastructure/testing/context-runtime/node-runner.ts",
      "src/modules/agent-assets/application/package-maintenance/**",
      "src/modules/workspace/application/workspace-operations.ts",
      "src/modules/workspace/persistence/**",
      "src/modules/workspace/interfaces/cli/**",
      "src/infrastructure/filesystem/**",
      "src/modules/agent-assets/infrastructure/runtime/**",
      "package.json"
    ],
    "inputExclusions": []
  },
  "capability-cli-integration": {
    "inputs": [
      "test/capability-cli.integration.ts",
      "src/modules/agent-assets/application/package-maintenance/package-assets.ts",
      "src/modules/agent-assets/application/skills.ts",
      "src/modules/diagnostics/application/capability-diagnostics.ts",
      "src/modules/agent-assets/application/package-maintenance/builtin-lifecycle.ts",
      "tools/verification/package-check/static-validation.ts",
      "src/modules/agent-assets/infrastructure/runtime/skills/**",
      "resources/workspace/skills/**",
      "resources/runtime/skills/**",
      "skills/**",
      "capabilities.yml"
    ],
    "inputExclusions": []
  },
  "commands-cli-integration": {
    "inputs": [
      "commands.yml",
      "test/commands-cli.integration.ts",
      "test/helpers/legacy-asset-catalog.ts",
      "src/modules/agent-assets/application/commands.ts",
      "src/modules/agent-assets/application/components.ts",
      "src/modules/agent-assets/application/skills.ts",
      "src/modules/workspace/**",
      "src/modules/diagnostics/**",
      "src/bootstrap/cli/help.ts",
      "resources/manifest.yml"
    ],
    "inputExclusions": []
  },
  "openspec-contract-fixtures": {
    "inputs": [
      "src/modules/openspec/application/openspec-application.ts",
      "src/modules/openspec/application/**",
      "test/verification/openspec/contract.ts",
      "test/fixtures/openspec-upstream.ts",
      "test/integration/openspec-*.test.ts",
      "package.json",
      "package-lock.json",
      "resources/workspace/skills/buildr/openspec-contract-guard/**"
    ],
    "inputExclusions": []
  },
  "openspec-convergence-recovery": {
    "inputs": [
      "src/modules/openspec/application/openspec-application.ts",
      "src/modules/openspec/application/**",
      "test/verification/openspec/contract.ts",
      "test/fixtures/openspec-upstream.ts",
      "test/integration/openspec-*.test.ts",
      "package.json",
      "package-lock.json",
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
      "src/modules/agent-assets/application/package-maintenance/**",
      "test/verification/package/**"
    ],
    "inputExclusions": []
  },
  "package-workspace": {
    "inputs": [
      "resources/manifest.yml",
      "resources/workspace/AGENTS.md",
      "resources/workspace/components/**",
      "src/modules/workspace/**",
      "src/modules/workspace/application/workspace-operations.ts",
      "src/modules/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-commands": {
    "inputs": [
      "resources/workspace/commands/**",
      "src/modules/agent-assets/application/commands.ts",
      "src/modules/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-rules": {
    "inputs": [
      "resources/workspace/rules/**",
      "src/modules/agent-assets/application/rules.ts",
      "src/modules/agent-assets/infrastructure/runtime/**",
      "src/modules/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-skills": {
    "inputs": [
      "src/infrastructure/filesystem/finder-metadata.ts",
      "resources/workspace/skills/**",
      "resources/runtime/skills/**",
      "src/modules/agent-assets/application/skills.ts",
      "src/modules/agent-assets/infrastructure/runtime/skills/**",
      "src/modules/agent-assets/application/package-maintenance/**"
    ],
    "inputExclusions": []
  },
  "package-runtime": {
    "inputs": [
      "src/modules/workspace/**",
      "tools/verification/package-check/runtime-checks.ts",
      "resources/runtime/**",
      "resources/workspace/rules/**",
      "src/modules/agent-assets/infrastructure/runtime/**",
      "src/modules/agent-assets/application/runtime.ts",
      "src/modules/agent-assets/application/package-maintenance/**"
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
      "src/modules/agent-assets/infrastructure/runtime/**",
      "src/modules/agent-assets/application/runtime.ts",
      "src/modules/diagnostics/application/runtime-diagnostics.ts",
      "test/verification/runtime/adapter-parity.ts",
      "test/verification/runtime/fixture.ts",
      "resources/runtime/**",
      "resources/workspace/rules/**"
    ],
    "inputExclusions": []
  },
  "workspace-lifecycle": {
    "inputs": [
      "src/modules/workspace/**",
      "src/modules/agent-assets/application/commands.ts",
      "src/modules/agent-assets/application/rules.ts",
      "src/modules/agent-assets/application/skills.ts",
      "test/verification/workspace/fixture.ts",
      "test/verification/workspace/workspace-lifecycle.ts",
      "test/helpers/legacy-asset-catalog.ts"
    ],
    "inputExclusions": []
  },
  "ownership-recovery": {
    "inputs": [
      "src/modules/agent-assets/application/components.ts",
      "src/modules/agent-assets/application/package-maintenance/**",
      "test/verification/workspace/fixture.ts",
      "test/verification/workspace/ownership-recovery.ts"
    ],
    "inputExclusions": []
  },
  "runtime-reconciliation": {
    "inputs": [
      "src/modules/agent-assets/infrastructure/runtime/**",
      "src/modules/agent-assets/application/runtime.ts",
      "test/verification/workspace/fixture.ts",
      "test/verification/workspace/runtime-reconciliation.ts",
      "resources/runtime/**",
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
      "src/modules/workspace/**",
      "src/modules/workspace/application/workspace-operations.ts",
      "test/verification/onboarding/init.ts",
      "test/helpers/legacy-asset-catalog.ts",
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
      "src/modules/workspace/interfaces/cli/**",
      "src/modules/task/interfaces/cli/**",
      "src/infrastructure/contracts/public-json.ts",
      "src/modules/agent-assets/application/runtime.ts",
      "src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts",
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
      "src/modules/workspace/interfaces/cli/**",
      "src/modules/task/interfaces/cli/**",
      "src/infrastructure/contracts/public-json.ts",
      "src/modules/task/application/finish/task-finish-result-projection.ts",
      "src/modules/task/application/finish/task-finish-self-bootstrap-projection.ts",
      "src/infrastructure/product-layout.ts",
      "test/verification/cli/package-parity.ts",
      "package.json",
      "package-lock.json"
    ],
    "inputExclusions": []
  },
  "artifact-browser-core": {
    "inputs": ["test/verification/release/browser-candidate.ts", "test/helpers/clean-product-source.ts"],
    "inputExclusions": []
  },
  "frontend-logic": {
    "inputs": ["services/buildr-web/**"],
    "inputExclusions": []
  },
  "service-branch-contract": {
    "inputs": [
      "src/modules/workspace/**",
      "test/verification/onboarding/service-branch.ts",
      "test/helpers/legacy-asset-catalog.ts",
      "services/manifest.yml"
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
      "skills/buildr-release/scripts/application-payload-entry.ts",
      "src/modules/agent-assets/application/skills.ts",
      "test/verification/network/**"
    ],
    "inputExclusions": []
  },
  "release-tarball-consumption": {
    "inputs": [
      "buildr",
      "bin/buildr.mjs",
      "src/bootstrap/**",
      "src/modules/task/interfaces/cli/**",
      "src/modules/installation/application/cli-update.ts",
      "src/modules/agent-assets/application/package-maintenance/**",
      "src/modules/agent-assets/application/package-maintenance.ts",
      "src/modules/workspace/application/workspace-operations.ts",
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
      "test/helpers/legacy-asset-catalog.ts",
      "src/modules/agent-assets/application/package-maintenance/**",
      "src/modules/agent-assets/application/package-maintenance.ts",
      "src/modules/workspace/application/workspace-operations.ts",
      "src/modules/agent-assets/application/commands.ts",
      "src/modules/agent-assets/application/components.ts",
      "src/modules/agent-assets/application/rules.ts",
      "src/modules/agent-assets/application/skills.ts",
      "src/modules/workspace/**",
      "src/modules/diagnostics/**",
      "src/infrastructure/filesystem/**",
      "src/modules/agent-assets/infrastructure/runtime/**",
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
  ".github/workflows/publish-dsh-plugin.yml",
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
    'tools/codegen/contracts/**', 'tools/testing/test-context-build.ts', 'test/context/**',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'execution-foundation-change', 'Shared TypeScript or Test Context execution foundation changed.')),
  ...[
    'test/verification/verify-buildr-product-ci', 'test/verification/candidate.ts',
    'test/verification/candidate-ci.ts', 'test/verification/candidate-ci-evidence.ts',
    'test/verification/candidate-repair.ts', 'test/verification/candidate-repair-cli.ts',
    'test/verification/verification-reuse.ts', 'test/verification/verification-inputs.ts',
    'test/verification/verification-source-inputs.ts',
    'test/verification/verification-input-discovery.ts', 'test/verification/platform-boundaries.ts',
    'test/verification/source.ts', 'test/verification/local-source-verification.ts',
    'test/verification/dag-scheduler.ts', 'test/verification/executor.ts',
    'test/verification/cli.ts', 'test/verification/development-aggregate.ts',
    'test/verification/plan-runner.ts',
    'test/verification/registry.ts', 'test/verification/resource-coordinator.ts',
    'test/verification/timing/parallel-runner.ts',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'execution-graph-change', 'Verification execution graph, profile, scheduler, executor, or resource semantics changed.')),
  ...[
    'test/verification/changed-paths.ts', 'test/verification/planner.ts',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'selection-authority-change', 'Affected and full selection authority changed.')),
  fullScopeAuthority('test/verification/ownership.ts', 'ownership-authority-change', 'Changed path ownership and full-scope authority changed.'),
  ...[
    'tools/development/resolve-development-node', 'tools/development/run-development-node',
    'tools/development/run-development-npm', 'tools/development/run-development-npm.ts',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'runtime-authority-change', 'Development runtime invocation authority changed.')),
]);

export const VERIFICATION_FULL_SCOPE_INPUTS: any = Object.freeze(VERIFICATION_FULL_SCOPE_AUTHORITIES.map((item: any) => item.pattern));

export const VERIFICATION_DELEGATED_INPUTS: any = Object.freeze([
  { owner: "product.native-boundaries", inputs: ["test/integration/*-boundaries.test.ts"] },
  {
    "owner": "product.browser-e2e",
    "inputs": [
      "test/e2e/**",
      "test/verification/browser-selector-dispatcher.ts",
      "test/verification/browser-selector-catalog.ts",
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

export function verificationStepOwnership(id: any, executor: any = null): any  {
  const value: any = VERIFICATION_STEP_OWNERSHIP[id];
  if (!value) throw new Error(`Missing verification ownership declaration: ${id}`);
  // The executing file selectors are also changed-path inputs; do not maintain
  // a second hand-copied membership list beside the primary suite registry.
  const members: string[] = executor?.files ?? executor?.discoveredFiles
    ?? (executor?.file === 'test/verification/run-node-tests.ts' ? executor.args : []) ?? [];
  return members.length === 0 ? value : Object.freeze({ ...value, inputs: Object.freeze([...new Set([...value.inputs, ...members])]) });
}

export function validateVerificationStepOwnership(steps: any): any {
  const entries = steps.map((step: any) => typeof step === 'string' ? { id: step } : step);
  const expected = new Set(entries.map((step: any) => step.id));
  const findings: any[] = [];
  for (const step of entries) {
    // A Service definition is the sole owner of its test membership and inputs.
    // Cross-service recipes retain the explicit project ownership declarations.
    const serviceDeclared = step.serviceOwned === true && typeof step.serviceRoot === 'string'
      && Array.isArray(step.inputs) && step.inputs.length > 0;
    const browserDeclared = typeof step.browserSelector === 'string' && step.executor?.file === 'test/verification/browser-selector-dispatcher.ts'
      && Array.isArray(step.inputs) && step.inputs.length > 0;
    if (!VERIFICATION_STEP_OWNERSHIP[step.id] && !serviceDeclared && !browserDeclared) findings.push({ step: step.id, code: 'missing_step_ownership' });
  }
  for (const id of Object.keys(VERIFICATION_STEP_OWNERSHIP)) if (!expected.has(id)) findings.push({ step: id, code: 'unknown_step_ownership' });
  return Object.freeze({ ok: findings.length === 0, findings: Object.freeze(findings) });
}
