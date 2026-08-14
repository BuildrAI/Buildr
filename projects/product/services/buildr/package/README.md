# Buildr

中文 | [English](https://github.com/BuildrAI/Buildr/blob/main/README.en.md)

Buildr helps Agents keep building on organized work facts and work methods instead of repeatedly reconstructing project context from chats, personal experience, and disconnected repositories. It is useful for organizing an existing business and its repositories, continuing long-running work through an Agent, preserving reusable methods, and switching Agents without abandoning accumulated assets.

## Start with one real task

Give your Agent this instruction:

```text
Help me start using Buildr: check and install what is needed, confirm or create the current Workspace, guide me to create a Project in plain language, attach a Service only when I have a repository, application, module, or executable asset, verify the necessary setup, then ask what real work I want to do first.
```

The first success is not merely running `init`. It is confirming a Workspace, a Project, an optional Service, and then giving the Agent a real goal.

Buildr Web offers the same path visually in the default browser: add an existing Workspace, understand the Project and optional Service scope, and choose **Start with Agent**. It only explains scope, maintains low-risk metadata, and creates a constrained handoff prompt. It does not create repositories, migrate assets, or execute professional work. Buildr App is reserved for a future desktop product and is not implemented today.

```text
Workspace → Project → Service (optional)
```

- **Workspace**: the top-level directory shared by you and an Agent.
- **Project**: a business, product, system, or long-lived work unit.
- **Service**: an optional repository, application, module, or executable asset in a Project.

## Manual fallback

When an Agent cannot perform setup, Buildr supports Node.js `>=24.15.0 <25`; each Workspace still uses the exact managed runtime version declared in its metadata:

```bash
npm install --global @buildr-ai/buildr@next
buildr runtime list --json
buildr init --agent <agent> --target . --name <name> --profile <personal|team|company>
buildr web --target .
```

The current package candidate is `0.1.0-rc.10`; available versions and the `next` dist-tag are always determined by the official npm Registry.

`init --agent` uses the final doctor result as technical onboarding evidence; the Agent should then complete a brief first-use handoff from the real Project and Service state.

Buildr does not replace an Agent's reasoning, planning, or professional execution. It organizes durable work assets and provides deterministic tools and diagnostics. See the repository [README](https://github.com/BuildrAI/Buildr#readme), [Buildr Product](https://github.com/BuildrAI/Buildr/blob/main/projects/product/docs/buildr-product.md), [CLI Reference](https://github.com/BuildrAI/Buildr/blob/main/projects/product/services/buildr/docs/cli-reference.md), and [Runtime Adapters](https://github.com/BuildrAI/Buildr/blob/main/projects/product/services/buildr/docs/agent-runtime-adapters.md) for details.
