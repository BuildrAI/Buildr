/** Cross-service governance check ownership; service-owned checks stay with their service. */
export default {
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
      "test/verification/semantic-tags.ts",
      "test/verification/failed-groups.ts",
      "test/verification/settle-diagnostics.mjs",
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
"docs-quality": {
    "inputs": [
      "**/*.md",
      "openspec/**/*.html",
      "docs/publications/assets/**",
      "test/verification/docs/quality.ts"
    ],
    "inputExclusions": []
  }
};
