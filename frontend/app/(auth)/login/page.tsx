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

      if (user?.role === 'ADMIN' || user?.role === 'MANAGER') {
        router.push('/dashboard');
      } else if (user?.role === 'DIVERSEY') {
        router.push('/diversey/stok');
      } else {
        router.push('/products');
      }
    } catch (err) {
      // Hata authStore'da handle edildi
      console.error('Login failed:', err);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Logo & Header */}
        <div className="text-center">
          <div className="mb-8 px-4">
            <img
              src="/logo.png"
              alt="Bakırcılar Logo"
              className="h-48 w-full max-w-md mx-auto object-contain drop-shadow-2xl"
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

        {/* Footer */}
        <div className="text-center text-xs text-primary-100">
          <p>© 2025 Bakırcılar Grup. Tüm hakları saklıdır.</p>
        </div>
      </div>
    </div>
  );
}
