import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 300000, // 5 minutes for long scans
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
client.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// Response interceptor
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'An error occurred';
    console.error('[VulneraX API]', message);
    return Promise.reject(error);
  }
);

export const startScan = (target) => client.post('/scan', { target });
export const getScanStatus = (scanId) => client.get(`/scan/${scanId}/status`);
export const getScanResults = (scanId) => client.get(`/scan/${scanId}/results`);
export const getScanHistory = () => client.get('/history');
export const getReport = (scanId, format) =>
  client.get(`/report/${scanId}?format=${format}`, {
    responseType: format === 'json' ? 'json' : 'blob',
  });

export default client;
