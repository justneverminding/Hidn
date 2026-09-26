export function escapeHtml(value: string | number | undefined | null): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function classNames(...names: Array<string | undefined | false>): string {
  return names.filter(Boolean).join(" ");
}

export function attribute(
  name: string,
  value: string | number | boolean | undefined | null,
): string {
  if (value === undefined || value === null || value === false) {
    return "";
  }

  if (value === true) {
    return ` ${name}`;
  }

  return ` ${name}="${escapeHtml(value)}"`;
}

export function attributes(
  values: Record<string, string | number | boolean | undefined | null>,
): string {
  return Object.entries(values)
    .map(([name, value]) => attribute(name, value))
    .join("");
}

