const AJAX_HEADER = "x-requested-with";
const AJAX_VALUE = "XMLHttpRequest";

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function configuredCorsOrigins(request?: Request) {
  const origins = new Set<string>();
  const requestOrigin = request ? normalizeOrigin(request.url) : null;
  if (requestOrigin) origins.add(requestOrigin);

  for (const value of [process.env.NEXT_PUBLIC_SITE_URL, process.env.SITE_URL]) {
    const origin = normalizeOrigin(value);
    if (origin) origins.add(origin);
  }
  if (process.env.VERCEL_URL) {
    const origin = normalizeOrigin(`https://${process.env.VERCEL_URL}`);
    if (origin) origins.add(origin);
  }
  for (const value of (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const origin = normalizeOrigin(value.trim());
    if (origin) origins.add(origin);
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://127.0.0.1:3000");
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3001");
    origins.add("http://localhost:3001");
  }
  return origins;
}

export function csrfError(request: Request, options: { requireAjax?: boolean } = {}) {
  const requestOrigin = normalizeOrigin(request.url);
  const origin = normalizeOrigin(request.headers.get("origin"));
  const referer = normalizeOrigin(request.headers.get("referer"));
  const sourceOrigin = origin ?? referer;
  const fetchSite = request.headers.get("sec-fetch-site");

  if (!sourceOrigin || !requestOrigin || sourceOrigin !== requestOrigin) {
    return "Cross-site request rejected.";
  }
  if (fetchSite === "cross-site") {
    return "Cross-site request rejected.";
  }
  if (options.requireAjax && request.headers.get(AJAX_HEADER) !== AJAX_VALUE) {
    return "Missing required request verification header.";
  }
  return null;
}

export const AJAX_REQUEST_HEADERS = { "X-Requested-With": AJAX_VALUE } as const;
