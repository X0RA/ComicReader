const withPWA = require('next-pwa');

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
};

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  // skipWaiting: true,
  // scope: '/app',
  disable: process.env.NODE_ENV === 'development'
})(nextConfig);

module.exports = pwaConfig; 