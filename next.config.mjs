import { withSentryConfig } from "@sentry/nextjs";

const isProduction = process.env.NODE_ENV === "production";

function originFromUrl(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function supabaseOrigins() {
  const origin = originFromUrl(process.env.SUPABASE_URL);
  if (!origin) return [];
  const websocketOrigin = origin.replace(/^http/, "ws");
  return [origin, websocketOrigin];
}

function sentryOrigins() {
  const origins = new Set([
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://*.sentry.io",
  ]);
  for (const value of [process.env.SENTRY_DSN, process.env.NEXT_PUBLIC_SENTRY_DSN]) {
    const origin = originFromUrl(value);
    if (origin) origins.add(origin);
  }
  return [...origins];
}

const cspDirectives = [
  ["default-src", "'self'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"],
  ["frame-ancestors", "'none'"],
  ["object-src", "'none'"],
  ["script-src", "'self'", "'unsafe-inline'", ...(isProduction ? [] : ["'unsafe-eval'"])],
  ["style-src", "'self'", "'unsafe-inline'"],
  ["img-src", "'self'", "data:", "blob:"],
  ["font-src", "'self'", "data:"],
  ["connect-src", "'self'", ...supabaseOrigins(), ...sentryOrigins()],
  ["frame-src", "'none'"],
  ["worker-src", "'self'", "blob:"],
  ...(isProduction ? [["upgrade-insecure-requests"]] : []),
];

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives.map((directive) => directive.join(" ")).join("; ") },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(isProduction ? [{
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  }] : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { instrumentationHook: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
});
