'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store/authStore';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-0)] px-4 py-12">
      <div className="w-full max-w-[404px]">
        <form onSubmit={handleSubmit}>
          <div className="bg-white border border-[var(--line)] rounded-2xl p-8 shadow-[0_18px_38px_rgba(20,34,59,0.10)]">
            {/* Logo & Marka */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <Logo layout="stacked" tone="blue" size="xl" />
              <div className="text-center">
                <div className="text-[9px] font-medium tracking-[0.17em] text-[var(--ink-3)] mt-1">
                  TOPTAN SİPARİŞ PORTALI
                </div>
              </div>
            </div>

            {/* Baslik */}
            <h1 className="text-lg font-semibold text-[var(--ink-1)] text-center mb-1">
              Portala giriş
            </h1>
            <p className="text-[13px] text-[var(--ink-3)] text-center leading-relaxed mb-6">
              Cari hesabınızla giriş yapın
            </p>

            {/* E-posta */}
            <label className="block text-[12.5px] font-medium text-[var(--ink-2)] mb-1.5">
              E-posta
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              placeholder="ornek@firma.com veya 120.01.1670"
              autoComplete="username"
              onBlur={() => {
                const validation = validateField(email, { required: true, minLength: 3 });
                setEmailError(validation.error || '');
              }}
              className={`w-full h-11 px-3.5 text-sm text-[var(--ink-1)] bg-white border rounded-[10px] outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                emailError ? 'border-red-500' : 'border-[var(--line)]'
              }`}
            />
            {emailError && <p className="mt-1 text-sm text-red-600">{emailError}</p>}

            {/* Sifre - goster/gizle destekli */}
            <label className="block text-[12.5px] font-medium text-[var(--ink-2)] mt-4 mb-1.5">
              Şifre
            </label>
            <div
              className={`flex items-center h-11 px-3.5 bg-white border rounded-[10px] focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent ${
                passwordError ? 'border-red-500' : 'border-[var(--line)]'
              }`}
            >
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
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-[var(--ink-1)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                className="flex items-center pl-2 text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
              >
                {showPassword ? <EyeOff className="w-[17px] h-[17px]" /> : <Eye className="w-[17px] h-[17px]" />}
              </button>
            </div>
            {passwordError && <p className="mt-1 text-sm text-red-600">{passwordError}</p>}

            {/* Sifremi unuttum / temsilci iletisim */}
            <div className="flex justify-between items-center flex-wrap gap-1.5 mt-2.5 mb-5">
              <button
                type="button"
                className="text-[12.5px] font-medium text-primary-700 hover:underline p-0 bg-transparent border-none cursor-pointer"
              >
                Şifremi unuttum
              </button>
              <span className="text-[12.5px] text-[var(--ink-3)]">
                veya{' '}
                <button
                  type="button"
                  className="text-[12.5px] font-medium text-primary-700 hover:underline p-0 bg-transparent border-none cursor-pointer"
                >
                  temsilcinizle iletişim
                </button>
              </span>
            </div>

            {error && (
              <div className="rounded-[10px] bg-red-50 border border-red-100 p-3.5 mb-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Giris yap */}
            <Button
              type="submit"
              isLoading={isLoading}
              className="w-full h-[46px] bg-primary-900 hover:bg-primary-700 text-white text-sm font-semibold rounded-[10px]"
            >
              Giriş yap
            </Button>

            {/* Telif */}
            <div className="text-center text-[11.5px] text-[var(--ink-3)] mt-5">
              © {new Date().getFullYear()} Bakırcılar Toptan Dağıtım
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--surface-0)]">
          <div className="text-[var(--ink-2)] text-sm">Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
