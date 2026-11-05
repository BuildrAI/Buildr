/** Cross-service runtime check ownership; service-owned checks stay with their service. */
export default {
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
      "resources/runtime/**"
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
      "resources/runtime/**"
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
  }
};
