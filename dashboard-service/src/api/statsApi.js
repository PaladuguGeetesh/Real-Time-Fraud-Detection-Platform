import apiClient from './client';

export async function fetchStats() {
  const response = await apiClient.get('/api/stats');
  return response.data;
}
