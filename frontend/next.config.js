/** @type {import('next').NextConfig} */
// Vercel keeps running the normal server build. Only the iOS app build
// (`npm run build:ios`, which sets BUILD_TARGET=capacitor) switches to a
// static export that Capacitor can bundle into the native shell.
const isCapacitorBuild = process.env.BUILD_TARGET === "capacitor";

const nextConfig = {
  ...(isCapacitorBuild ? { output: "export" } : {}),
  images: { unoptimized: true },
};

module.exports = nextConfig;
