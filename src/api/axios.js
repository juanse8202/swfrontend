import axios from 'axios';
import { getCsrfToken } from './authApi';
import { apiBaseUrlFrom } from '../utils/runtimeUrls';

const API_URL = apiBaseUrlFrom(import.meta.env.VITE_API_URL);
const api = axios.create({ baseURL: API_URL, withCredentials: true });

api.interceptors.request.use(async (config) => {
  if (['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase())) {
    config.headers['X-CSRFToken'] = await getCsrfToken();
  }
  return config;
});

export default api;
