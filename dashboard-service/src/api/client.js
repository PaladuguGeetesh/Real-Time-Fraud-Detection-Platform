import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:4000',
  // Required for the browser to send the httpOnly auth cookie on
  // cross-origin requests (the dashboard at :5173 calling the Backend
  // at :4000) -- without this, axios never attaches it, cookie or not.
  withCredentials: true,
});

export default apiClient;
