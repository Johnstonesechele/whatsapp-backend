/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: [
    'whatsapp-web.js',
    'puppeteer',
    'unzipper',
    '@aws-sdk/client-s3',
    'better-sqlite3',
    'pg',
    'bcryptjs',
    'jsonwebtoken',
    'imap',
    'mailparser',
    'nodemailer',
    'twilio',
    'qrcode',
  ],
}
export default nextConfig
