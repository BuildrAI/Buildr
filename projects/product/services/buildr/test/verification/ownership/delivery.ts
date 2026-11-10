/** Cross-service delivery check ownership; service-owned checks stay with their service. */
export default {
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
"integration-candidate-release": {
    "inputs": [
      "skills/buildr-release/scripts/local-candidate-withdrawal.ts",
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
      "src/modules/agent-assets/application/rules.ts",
      "src/modules/agent-assets/infrastructure/runtime/**",
      "src/modules/agent-assets/application/package-maintenance/**",
      "tools/verification/package-check/runtime-checks.ts"
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
      "src/modules/agent-assets/infrastructure/runtime/**",
      "src/modules/agent-assets/application/runtime.ts",
      "src/modules/agent-assets/application/package-maintenance/**"
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
  }
};
