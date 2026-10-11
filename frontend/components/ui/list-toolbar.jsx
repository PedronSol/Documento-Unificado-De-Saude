"use client";

import { useEffect, useId, useRef, useState } from "react";
import Search from "lucide-react/dist/esm/icons/search";
import X from "lucide-react/dist/esm/icons/x";

import { ClinicalSelect } from "@/components/ui/clinical-select";
import { PAGE_SIZE_OPTIONS } from "@/hooks/use-paginated-resource";


const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_LENGTH = 2;
const ALL = "all";
const PAGE_SIZE_SELECT_OPTIONS = PAGE_SIZE_OPTIONS.map((size) => ({
  value: String(size),
  label: String(size),
}));


// Search, server-side filters and page size for a paginated list.
export function ListToolbar({
  searchLabel,
  query,
  onQueryChange,
  filters = [],
  pageSize,
  onPageSizeChange,
  total,
}) {
  const inputId = useId();
  const pageSizeId = useId();
  const [draft, setDraft] = useState(query);
  const lastSentRef = useRef(query);

  // An external clear (for example "Limpar busca e filtros") resets the field.
  useEffect(() => {
    if (query !== lastSentRef.current) {
      lastSentRef.current = query;
      setDraft(query);
    }
  }, [query]);

  useEffect(() => {
    const term = draft.trim();
    if (term === lastSentRef.current || (term && term.length < SEARCH_MIN_LENGTH)) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      lastSentRef.current = term;
      onQueryChange(term);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, onQueryChange]);

  function clearSearch() {
    setDraft("");
    lastSentRef.current = "";
    onQueryChange("");
  }

  return (
    <div className="list-toolbar">
      {searchLabel ? (
        <div className="list-toolbar-search">
          <label htmlFor={inputId}>{searchLabel}</label>
          <div>
            <Search aria-hidden="true" size={17} />
            <input
              id={inputId}
              type="search"
              value={draft}
              maxLength={100}
              onChange={(event) => setDraft(event.target.value)}
            />
            {draft ? (
              <button type="button" aria-label="Limpar busca" onClick={clearSearch}>
                <X aria-hidden="true" size={16} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {filters.map((filter) => (
        <div className="list-toolbar-field" key={filter.id}>
          <label htmlFor={filter.id}>{filter.label}</label>
          <ClinicalSelect
            id={filter.id}
            name={filter.id}
            options={[{ value: ALL, label: "Todos" }, ...filter.options]}
            value={filter.value || ALL}
            onValueChange={(value) => filter.onChange(value === ALL ? "" : value)}
          />
        </div>
      ))}
      <div className="list-toolbar-field list-toolbar-size">
        <label htmlFor={pageSizeId}>Itens por página</label>
        <ClinicalSelect
          id={pageSizeId}
          name="page_size"
          options={PAGE_SIZE_SELECT_OPTIONS}
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        />
      </div>
      <p className="list-toolbar-total">
        {total} {total === 1 ? "resultado" : "resultados"}
      </p>
    </div>
  );
}

export default ListToolbar;
