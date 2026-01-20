import axios from 'axios';

import { getAuthToken, clearAuth } from '../storage/auth';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.bakircilarkampanya.com/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await clearAuth();
    }
    return Promise.reject(error);
  }
);
