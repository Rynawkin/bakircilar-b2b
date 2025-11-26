'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { validateField, validators } from '@/lib/utils/validation';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const emailValidation = validateField(email, { required: true, minLength: 3 });
    const passwordValidation = validateField(password, { ...validators.password, required: true });

    setEmailError(emailValidation.error || '');
    setPasswordError(passwordValidation.error || '');

    if (!emailValidation.isValid || !passwordValidation.isValid) {
      return;
    }

    try {
      await login({ email, password });

      // Store'dan user bilgisini al ve yönlendir
      const user = useAuthStore.getState().user;

      if (user?.role === 'ADMIN') {
        router.push('/dashboard');
      } else {
        router.push('/products');
      }
    } catch (err) {
      // Hata authStore'da handle edildi
      console.error('Login failed:', err);
    }
  };

  const fillDemoCredentials = (role: 'admin' | 'customer') => {
    if (role === 'admin') {
      setEmail('admin@bakircilar.com');
      setPassword('admin123');
    } else {
      setEmail('test@customer.com');
      setPassword('test123');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Logo & Header */}
        <div className="text-center">
          <div className="inline-block bg-white p-8 rounded-2xl shadow-2xl mb-6">
            <img
              src="/logo.png"
              alt="Bakırcılar Logo"
              className="h-24 w-auto mx-auto"
            />
          </div>
          <h2 className="text-3xl font-extrabold text-white">
            Bakırcılar Grup
          </h2>
          <p className="mt-2 text-sm text-primary-100">
            B2B Sipariş Sistemi
          </p>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-2xl bg-white shadow-2xl border border-gray-100 p-8 space-y-4">
            <Input
              label="Email veya Cari Kodu"
              type="text"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              placeholder="ornek@firma.com veya 120.01.1670"
              error={emailError}
              autoComplete="username"
              onBlur={() => {
                const validation = validateField(email, { required: true, minLength: 3 });
                setEmailError(validation.error || '');
              }}
            />

            <Input
              label="Şifre"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError('');
              }}
              placeholder="••••••••"
              error={passwordError}
              autoComplete="current-password"
              onBlur={() => {
                const validation = validateField(password, { ...validators.password, required: true });
                setPasswordError(validation.error || '');
              }}
            />

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              isLoading={isLoading}
              className="w-full mt-6 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-bold py-3 shadow-lg"
            >
              🔐 Giriş Yap
            </Button>
          </div>
        </form>

        {/* Demo Credentials */}
        <div className="rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 p-4 text-white space-y-3">
          <p className="text-xs font-medium text-primary-100 mb-2">💡 Demo Hesaplar:</p>

          <div className="flex items-center justify-between">
            <div className="text-xs text-white">
              <strong>Admin:</strong> admin@bakircilar.com / admin123
            </div>
            <button
              type="button"
              onClick={() => fillDemoCredentials('admin')}
              className="px-3 py-1 text-xs bg-white/20 hover:bg-white/30 rounded transition-colors"
            >
              Kullan
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-white">
              <strong>Müşteri:</strong> test@customer.com / test123
            </div>
            <button
              type="button"
              onClick={() => fillDemoCredentials('customer')}
              className="px-3 py-1 text-xs bg-white/20 hover:bg-white/30 rounded transition-colors"
            >
              Kullan
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-primary-100">
          <p>© 2025 Bakırcılar Grup. Tüm hakları saklıdır.</p>
        </div>
      </div>
    </div>
  );
}
