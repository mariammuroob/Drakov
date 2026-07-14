import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { agentActionResponseSchema, zodErrorMessage } from "./validation";

const MAX_RESPONSE_BYTES = 32 * 1024;
const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 2;

const PLACEHOLDER_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
]);

const PLACEHOLDER_TERMS = [
  "example",
  "placeholder",
  "your-deployed-agent",
  "your-agent",
  "fake",
  "dummy",
  "sample",
  "test",
];

export type EndpointVerificationResult =
  | {
      ok: true;
      normalizedUrl: string;
      latencyMs: number;
      status: "verified";
    }
  | {
      ok: false;
      error: string;
      status:
        | "placeholder_url"
        | "invalid_url"
        | "blocked_network"
        | "unreachable"
        | "timeout"
        | "invalid_response";
      latencyMs?: number;
    };

type EndpointVerificationFailure = Extract<EndpointVerificationResult, { ok: false }>;

export type LookupAddress = { address: string; family: number };
export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;
export type FetchFn = typeof fetch;

export type VerifyEndpointOptions = {
  timeoutMs?: number;
  production?: boolean;
  lookup?: LookupFn;
  fetch?: FetchFn;
};

export type SafeAgentEndpointRequestOptions = VerifyEndpointOptions & {
  accept?: string;
};

export class AgentEndpointRequestError extends Error {
  constructor(
    message: string,
    public readonly status: EndpointVerificationFailure["status"],
  ) {
    super(message);
    this.name = "AgentEndpointRequestError";
  }
}

const TEST_AGENT_PAYLOAD = {
  tick: "2026-07-03T00:00:00.000Z",
  agent: {
    id: "8c742dd3-547f-44c7-a8a7-6ec5194a64e2",
    name: "Endpoint Verifier",
    cash: 10000,
    reputation: 50,
    status: "independent",
  },
  employment: null,
  company: null,
  companies: [],
  hot_market_sector: "education",
  available_offers: {
    jobs: [
      {
        id: "5cf4d418-14ac-4891-a160-20a144e1b31a",
        company_id: "ca1500bf-f3ab-4827-a5c4-f2ae85a44ca4",
        title: "Researcher",
        salary: 500,
        equity_pct: 2,
      },
    ],
    acquisitions: [],
  },
};

function fail(
  status: EndpointVerificationFailure["status"],
  error: string,
  latencyMs?: number,
): EndpointVerificationFailure {
  return typeof latencyMs === "number" ? { ok: false, status, error, latencyMs } : { ok: false, status, error };
}

function normalizeHostname(hostname: string) {
  return hostname.trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function isPlaceholderHostname(hostname: string) {
  const host = normalizeHostname(hostname);
  if (PLACEHOLDER_HOSTS.has(host)) return true;
  if (host.endsWith(".example.com") || host.endsWith(".example.org") || host.endsWith(".example.net")) return true;
  const labels = host.split(".");
  if (labels.some((label) => PLACEHOLDER_TERMS.includes(label))) return true;
  return PLACEHOLDER_TERMS.some((term) => host.includes(`${term}-`) || host.includes(`-${term}`));
}

function isInternalHostname(hostname: string) {
  const host = normalizeHostname(hostname);
  if (!host || host === "localhost") return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home")) return true;
  return !host.includes(".") && isIP(host) === 0;
}

function ipv4ToNumber(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((sum, part) => (sum << 8) + part, 0) >>> 0;
}

function inIpv4Range(address: string, base: string, mask: number) {
  const value = ipv4ToNumber(address);
  const baseValue = ipv4ToNumber(base);
  if (value === null || baseValue === null) return false;
  const maskValue = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
  return (value & maskValue) === (baseValue & maskValue);
}

function isBlockedIpv4(address: string) {
  return [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ].some(([base, mask]) => inIpv4Range(address, base as string, mask as number));
}

function expandIpv6(address: string) {
  const clean = address.toLowerCase().split("%")[0];
  if (clean.includes(".")) return clean;
  const halves = clean.split("::");
  if (halves.length > 2) return clean;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) return clean;
  return [...left, ...Array.from({ length: missing }, () => "0"), ...right]
    .map((part) => part.padStart(4, "0"))
    .join(":");
}

function isBlockedIpv6(address: string) {
  const expanded = expandIpv6(address);
  const firstHextet = Number.parseInt(expanded.slice(0, 4), 16);
  if (expanded === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
  if (expanded === "0000:0000:0000:0000:0000:0000:0000:0000") return true;
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) return true;
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true;
  if (firstHextet >= 0xff00 && firstHextet <= 0xffff) return true;
  if (expanded.startsWith("2001:0db8")) return true;
  return false;
}

export function isBlockedAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isBlockedIpv4(address);
  if (version === 6) return isBlockedIpv6(address);
  return true;
}

function parseEndpointUrl(value: string, production: boolean): URL | EndpointVerificationFailure {
  const trimmed = value.trim();
  if (!trimmed) return fail("invalid_url", "Enter your deployed agent endpoint.");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return fail("invalid_url", "Enter a valid agent endpoint URL.");
  }

  if (url.username || url.password) return fail("invalid_url", "URLs with embedded credentials are not allowed.");
  if (url.protocol !== "http:" && url.protocol !== "https:") return fail("invalid_url", "Only HTTP and HTTPS endpoint URLs are allowed.");
  if (production && url.protocol !== "https:") return fail("invalid_url", "Production agent endpoints must use HTTPS.");

  const hostname = normalizeHostname(url.hostname);
  if (isInternalHostname(hostname)) return fail("blocked_network", "Private or local network URLs are not allowed.");
  if (isIP(hostname) && isBlockedAddress(hostname)) return fail("blocked_network", "Private or local network URLs are not allowed.");
  if (isPlaceholderHostname(hostname)) return fail("placeholder_url", "This is a placeholder URL. Enter your deployed agent endpoint.");

  url.hash = "";
  return url;
}

async function defaultLookup(hostname: string) {
  const directIpVersion = isIP(hostname);
  if (directIpVersion) return [{ address: hostname, family: directIpVersion }];
  return dnsLookup(hostname, { all: true, verbatim: true });
}

async function assertResolvedPublic(url: URL, lookup: LookupFn): Promise<EndpointVerificationFailure | null> {
  try {
    const addresses = await lookup(normalizeHostname(url.hostname));
    if (!addresses.length) return fail("unreachable", "We could not connect to this endpoint.");
    if (addresses.some((entry) => isBlockedAddress(entry.address))) {
      return fail("blocked_network", "Private or local network URLs are not allowed.");
    }
    return null;
  } catch {
    return fail("unreachable", "We could not connect to this endpoint.");
  }
}

async function readLimitedJson(response: Response): Promise<unknown> {
  if (!response.body) {
    const text = await response.text();
    return JSON.parse(text);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error("response too large");
      chunks.push(value);
    }
  }

  const body = new TextDecoder().decode(Buffer.concat(chunks));
  return JSON.parse(body);
}

export async function fetchAgentEndpointJson(
  endpointUrl: string,
  payload: unknown,
  options: SafeAgentEndpointRequestOptions = {},
): Promise<{ json: unknown; normalizedUrl: string; latencyMs: number }> {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const lookup = options.lookup ?? defaultLookup;
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  let current = parseEndpointUrl(endpointUrl, production);
  if (!(current instanceof URL)) {
    throw new AgentEndpointRequestError(current.error, current.status);
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const resolvedError = await assertResolvedPublic(current, lookup);
    if (resolvedError) throw new AgentEndpointRequestError(resolvedError.error, resolvedError.status);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetcher(current.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": options.accept ?? "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new AgentEndpointRequestError("We could not connect to this endpoint.", "unreachable");
        }
        const redirected = parseEndpointUrl(new URL(location, current).toString(), production);
        if (!(redirected instanceof URL)) {
          throw new AgentEndpointRequestError(redirected.error, redirected.status);
        }
        current = redirected;
        continue;
      }

      if (!response.ok) {
        throw new AgentEndpointRequestError(`endpoint returned HTTP ${response.status}`, "unreachable");
      }

      try {
        return {
          json: await readLimitedJson(response),
          normalizedUrl: current.toString(),
          latencyMs: Date.now() - startedAt,
        };
      } catch {
        throw new AgentEndpointRequestError("endpoint returned malformed JSON", "invalid_response");
      }
    } catch (error) {
      if (error instanceof AgentEndpointRequestError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AgentEndpointRequestError("endpoint timed out after 6 seconds", "timeout");
      }
      throw new AgentEndpointRequestError("We could not connect to this endpoint.", "unreachable");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new AgentEndpointRequestError("We could not connect to this endpoint.", "unreachable");
}

export async function verifyAgentEndpoint(
  endpointUrl: string,
  options: VerifyEndpointOptions = {},
): Promise<EndpointVerificationResult> {
  const production = options.production ?? process.env.NODE_ENV === "production";
  const lookup = options.lookup ?? defaultLookup;
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  let current = parseEndpointUrl(endpointUrl, production);
  if (!(current instanceof URL)) return current;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const resolvedError = await assertResolvedPublic(current, lookup);
    if (resolvedError) return resolvedError;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetcher(current.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(TEST_AGENT_PAYLOAD),
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startedAt;
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) return fail("unreachable", "We could not connect to this endpoint.", latencyMs);
        const redirected = parseEndpointUrl(new URL(location, current).toString(), production);
        if (!(redirected instanceof URL)) return redirected;
        current = redirected;
        continue;
      }

      if (!response.ok) return fail("unreachable", "We could not connect to this endpoint.", latencyMs);

      let raw: unknown;
      try {
        raw = await readLimitedJson(response);
      } catch {
        return fail("invalid_response", "The endpoint returned an invalid agent response.", latencyMs);
      }

      const parsed = agentActionResponseSchema.safeParse(raw);
      if (!parsed.success) {
        return fail("invalid_response", `The endpoint returned an invalid agent response. ${zodErrorMessage(parsed.error)}`, latencyMs);
      }

      return {
        ok: true,
        normalizedUrl: current.toString(),
        latencyMs,
        status: "verified",
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      if (error instanceof Error && error.name === "AbortError") {
        return fail("timeout", "The endpoint timed out.", latencyMs);
      }
      return fail("unreachable", "We could not connect to this endpoint.", latencyMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  return fail("unreachable", "We could not connect to this endpoint.", Date.now() - startedAt);
}

export function parseWithSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  invalidMessage: string,
) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AgentEndpointRequestError(`${invalidMessage}: ${zodErrorMessage(parsed.error)}`, "invalid_response");
  }
  return parsed.data;
}
