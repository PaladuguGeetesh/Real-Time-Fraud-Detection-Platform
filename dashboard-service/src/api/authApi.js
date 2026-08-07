import apiClient from './client';

export async function login(username, password) {
  const response = await apiClient.post('/api/auth/login', { username, password });
  return response.data;
}

export async function logout() {
  const response = await apiClient.post('/api/auth/logout');
  return response.data;
}

// Cheap, dependency-free "am I logged in" check -- see
// authController.js's `me` handler for why this isn't just reusing
// an existing data endpoint like /api/stats.
export async function fetchMe() {
  const response = await apiClient.get('/api/auth/me');
  return response.data;
}
