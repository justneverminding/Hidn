import "./styles.css";
import "./product/product.css";
import "./system/system-page.css";

import { applyMetadata, SYSTEM_METADATA } from "./metadata";
import { bindProductRoute, disposeProductRoute, renderProductRoute } from "./product/product-pages";
import { bindSystemPage, renderSystemPage } from "./system/system-page";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("HIDN shell mount point was not found.");
}

const mount = app;

function currentPath(): string {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path || "/";
}

function renderCurrentRoute(): void {
  disposeProductRoute();
  if (currentPath() === "/system") {
    applyMetadata(SYSTEM_METADATA);
    mount.innerHTML = renderSystemPage();
    bindSystemPage();
    return;
  }

  const route = renderProductRoute(currentPath());
  applyMetadata(route.metadata);
  mount.innerHTML = route.html;
  bindProductRoute(mount);
}

function handleInternalNavigation(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link || link.target === "_blank" || link.hasAttribute("download")) {
    return;
  }

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin || url.hash) {
    return;
  }

  event.preventDefault();
  window.history.pushState({}, "", `${url.pathname}${url.search}`);
  renderCurrentRoute();
}

document.addEventListener("click", handleInternalNavigation);
window.addEventListener("popstate", renderCurrentRoute);
window.addEventListener("hidn:rerender", renderCurrentRoute);

renderCurrentRoute();
