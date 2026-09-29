export type HidnPageKind =
  | "shell"
  | "public-home"
  | "public-page"
  | "explore"
  | "confession-flow"
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

export const SHELL_METADATA: HidnMetadata = {
  kind: "shell",
  title: "HIDN — Anonymous Internet Noir",
  description:
    "HIDN is an anonymous confession platform designed around privacy by default.",
  canonicalPath: "/",
};

export const HOME_METADATA: HidnMetadata = {
  kind: "public-home",
  title: "HIDN — Say What You Can't Say Publicly",
  description:
    "Anonymous confessions without accounts or public identity. No accounts. No usernames. No public history.",
  canonicalPath: "/",
  imagePath: "/brand/references/hidn-brand-reference-02.png",
};

export const EXPLORE_METADATA: HidnMetadata = {
  kind: "explore",
  title: "HIDN — Confessions",
  description: "Anonymous transmissions in a local mock stream. No identities.",
  canonicalPath: "/explore",
  imagePath: "/brand/references/hidn-brand-reference-02.png",
};

export const CONFESS_METADATA: HidnMetadata = {
  kind: "confession-flow",
  title: "HIDN — Confess",
  description: "Write what you cannot say publicly without creating an account or public identity.",
  canonicalPath: "/confess",
};

export const ROOM_METADATA: HidnMetadata = {
  kind: "private-room",
  title: "HIDN — Enter the Private Room",
  description: "A local prototype for creating or using a nameless HIDN room ID.",
  canonicalPath: "/room",
};

export const SYSTEM_METADATA: HidnMetadata = {
  kind: "design-system",
  title: "HIDN — Visual Design System",
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
    kind === "confession-flow" ||
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
  setMeta("property", "og:title", metadata.title);
  setMeta("property", "og:description", metadata.description);
  setMeta("property", "og:url", new URL(metadata.canonicalPath, window.location.origin).href);
  setMeta("property", "og:type", metadata.kind === "anonymous-confession" ? "article" : "website");
  setMeta("name", "twitter:title", metadata.title);
  setMeta("name", "twitter:description", metadata.description);

  if (metadata.imagePath) {
    setMeta("property", "og:image", new URL(metadata.imagePath, window.location.origin).href);
    setMeta("name", "twitter:image", new URL(metadata.imagePath, window.location.origin).href);
  }

  setCanonical(metadata.canonicalPath);
  setStructuredData(metadata.structuredData);
}
