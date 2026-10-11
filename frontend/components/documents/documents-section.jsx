"use client";

import { DigitalDocuments } from "@/components/documents/digital-documents";
import { ResourceError, ResourceNotice } from "@/components/ui/resource-state";
import { useApiResource } from "@/hooks/use-api-resource";


export function DocumentsSection({ isAdult, onUnauthenticated }) {
  const documentsResource = useApiResource("/me/documents", {
    fallback: "Não foi possível carregar seus documentos.",
    onUnauthenticated,
  });
  const documents = documentsResource.data;

  return (
    <>
    {documentsResource.status === "loading" ? (
      <ResourceNotice
        title="Documentos digitais"
        message="Carregando documentos…"
        loading
      />
    ) : documentsResource.status === "error" ? (
      <ResourceError
        message={documentsResource.error}
        retryLabel="Recarregar documentos"
        onRetry={documentsResource.reload}
      />
    ) : (
      <DigitalDocuments
        documents={documents}
        isAdult={isAdult}
        onDocumentsChange={documentsResource.updateData}
        onUnauthenticated={onUnauthenticated}
      />
    )}
    </>
  );
}

export default DocumentsSection;
