import type { Route } from "@playwright/test";

type FulfillOptions = Parameters<Route["fulfill"]>[0];

// Listings are server-paginated (spec 038). Mocks keep returning plain
// arrays; requests that ask for a page receive them wrapped as a page.
export async function fulfillPaged(route: Route, options: FulfillOptions = {}) {
  const url = new URL(route.request().url());
  if (!url.searchParams.has("page") || typeof options.body !== "string") {
    return route.fulfill(options);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(options.body);
  } catch {
    return route.fulfill(options);
  }
  if (!Array.isArray(parsed)) {
    return route.fulfill(options);
  }
  const pageSize = Number(url.searchParams.get("page_size") || 20);
  return route.fulfill({
    ...options,
    body: JSON.stringify({
      items: parsed,
      page: Number(url.searchParams.get("page")),
      page_size: pageSize,
      total: parsed.length,
      has_next: false,
    }),
  });
}
