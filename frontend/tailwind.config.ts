import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Marka mavisi - derin, kurumsal lacivert (claude.ai tasarim tonu #15356b)
        primary: {
          50: '#eef2fa',
          100: '#d6e0f1',
          200: '#b9caea',
          300: '#8ba8d7',
          400: '#577fbb',
          500: '#2f5a98',
          600: '#15356b', // marka temel (butonlar, header, logo)
          700: '#1c4585', // link / vurgu (tasarimda hover acik mavi)
          800: '#102c54', // koyu yuzeyler
          900: '#0c2247', // hero / en koyu
          950: '#081a3a',
        },
        // Vurgu (avantaj/indirim) icin sicak degil, dingin yesil zaten emerald; marka aksani:
        ink: {
          DEFAULT: '#0f172a',
        },
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-out-right': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'zoom-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-out': 'fade-out 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-out-right': 'slide-out-right 0.3s ease-out',
        'zoom-in': 'zoom-in 0.2s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
}
export default config
