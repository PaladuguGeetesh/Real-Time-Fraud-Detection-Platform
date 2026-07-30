import apiClient from './client';

export async function fetchTransactions({ page = 1, limit = 20, prediction, country } = {}) {
  const params = { page, limit };
  if (prediction) params.prediction = prediction;
  if (country && country.length > 0) params.country = country.join(',');

  const response = await apiClient.get('/api/transactions', { params });
  return response.data;
}
