'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { validateField, validators } from '@/lib/utils/validation';
import { Eye, EyeOff } from 'lucide-react';

const LoginForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading, error } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
      const redirectParam = searchParams.get('redirect');
      const safeRedirect = redirectParam && redirectParam.startsWith('/') ? redirectParam : null;

      if (user?.role === 'HEAD_ADMIN' || user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'SALES_REP') {
        router.push('/dashboard');
      } else if (user?.role === 'DEPOCU') {
        router.push('/warehouse');
      } else if (user?.role === 'DIVERSEY') {
        router.push('/diversey/stok');
      } else {
        if (safeRedirect) {
          router.push(safeRedirect);
        } else {
          router.push('/home');
        }
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
          <div className="rounded-2xl bg-white shadow-2xl border border-gray-100 p-8 space-y-5">
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

            {/* Sifre - goster/gizle destekli */}
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError('');
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  onBlur={() => {
                    const validation = validateField(password, { ...validators.password, required: true });
                    setPasswordError(validation.error || '');
                  }}
                  className={`w-full px-3 py-2 pr-11 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                    passwordError ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {passwordError && <p className="mt-1 text-sm text-red-600">{passwordError}</p>}
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 p-3.5">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              isLoading={isLoading}
              className="w-full mt-1 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-bold py-3 shadow-lg"
            >
              Giriş Yap
            </Button>

            {/* Sifre yardimi - temsilciyle iletisim */}
            <div className="pt-1 border-t border-gray-100">
              <p className="text-center text-xs text-gray-500 pt-3 leading-relaxed">
                Şifrenizi mi unuttunuz?<br />
                Lütfen satış temsilciniz ile iletişime geçin.
              </p>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="text-center text-xs text-primary-100">
          <p>© {new Date().getFullYear()} Bakırcılar Grup. Tüm hakları saklıdır.</p>
        </div>
      </div>
    </div>
  );
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800">
          <div className="text-white text-sm">Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
