"use client";

import { useEffect, useRef } from "react";


// Infinite scroll with an accessible fallback: the sentinel loads the next
// page when visible, and the button keeps it reachable by keyboard, screen
// readers, zoom and browsers without IntersectionObserver (spec 038).
export function InfiniteListFooter({ resource, itemLabel }) {
  const sentinelRef = useRef(null);
  const { hasNext, isLoadingMore, items, loadMore, loadMoreError, total } = resource;
  const autoLoad = hasNext && !isLoadingMore && !loadMoreError;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!autoLoad || !sentinel || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMore();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [autoLoad, items.length, loadMore]);

  return (
    <div className="infinite-list-footer">
      <div ref={sentinelRef} className="infinite-list-sentinel" aria-hidden="true" />
      <p className="infinite-list-progress" role="status" aria-live="polite">
        {items.length} de {total} {itemLabel} carregadas
      </p>
      {loadMoreError ? (
        <div className="form-error infinite-list-error" role="alert">
          <p>{loadMoreError}</p>
          <button type="button" onClick={loadMore}>Tentar novamente</button>
        </div>
      ) : null}
      {hasNext && !loadMoreError ? (
        <button
          className="infinite-list-more"
          type="button"
          disabled={isLoadingMore}
          onClick={loadMore}
        >
          {isLoadingMore ? "Carregando…" : "Carregar mais"}
        </button>
      ) : null}
    </div>
  );
}

export default InfiniteListFooter;
