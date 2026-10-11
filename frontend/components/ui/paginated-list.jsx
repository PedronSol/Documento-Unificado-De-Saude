"use client";

import { useRef } from "react";

import { InfiniteListFooter } from "@/components/ui/infinite-list-footer";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { ResourceError } from "@/components/ui/resource-state";


const TOOLBAR_THRESHOLD = 10;


// Server-paginated list frame (spec 038): toolbar, load/error/empty states,
// the feature's items and the infinite-scroll footer.
export function PaginatedList({
  list,
  searchLabel,
  filters = [],
  itemLabel,
  loadingText,
  emptyText,
  retryLabel,
  renderItems,
  renderEmpty = null,
  emptyClassName = "",
}) {
  const { resource } = list;
  const unfilteredTotalRef = useRef(0);
  if (!list.isFiltered && resource.status === "ready") {
    unfilteredTotalRef.current = resource.total;
  }
  const showToolbar = list.isFiltered || unfilteredTotalRef.current > TOOLBAR_THRESHOLD;

  return (
    <div className="paginated-list">
      {showToolbar ? (
        <ListToolbar
          searchLabel={searchLabel}
          query={list.query}
          onQueryChange={list.setQuery}
          filters={filters}
          pageSize={list.pageSize}
          onPageSizeChange={list.setPageSize}
          total={resource.total}
        />
      ) : null}

      {resource.status === "loading" ? <p role="status">{loadingText}</p> : null}
      {resource.status === "error" ? (
        <ResourceError
          message={resource.error}
          retryLabel={retryLabel}
          onRetry={resource.reload}
        />
      ) : null}
      {resource.status === "ready" && resource.items.length === 0 && renderEmpty && !list.isFiltered
        ? renderEmpty()
        : null}
      {resource.status === "ready" && resource.items.length === 0 && !(renderEmpty && !list.isFiltered) ? (
        <ListEmptyState
          className={emptyClassName}
          isFiltered={list.isFiltered}
          query={list.query}
          emptyText={emptyText}
          onClear={list.clear}
        />
      ) : null}
      {resource.status === "ready" && resource.items.length > 0 ? (
        <>
          {renderItems(resource.items)}
          <InfiniteListFooter resource={resource} itemLabel={itemLabel} />
        </>
      ) : null}
    </div>
  );
}

export default PaginatedList;
