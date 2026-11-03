import { useEffect, useState } from 'react';
import { readHistoryGroupPreference, subscribeHistoryGroupPreference } from './conversation-history-groups';

export function useHistoryGroupPreference(): string[] {
  const [order, setOrder] = useState(readHistoryGroupPreference);
  useEffect(() => {
    const unsubscribe = subscribeHistoryGroupPreference(setOrder);
    setOrder(readHistoryGroupPreference());
    return unsubscribe;
  }, []);
  return order;
}
