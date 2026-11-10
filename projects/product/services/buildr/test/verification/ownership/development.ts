import { MACOS_SOURCE_BOUNDARY_INPUTS, WINDOWS_SOURCE_BOUNDARY_INPUTS } from '../platform-boundaries.ts';
/** Cross-service development check ownership; service-owned checks stay with their service. */
export default {
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
      "test/verification/semantic-tags.ts",
      "test/verification/failed-groups.ts",
      "test/verification/settle-diagnostics.mjs",
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
      "test/helpers/in-process-cli.ts",
      "test/register-development-entry.ts",
      "src/infrastructure/filesystem/test-state-boundary.ts",
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
"integration-generated-artifacts": {
    "inputs": [
      "tools/build/**",
      "tools/codegen/**",
      "tools/testing/**",
      "test/integration/generated-artifact-set.test.ts"
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
    "inputs": ["src/modules/workspace/**", "src/modules/agent-assets/**", "src/infrastructure/filesystem/**", "src/infrastructure/product-resources/**", "resources/workspace/**", "tools/development/workspace-continuity-check.ts", "tools/development/run-isolated-workspace-check.ts", "test/helpers/in-process-cli.ts", "test/helpers/asset-relationships.ts", "test/helpers/inline-core-fixture.ts"],
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
      "src/modules/browser-authorization/**",
      "resources/browser-authorization/**",
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
      "test/verification/semantic-tags.ts",
      "test/verification/failed-groups.ts",
      "test/verification/settle-diagnostics.mjs",
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
"integration-data-store": {
    "inputs": [
      "src/infrastructure/filesystem/test-state-boundary.ts",
      "test/integration/workspace-registry-scope.test.ts",
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
      "test/integration/development-web-continuity.test.ts",
      "src/modules/installation/infrastructure/development-runtime-inputs.ts",
      "skills/buildr-self-bootstrap-sync/**",
      "components/workspace/buildr-self-bootstrap/**",
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
"integration-changed-paths": {
    "inputs": [
      "test/integration/verification-changed-paths.test.ts",
      "test/verification/candidate.ts",
      "test/verification/dag-scheduler.ts",
      "test/verification/plan-runner.ts",
      "test/verification/planner.ts",
      "test/verification/cli.ts",
      "test/verification/semantic-tags.ts",
      "test/verification/failed-groups.ts",
      "test/verification/settle-diagnostics.mjs",
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
"e2e-workspace": {
    "inputs": [
      "test/helpers/in-process-cli.ts",
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
      "test/helpers/in-process-cli.ts",
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
      "test/e2e/buildr-web-restart.test.ts",
      "test/e2e/buildr-web-restart-browser.test.ts",
      "services/buildr-web/src/api/client.ts",
      "services/buildr-web/src/api/LocalSessionAdapter.ts",
      "services/buildr-web/src/app/AppLayout.tsx",
      "services/buildr-web/src/app/restart-watch.ts",
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
  }
};
