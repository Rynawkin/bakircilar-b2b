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
        // Marka mavisi - daha derin, karakterli "kobalt" tonu (premium his)
        primary: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd2ff',
          300: '#8eb4ff',
          400: '#5b8dfb',
          500: '#3667f2',
          600: '#1f4ddd',
          700: '#1b3dbb',
          800: '#1c3597',
          900: '#1b2f77',
          950: '#141f4a',
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
