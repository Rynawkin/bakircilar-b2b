/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost', '139.59.133.81'],
  },
  async rewrites() {
    // Proxy API requests to backend to avoid CORS and Mixed Content issues
    // Use BACKEND_URL (server-side) or fallback to NEXT_PUBLIC_API_URL or localhost
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

    console.log('Next.js Rewrite Config - Backend URL:', backendUrl);

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
// Trigger Vercel rebuild - Fix top-products & top-customers routes - 5 Ara 2025 10:20
