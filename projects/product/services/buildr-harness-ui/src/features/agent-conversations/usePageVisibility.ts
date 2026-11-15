import { useSyncExternalStore } from 'react';
import { isPageVisible, subscribePageVisibility } from './page-visibility.ts';

export function usePageVisibility(): boolean {
  return useSyncExternalStore(subscribePageVisibility, isPageVisible, () => true);
}
