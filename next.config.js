/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow server-side fetching without CORS restrictions
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
