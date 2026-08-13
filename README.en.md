# Buildr

[中文](README.md) | English

## Buildr, Work Infrastructure for Agents

What limits an Agent's results is not just the model's capability, but also what the Agent can access and whether it can keep building on accumulated work.

Buildr is work infrastructure for Agents. It turns the work facts and methods of individuals and organizations into work assets, so Agents can build on what has already been accumulated and move work from idea to delivery.

The broader the work facts available to an Agent, the more it can do; the more proven work methods accumulate, the more reliable and higher-quality its work becomes.

You direct. Agents build. You own the assets. You can switch Agents.

## Quick Start: Just Three Steps

### 1. Install or Update Buildr

Give this README to an Agent and say “Install Buildr for me,” or run:

```bash
npm install --global @buildr-ai/buildr@next
```

For an optional local Buildr Web launcher:

```bash
buildr web launcher install
```

If Buildr is already installed, tell the Agent “Update Buildr for me.”

### 2. Initialize or Update the Workspace

Open your working directory and tell the Agent:

```text
Use Buildr to manage this Workspace.
```

For an existing Workspace, say:

```text
Update this Workspace for me.
```

When a Workspace is initialized or updated, Buildr also installs or updates the Buildr Skill for the current Agent.

Updating Buildr updates the local product. Updating a Workspace updates its work assets and Agent runtime. Neither replaces the other.

### 3. Start Working

Once the Workspace is ready, describe your real goal in the Agent conversation:

```text
Help me clarify the requirements for our payments product and set up the Project.
```

```text
Create a plan for this requirement, then complete development, testing, and delivery.
```

You do not need to learn Buildr commands first. The Agent uses Buildr to manage work assets, then continues with the actual work.

## Three Core Values

### 1. One Agent Window, from Product to Release

One requirement can move from PRD through design, development, testing, CI/CD, and release, continuously using the same set of work assets.

If every stage starts by re-explaining the background and moving documents around, an Agent cannot reliably finish the whole job. Buildr lets the Agent finish one stage and move directly to the next using the facts and methods already available.

**Buildr itself has already run this entire chain**: discussions, OpenSpec proposals, implementation, testing, Git, GitHub Actions, and npm releases—all completed in the same Agent window.

Team collaboration works the same way. Product maintains PRDs, Specs, and project facts in the Project. When those facts change, the Agents used by design, development, and testing continue from the updated source.

### 2. You Own the Assets. Switch Agents Freely.

Different teams and tasks use different Agents. If Rules and Skills are locked inside one Agent tool, switching Agents means rebuilding everything.

Buildr is not another Agent, and it does not try to do the Agent's job. It prepares the work assets and entry points Agents need, then leaves the work to the Agent. The assets remain in an independent Workspace controlled by an individual or organization. You switch the Agent, not what you have accumulated.

Buildr currently works with seven Agent types—one asset set, different entry points.

### 3. People and Teams Change. Assets Remain.

When critical work methods and project facts exist only in personal experience, local files, or chat history, they disappear as people change. The next person has to understand the project, repeat the same experiments, and rebuild the same methods.

Buildr stores work assets in the filesystem, where Git can manage them. Individuals can reuse their methods across tasks and Projects. Teams and organizations keep their accumulated project facts, Rules, and Skills when people change. The next person can continue from that foundation through an Agent.

## How Buildr Works

Buildr organizes work methods and work facts into work assets that Agents can discover, select, and use:

- **Work methods**: how work gets done—Rules, Skills, and Commands that capture how an individual or organization works
- **Work facts**: what the work is about—project documents, Specs, Service information, code repositories, and their relationships

People direct Agents. Agents manage assets:

```text
You say, "Turn our team's release process into a Skill"
  → Agent uses Buildr Skill to understand the goal
    → calls Buildr CLI
      → The release process becomes a reusable Skill and is rendered to Agent runtime
```

An Agent uses Buildr through **Buildr CLI + Buildr Skill**:

- **Buildr CLI**: creates, updates, synchronizes, and diagnoses work assets
- **Buildr Skill**: tells the Agent how to understand goals and choose and verify Buildr CLI operations

Buildr stores work asset source files in the filesystem, where Git can manage them. Agent runtimes are rendered from those source files. The core model is:

```text
Workspace (personal / team / company)
  └── Project
        └── Service
```

A Workspace has the following filesystem structure:

```text
workspace/
├── rules/                 # Rules and boundaries the Agent follows
├── skills/                # Reusable professional actions and workflows
├── components/            # Shared lifecycle for groups of Rules, Skills, and Commands
├── commands/              # Declarations and checks for external CLIs
├── projects/
│   └── <project>/
│       ├── project documents · Specs · capabilities.yml
│       └── services/
│           └── <service>/ # Repository, application, or module
└── Agent runtime entries  # Rendered native entry points; rebuildable, not the source of truth
```

| Object | Description |
|---|---|
| Workspace | The working directory and unique Skill governance root for an individual, team, or company |
| Project | A business or product unit containing project facts, Skill applicability, capability bindings, and Service relationships |
| Service | A repository, application, or module used by a Project |

Skills are maintained only in the Workspace `skills/` directory and rendered to two Agent runtime destinations: `workspace`, where they are discoverable in the current working directory, and `user`, where they are discoverable in all Workspaces for the current user. Projects do not copy Skills or act as installation boundaries. Project-specific applicability is expressed in `capabilities.yml`.

Buildr manages long-lived work assets. It does not directly fill a model's context window. The Agent discovers and selects relevant content for the current task and forms its own task context. The Agent handles understanding, retrieval, reasoning, and professional execution; Buildr handles work asset governance, deterministic state changes, runtime projection, integrity protection, and diagnostics.

## Current Capabilities

- One Workspace manages multiple Projects; each Project can manage multiple Services when needed
- Unified management of Rules, Workspace-level Skills, Components, and Commands, including `user` and `workspace` Skill destinations and name-conflict checks
- Task process facts from planning, environment, and development through review, verification, delivery, and retrospectives
- Buildr Web views for Workspaces, Projects, Services, documents, Tasks, verification, and execution records; the experience is still being refined
- Seven Agent runtime adapters: `claude-code`, `codex`, `cursor`, `qoder`, `trae`, `trae-work`, and `workbuddy`

See [Known Limitations](projects/product/services/buildr/docs/known-limitations.md) for current boundaries.

## Documentation

- [Daily Manual](projects/product/docs/manual/README.md): installation, Workspace preparation, and daily workflows
- [Buildr Product](projects/product/docs/buildr-product.md): complete positioning, core model, boundaries, and Roadmap
- [Buildr Skill](projects/product/services/buildr/package/targets/runtime/skills/buildr/SKILL.md): the primary entry point for Agents using Buildr
- [CLI Reference](projects/product/services/buildr/docs/cli-reference.md): public commands and parameters
- [Runtime Adapters](projects/product/services/buildr/docs/agent-runtime-adapters.md): integration paths and limitations for each Agent
- [OpenSpec Specifications](projects/product/openspec/specs/): normative product behavior contracts

## Buildr Bootstrap Workspace: Developers and Contributors

Regular users only need the npm package and do not need to clone this repository. To contribute to Buildr:

```bash
git clone https://github.com/BuildrAI/Buildr.git
cd Buildr/projects/product
npm ci
./buildr --help
./buildr runtime list --json
```

A development checkout uses the repository's `projects/product/buildr` entry instead of the global `buildr` on PATH. Product governance lives under `projects/product/`; the CLI and runtime are implemented in `services/buildr/`, and the Buildr Web frontend lives in `services/buildr-web/`.

Read the [Contributing Guide](CONTRIBUTING.md) before making changes.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [MIT License](LICENSE) · [GitHub Issues](https://github.com/BuildrAI/Buildr/issues)
