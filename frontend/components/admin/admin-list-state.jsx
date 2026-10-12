import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";

import { InfiniteListFooter } from "@/components/ui/infinite-list-footer";
import { ListToolbar } from "@/components/ui/list-toolbar";


const SIZE_CONTROL_THRESHOLD = 10;


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
  // Admin endpoints without search expose only the page size (spec 038, 17b).
  if (resource.status === "ready" && resource.total > SIZE_CONTROL_THRESHOLD) {
    return (
      <ListToolbar
        searchLabel={null}
        query=""
        onQueryChange={() => {}}
        pageSize={resource.pageSize}
        onPageSizeChange={resource.setPageSize}
        total={resource.total}
      />
    );
  }
  return null;
}


export function LoadMore({ resource, itemLabel = "itens" }) {
  if (resource.status !== "ready" || resource.items.length === 0) {
    return null;
  }
  return <InfiniteListFooter resource={resource} itemLabel={itemLabel} />;
}
