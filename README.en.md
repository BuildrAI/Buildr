# Buildr

[中文](README.md) | English | [Get started](#get-started) | [Documentation](docs/README.md)

**Buildr is intelligent work infrastructure for organizations.** It connects working environments, knowledge, methods, and tools so people can understand the situation and make decisions, while agents find the evidence they need and deliver results. Organizations can put existing materials to use and retain confirmed knowledge, methods, and results as work assets they own and reuse.

Keep using your familiar agent tools, from discussing ideas and plans through implementation, verification, and delivery. Buildr makes the information and methods needed at each stage discoverable and reusable; people set goals, help make decisions, grant authorization, and accept results. Whether you are a one-person business or a larger team, you can start with your existing business and one real task.

## What Buildr helps you do

Business materials are scattered, the relationships between frontend and backend code are unclear, and every new task starts with another explanation of the background. Effective methods stay in personal experience or chat history, so changing participants or agent tools means organizing everything again. Buildr helps you put what you already have to use and give future work a shared foundation.

| For whom | What it provides |
| --- | --- |
| People | Access to materials, progress, and actual results; opportunities to make decisions and edit directly; less information to find and move between systems |
| Agents | Ways to discover materials, methods, and system access points for a goal, verify the current situation, and keep the work moving |
| Organizations | Confirmed knowledge and effective methods maintained as work assets they can own, share, and reuse, reducing reliance on personal memory and trial and error |

For example, you can start with work like this:

- **Connect your existing business and code.** “Our business documentation, frontend code, and backend code are in different places. Help me map their relationships.” Product staff maintain business goals and constraints; designers, developers, testers, and their agents continue from the same current materials.
- **Investigate and fix a problem.** “This order was paid successfully. Why does the page still show it as unpaid?” With the relevant materials and systems connected, the agent follows clues through documentation, code, logs, configuration, and data to find the cause, fix it, and verify the result. You inspect the evidence, help make decisions, and accept the result.
- **Keep useful methods and continue the work.** “Save the approach that proved effective this time, so we can continue from these results next time.” After an interruption or a tool change, the agent rereads the goal, methods, and actual changes, checks the current situation, and continues. Experience worth reusing is confirmed before it is maintained for future work.

## How Buildr organizes work

### Connect materials and code within a shared scope

A workspace is a directory and discovery entry point where people and agents work together. Projects describe business goals and constraints, services describe implementation responsibilities, and repositories link to actual code sources and locations. Together, they help both people and agents move from “what needs to be done” to “where to do it.” Work without code can begin with materials alone.

### Keep progress and actual results tied to a goal

A task retains the goal, progress, and result locations for a piece of work and can link to multiple sessions. People read knowledge, edit files, and inspect code changes and commits in Buildr; agents work from the same sources and current tool results. Code, documents, and business data stay in their respective locations, and the current results are checked again when work resumes.

![A real Buildr task: goals, linked sessions, and documented results](docs/images/task-workspace.png)

*The screenshot shows real work on Buildr in the development version.*

### Reuse facts, working methods, and system access points

Work assets maintained for the long term mainly include **facts about the work** and **working methods**: facts describe the current situation, such as business constraints and project composition; methods explain how to execute, check, and deliver work. Rules express boundaries, and skills retain reusable methods.

Connections link methods to specific systems. Buildr currently offers optional connection methods for MySQL, Kibana, Nacos, and XXL-JOB, and supports creating your organization's own connection methods. The actions available depend on configuration, permissions, specialized methods, and authorization. Materials, query results, and new deliverables are assessed and confirmed before the parts worth long-term reuse are maintained as work assets.

### Connect your familiar agent tools

Buildr currently supports Codex and DSH integration and native session linking. It prepares the necessary rule and skill entry points for each tool's adapter; project materials and code continue to be read from their original locations. Agents understand goals, choose evidence, reason, and execute; Buildr organizes long-term materials, methods, and access points.

## Get started

The official package is `@buildr-ai/buildr`, currently supported on macOS and Windows. You can use it through the launcher or a browser. Regular use does not require cloning this repository or learning commands first.

### 1. Install Buildr

In an agent tool that can work with local files and run commands, such as Codex or DSH, give it the following request:

> Refer to https://github.com/BuildrAI/Buildr to install Buildr and its launcher for me.

The agent checks the environment and installs Buildr. See the [installation reference](projects/product/services/buildr/docs/cli-reference.md#首次使用) for installation and manual recovery details.

### 2. Choose a directory and initialize a workspace

After installation, choose a directory to organize your business materials, working methods, and code references. You can use an existing directory or create a new one. Open the selected directory in your agent tool. For an existing workspace, check its current state and continue without initializing it again.

If the directory has not been initialized, ask your agent:

> Initialize the current directory as a Buildr workspace, then open Buildr.

Normal initialization registers this directory with the local Buildr Web by default, so you do not need to add it manually. For a workspace initialized earlier but not yet registered, use “添加已有工作空间” (Add existing workspace) on the selection page to add it to the list.

### 3. Configure your work in Buildr Web

Enter this workspace in Buildr Web. If the workspace selection page appears, select it from the list first. Open “项目” (Projects) and use an existing project if appropriate. To add one, click “新增项目” (New project) and enter business goals and constraints, or choose “登记已有项目” (Register existing project) for an existing project directory.

For work involving code, use “服务” (Services) and “代码库” (Repositories) to register implementation responsibilities and actual code locations, then associate the relevant services with the project. Configure what you need now; work without code can begin with a project alone.

### 4. Start your first real task

Confirm that Buildr shows the intended workspace, the materials and any required code locations are correct, and your agent tool has **the same directory** open and can use the applicable methods. Then give it a specific goal, for example:

> Add a status filter to the order list, following the existing interface and testing approach. When finished, explain the changes, verification results, and any unresolved issues, and update the affected materials.

In Buildr, inspect registered tasks, progress, and results, and participate in decisions. After an interruption, provide the original task or result location so the agent can read the current situation and continue. When the work is complete, ask it to “close out” the work and complete authorized delivery and cleanup.

### Updating Buildr and your workspace

In the directory of the workspace you want to update, tell your agent:

> Update Buildr and the current workspace. Preserve existing materials and local records.

Updating Buildr also updates the bundled Buildr Web and automatically switches an older running instance from the same installation to the new version. You do not need to reopen the launcher. The web interface is briefly interrupted during the switch. The workspace also needs its applicable work assets and agent entry points synchronized. When finished, the agent reports the product version, whether Buildr Web has switched to the new version, and the workspace update result.

See the [user guide](projects/product/knowledge/docs/guides/getting-started.md) for daily use, updates, and recovery, and [updates and data protection](projects/product/knowledge/docs/guides/getting-started.md#更新与数据保护) for what to know before updating.

Buildr currently focuses on local work. File-based materials can be shared through Git, but local records such as tasks do not automatically synchronize across machines. Full enterprise access control and cloud collaboration are not currently available. Completing changes, passing checks, and confirming that a deployment has taken effect each require their own actual results. See [known limitations](projects/product/services/buildr/docs/known-limitations.md).

## Learn more

- [About Buildr](projects/product/knowledge/docs/overview.md): product uses, collaboration, and future directions.
- [Work objects and code relationships](projects/product/knowledge/docs/architecture/project-service-repositories.md) · [From discussion to delivery](projects/product/knowledge/docs/architecture/task-system.md): understand how work is organized and resumed.
- [Skill system](projects/product/knowledge/docs/architecture/buildr-skill-system.md) · [External system connections](projects/product/knowledge/docs/architecture/external-connections.md) · [Agent tool adapters](projects/product/services/buildr/docs/agent-runtime-adapters.md): learn about reusable methods and tool integration as needed.
- [Documentation index](docs/README.md): find more usage, design, and technical documentation.

## Develop Buildr with Buildr

**This repository is a self-bootstrapping workspace.** Buildr uses itself to organize product materials, working methods, and development work. `projects/product/` holds product knowledge, designs, and specifications and links to the actual implementations. Explore this real example to see how Buildr supports everyday development.

To contribute, open the repository root in your agent tool and ask:

> I want to contribute to Buildr development. Please read the repository rules and product development documentation, then prepare the development environment.

This is an existing workspace and does not need to be initialized again. Use the repository's `projects/product/buildr` entry point for development. Continue with [product development](projects/product/README.md) for the implementation structure, environment setup, and checks, and see the [contributing guide](CONTRIBUTING.md) for how to contribute.

[Issues](https://github.com/BuildrAI/Buildr/issues) · [Security reporting](SECURITY.md) · [MIT License](LICENSE)
