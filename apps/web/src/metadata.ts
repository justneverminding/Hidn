export type HidnPageKind =
  | "shell"
  | "public-home"
  | "public-page"
  | "explore"
  | "private-room"
  | "design-system"
  | "anonymous-confession"
  | "not-found"
  | "admin"
  | "api";

export interface HidnMetadata {
  kind: HidnPageKind;
  title: string;
  description: string;
  canonicalPath: string;
  imagePath?: string;
  structuredData?: Record<string, unknown>;
}

export const PUBLIC_SITE_ORIGIN = "https://hidnroom.com";

const HOME_STRUCTURED_DATA: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${PUBLIC_SITE_ORIGIN}/#website`,
      url: `${PUBLIC_SITE_ORIGIN}/`,
      name: "HIDN",
      alternateName: "HIDN · Say what you can't say out loud",
      description: "A private room with no names. Say what you can't say out loud, and nobody, not even HIDN, knows it was you.",
      publisher: { "@id": `${PUBLIC_SITE_ORIGIN}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${PUBLIC_SITE_ORIGIN}/#organization`,
      name: "HIDN",
      alternateName: "HIDN · Say what you can't say out loud",
      url: `${PUBLIC_SITE_ORIGIN}/`,
      logo: `${PUBLIC_SITE_ORIGIN}/brand/hidn-mark.png`,
    },
  ],
};

export const SHELL_METADATA: HidnMetadata = {
  kind: "shell",
  title: "HIDN · Say what you can't say out loud",
  description:
    "A private room with no names. Say what you can't say out loud, and nobody, not even HIDN, knows it was you.",
  canonicalPath: "/",
};

export const HOME_METADATA: HidnMetadata = {
  kind: "public-home",
  title: "HIDN · Say what you can't say out loud",
  description:
    "A private room with no names. Say what you can't say out loud, and nobody, not even HIDN, knows it was you.",
  canonicalPath: "/",
  imagePath: "/brand/og/home.png?v=2",
  structuredData: HOME_STRUCTURED_DATA,
};

export const EXPLORE_METADATA: HidnMetadata = {
  kind: "private-room",
  title: "The room · HIDN",
  description: "A private room with no names. Say what you can't say out loud, and nobody, not even HIDN, knows it was you.",
  canonicalPath: "/room",
  imagePath: "/brand/og/home.png?v=2",
};

export const ROOM_METADATA: HidnMetadata = {
  kind: "private-room",
  title: "Get in without a name · HIDN",
  description: "No email, no phone number, no username. A private key made in your browser is your way in.",
  canonicalPath: "/room/access",
};

export const SYSTEM_METADATA: HidnMetadata = {
  kind: "design-system",
  title: "Visual design system · HIDN",
  description: "Internal HIDN visual system preview. Not a public product page.",
  canonicalPath: "/system",
};

/**
 * Anonymous confession pages are private-by-default at the discovery layer.
 * This is a metadata policy, not a claim that a future implementation is
 * automatically private in every other technical sense.
 */
export function robotsForPage(kind: HidnPageKind): string {
  if (
    kind === "private-room" ||
    kind === "anonymous-confession" ||
    kind === "design-system" ||
    kind === "admin" ||
    kind === "api" ||
    kind === "not-found"
  ) {
    return "noindex, nofollow, noarchive, nosnippet";
  }

  return "index, follow";
}

export function webPageStructuredData(
  title: string,
  description: string,
  canonicalPath: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${PUBLIC_SITE_ORIGIN}${canonicalPath}#webpage`,
    url: `${PUBLIC_SITE_ORIGIN}${canonicalPath}`,
    name: title,
    description,
    isPartOf: { "@id": `${PUBLIC_SITE_ORIGIN}/#website` },
  };
}

function setMeta(attribute: "name" | "property", key: string, value: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }

  element.content = value;
}

function setCanonical(path: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.append(element);
  }

  element.href = new URL(path, window.location.origin).href;
}

function setStructuredData(data: Record<string, unknown> | undefined): void {
  const existing = document.head.querySelector<HTMLScriptElement>(
    'script[data-hidn-structured-data="true"]',
  );

  existing?.remove();

  if (!data) {
    return;
  }

  const element = document.createElement("script");
  element.type = "application/ld+json";
  element.dataset.hidnStructuredData = "true";
  element.textContent = JSON.stringify(data);
  document.head.append(element);
}

export function applyMetadata(metadata: HidnMetadata): void {
  document.title = metadata.title;
  setMeta("name", "description", metadata.description);
  setMeta("name", "robots", robotsForPage(metadata.kind));
  setMeta("property", "og:site_name", "HIDN");
  setMeta("property", "og:title", metadata.title);
  setMeta("property", "og:description", metadata.description);
  setMeta("property", "og:url", new URL(metadata.canonicalPath, window.location.origin).href);
  setMeta("property", "og:type", metadata.kind === "anonymous-confession" ? "article" : "website");
  setMeta("property", "og:locale", "en_US");
  setMeta("name", "twitter:title", metadata.title);
  setMeta("name", "twitter:description", metadata.description);
  setMeta("name", "twitter:card", metadata.imagePath ? "summary_large_image" : "summary");

  if (metadata.imagePath) {
    setMeta("property", "og:image", new URL(metadata.imagePath, window.location.origin).href);
    setMeta("property", "og:image:alt", "HIDN — Welcome to HIDN. Are you sure you're in the right place?");
    setMeta("name", "twitter:image", new URL(metadata.imagePath, window.location.origin).href);
    setMeta("name", "twitter:image:alt", "HIDN — Welcome to HIDN. Are you sure you're in the right place?");
  } else {
    document.head.querySelector('meta[property="og:image"]')?.remove();
    document.head.querySelector('meta[property="og:image:alt"]')?.remove();
    document.head.querySelector('meta[name="twitter:image"]')?.remove();
    document.head.querySelector('meta[name="twitter:image:alt"]')?.remove();
  }

  setCanonical(metadata.canonicalPath);
  setStructuredData(metadata.structuredData);
}
