// Test helpers for server-paginated listings (spec 038).

const PAGING_KEYS = new Set(["page", "page_size"]);

// Removes page and page_size so mocks can key responses by resource path.
export function stripPaging(path) {
  const [base, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  const kept = [...params.entries()].filter(([key]) => !PAGING_KEYS.has(key));
  if (!kept.length) {
    return base;
  }
  return `${base}?${new URLSearchParams(kept).toString()}`;
}

export function isPaged(path) {
  return new URLSearchParams(path.split("?")[1] || "").has("page");
}

export function pageOf(items, { page = 1, pageSize = 20, total = items.length, hasNext = false } = {}) {
  return { items, page, page_size: pageSize, total, has_next: hasNext };
}

// Wraps a plain-array body as a page when the request asked for one.
export function asResponse(path, body, status = 200) {
  const payload = isPaged(path) && Array.isArray(body) ? pageOf(body) : body;
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
}

// A ready paginated list (the shape returned by usePaginatedList) for
// rendering components without network.
export function staticList(items, { total = items.length, reload, ...overrides } = {}) {
  return {
    resource: {
      status: "ready",
      items,
      total,
      hasNext: false,
      isLoadingMore: false,
      loadMoreError: null,
      error: null,
      loadMore: () => {},
      reload: reload || (() => {}),
    },
    query: "",
    setQuery: () => {},
    filters: {},
    setFilter: () => {},
    pageSize: 20,
    setPageSize: () => {},
    clear: () => {},
    isFiltered: false,
    ...overrides,
  };
}

// Lets a test keep mocking by resource path: implementations receive the
// path without page/page_size and plain-array bodies become pages.
export function installPagedApiMock(mock) {
  const setImplementation = mock.mockImplementation.bind(mock);
  mock.mockImplementation = (implementation) => setImplementation(
    (path, options) => Promise.resolve(implementation(stripPaging(path), options))
      .then((response) => {
        if (!response || !isPaged(path) || typeof response.json !== "function") {
          return response;
        }
        return {
          ...response,
          json: async () => {
            const body = await response.json();
            return Array.isArray(body) ? pageOf(body) : body;
          },
        };
      }),
  );
  return mock;
}
