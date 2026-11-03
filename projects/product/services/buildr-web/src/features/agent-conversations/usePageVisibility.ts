import { useSyncExternalStore } from 'react';
import { isPageVisible, subscribePageVisibility } from './page-visibility';

export function usePageVisibility(): boolean {
  return useSyncExternalStore(subscribePageVisibility, isPageVisible, () => true);
}
