/**
 * Axios API Client
 */

import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - JWT token ekle ve activity güncelle
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      // LocalStorage'dan token al
      const authStorage = localStorage.getItem('b2b-auth-storage');
      if (authStorage) {
        try {
          const { state } = JSON.parse(authStorage);
          if (state?.token) {
            config.headers.Authorization = `Bearer ${state.token}`;

            // Activity güncelle (her request'te)
            const updatedState = {
              ...state,
              lastActivity: Date.now(),
            };
            localStorage.setItem('b2b-auth-storage', JSON.stringify({ state: updatedState }));
          }
        } catch (error) {
          console.error('Error parsing auth storage:', error);
        }
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Hata yönetimi
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Sadece gerçek authentication hatalarında logout yap
    // Network hataları veya CORS hataları ignore et
    if (error.response?.status === 401 && error.response?.data?.error) {
      const errorMessage = error.response.data.error;

      // Sadece token hatalarında logout yap
      if (
        errorMessage.includes('token') ||
        errorMessage.includes('expired') ||
        errorMessage.includes('Invalid') ||
        errorMessage.includes('Authentication required')
      ) {
        if (typeof window !== 'undefined') {
          console.warn('Auth token expired or invalid, logging out...');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
