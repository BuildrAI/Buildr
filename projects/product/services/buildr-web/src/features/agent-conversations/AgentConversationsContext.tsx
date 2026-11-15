import type {ComponentProps} from 'react';
import {AgentConversationsProvider as HarnessProvider} from '@buildr-ai/buildr-harness-ui';
import {DevelopmentHarnessHost} from './DevelopmentHarnessHost';
export * from '@buildr-ai/buildr-harness-ui/conversations/AgentConversationsContext';
/** Business pages need not mount this provider; only the product integration does. */
export function AgentConversationsProvider(props:ComponentProps<typeof HarnessProvider>){
  return <DevelopmentHarnessHost><HarnessProvider {...props}/></DevelopmentHarnessHost>;
}
