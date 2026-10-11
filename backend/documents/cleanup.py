from typing import Any


def cleanup_removed_documents(
    engine: Any,
    storage: Any,
    *,
    batch_size: int = 100,
) -> int:
    if not 1 <= batch_size <= 1000:
        raise ValueError("batch_size deve estar entre 1 e 1000.")

    cleaned = 0
    with engine.begin() as connection:
        documents = connection.exec_driver_sql(
            """
            SELECT id_documento AS document_id, storage_key
            FROM documents
            WHERE status_documento = 'removed'
              AND storage_deleted_at IS NULL
              AND storage_key IS NOT NULL
            ORDER BY removed_at, id_documento
            LIMIT %s
            FOR UPDATE SKIP LOCKED
            """,
            (batch_size,),
        ).mappings().all()
        for document in documents:
            storage.remove(document["storage_key"])
            connection.exec_driver_sql(
                """
                UPDATE documents
                SET storage_deleted_at = UTC_TIMESTAMP(6)
                WHERE id_documento = %s
                  AND status_documento = 'removed'
                  AND storage_deleted_at IS NULL
                """,
                (document["document_id"],),
            )
            cleaned += 1
    return cleaned
