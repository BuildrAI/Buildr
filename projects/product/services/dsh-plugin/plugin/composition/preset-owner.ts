/** Same public registration lifecycle as the official declarative preset owner. */
import { Service, type Context } from '@deepseek-ai/cordis';
import { EntryGroup } from '@deepseek-ai/cordis-plugin-loader';
import z from '@deepseek-ai/schemastery';
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry';
import type {} from '@deepseek-ai/dsh-agent-preset-registry';

export default class BuildrPresetOwner {
  static inject = ['agentPresets'];
  static readonly [EntryGroup.key] = true;
  static Config = z.object({ id: z.string().required(), name: z.string(), description: z.string(),
    order: z.number(), plugins: z.array(z.any()).required() });
  constructor(private readonly ctx: Context, private readonly config: PresetDefinition) {}
  async* [Service.init]() { yield await this.ctx.agentPresets.register(this.config); }
}
