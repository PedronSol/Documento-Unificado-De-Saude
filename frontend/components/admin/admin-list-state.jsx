import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";


export function AdminListState({ resource, loadingLabel, emptyLabel, retryLabel }) {
  if (resource.status === "loading" && resource.items.length === 0) {
    return <p className="admin-state" role="status">{loadingLabel}</p>;
  }
  if (resource.status === "error") {
    return (
      <div className="admin-state admin-state-error" role="alert">
        <p>{resource.error}</p>
        <button type="button" onClick={resource.reload}>
          <RefreshCw aria-hidden="true" size={16} />
          {retryLabel}
        </button>
      </div>
    );
  }
  if (resource.status === "ready" && resource.items.length === 0) {
    return <p className="admin-state">{emptyLabel}</p>;
  }
  return null;
}


export function LoadMore({ resource, label }) {
  if (!resource.hasNext) {
    return null;
  }
  return (
    <button
      type="button"
      className="admin-load-more"
      disabled={resource.status === "loading"}
      onClick={resource.loadMore}
    >
      {resource.status === "loading" ? "Carregando…" : label}
    </button>
  );
}
