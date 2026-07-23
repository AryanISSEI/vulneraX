import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json',
  },
});

client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('vulnerax_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('vulnerax_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const message = error.response?.data?.detail || error.message || 'An error occurred';
    console.error('[VulneraX API]', message);
    return Promise.reject(error);
  }
);

export const login = (username, password) => client.post('/auth/login', { username, password });
export const register = (username, password) => client.post('/auth/register', { username, password });
export const getMe = () => client.get('/auth/me');

export const startScan = (target) => client.post('/scan', { target });
export const getScanStatus = (scanId) => client.get(`/scan/${scanId}/status`);
export const getScanResults = (scanId) => client.get(`/scan/${scanId}/results`);
export const getScanHistory = () => client.get('/history');
export const getReport = (scanId, format) =>
  client.get(`/report/${scanId}?format=${format}`, {
    responseType: format === 'json' ? 'json' : 'blob',
  });

export default client;
