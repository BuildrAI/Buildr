/** Only Buildr's isolated native host loads this, including restored sessions. */
export const inject = ['systemPrompt'];
export function apply(ctx: any, config: { instructions: string }): void {
  ctx.systemPrompt.section({
    name: 'buildr:interaction',
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') + 1,
    text: config.instructions,
    interpolate: false,
  });
}
