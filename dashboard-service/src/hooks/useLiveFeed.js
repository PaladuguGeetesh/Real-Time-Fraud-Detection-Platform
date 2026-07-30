import { useContext } from 'react';
import { LiveFeedContext } from '../state/LiveFeedContext';

export function useLiveFeed() {
  const context = useContext(LiveFeedContext);
  if (context === undefined) {
    throw new Error('useLiveFeed must be used within a LiveFeedProvider');
  }
  return context;
}
