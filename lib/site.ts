import type { Metadata } from "next";

import { SITE_NAME } from "@/lib/brand";

const DEFAULT_SITE_URL = "http://127.0.0.1:3000";

export function getSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
    ?? DEFAULT_SITE_URL;

  try {
    return new URL(value);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

export function buildAbsoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}

export function buildOpenGraphMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Pick<Metadata, "alternates" | "openGraph" | "twitter"> {
  const url = buildAbsoluteUrl(path);

  return {
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
