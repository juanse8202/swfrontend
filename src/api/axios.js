import axios from 'axios';
import { getCsrfToken } from './authApi';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/api\/?$/, '');
const api = axios.create({ baseURL: `${API_URL}/api`, withCredentials: true });

api.interceptors.request.use(async (config) => {
  if (['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase())) {
    config.headers['X-CSRFToken'] = await getCsrfToken();
  }
  return config;
});

export default api;
