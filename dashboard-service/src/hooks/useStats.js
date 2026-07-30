import { useContext } from 'react';
import { StatsContext } from '../state/StatsContext';

export function useStats() {
  const context = useContext(StatsContext);
  if (context === undefined) {
    throw new Error('useStats must be used within a StatsProvider');
  }
  return context;
}
