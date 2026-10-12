"use client";

import { DigitalDocuments } from "@/components/documents/digital-documents";
import { usePaginatedList } from "@/hooks/use-paginated-list";


export function DocumentsSection({ isAdult, onUnauthenticated }) {
  const list = usePaginatedList("/me/documents", {
    fallback: "Não foi possível carregar seus documentos.",
    initialFilters: { type: "" },
    onUnauthenticated,
  });

  return (
    <DigitalDocuments
      list={list}
      isAdult={isAdult}
      onUnauthenticated={onUnauthenticated}
    />
  );
}

export default DocumentsSection;
