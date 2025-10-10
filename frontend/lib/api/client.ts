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

// Request interceptor - JWT token ekle
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      // LocalStorage'dan token al
      const authStorage = localStorage.getItem('b2b-auth');
      if (authStorage) {
        try {
          const { token } = JSON.parse(authStorage);
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
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
          console.warn('⚠️ Auth token expired or invalid, logging out...');
          // Tüm auth storage'ları temizle
          localStorage.removeItem('b2b-auth');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('b2b-auth-storage');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
