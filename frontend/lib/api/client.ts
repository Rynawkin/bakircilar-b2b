/**
 * Axios API Client
 */

import axios from 'axios';
import { getOrCreateSessionId } from '@/lib/analytics/session';

// Use relative URL to leverage Next.js rewrites (avoids CORS and Mixed Content issues)
const API_URL = '/api';

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
          const { token, user } = JSON.parse(authStorage);
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
          if (user?.role === 'CUSTOMER') {
            const sessionId = getOrCreateSessionId();
            if (sessionId) {
              config.headers['x-session-id'] = sessionId;
            }
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
    // HTTP 401 her zaman geçersiz/eksik oturum anlamına gelir. Backend hata metninin
    // diline göre karar vermek bazı 401 cevaplarında kullanıcıyı sonsuz spinner'da
    // bırakıyordu. Login denemesi hariç tüm 401'larda yerel oturumu temizle.
    const requestUrl = String(error.config?.url || '');
    const isLoginRequest = requestUrl.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest && typeof window !== 'undefined') {
      localStorage.removeItem('b2b-auth');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('b2b-auth-storage');
      if (window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
