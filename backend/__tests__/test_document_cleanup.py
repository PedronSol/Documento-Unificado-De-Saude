from documents.cleanup import cleanup_removed_documents


class Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows


class CleanupConnection:
    def __init__(self, rows):
        self.rows = rows
        self.executed = []

    def exec_driver_sql(self, statement, parameters=None):
        sql = " ".join(statement.split())
        self.executed.append((sql, parameters or ()))
        if sql.startswith("SELECT id_documento"):
            return Result(self.rows)
        return Result([])


class CleanupTransaction:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        return self.connection

    def __exit__(self, exc_type, exc_value, traceback):
        return False


class CleanupEngine:
    def __init__(self, rows):
        self.connection = CleanupConnection(rows)

    def begin(self):
        return CleanupTransaction(self.connection)


class CleanupStorage:
    def __init__(self):
        self.removed = []

    def remove(self, key):
        self.removed.append(key)


def test_cleanup_locks_only_removed_documents_and_marks_deleted_files():
    engine = CleanupEngine(
        [
            {"document_id": 7, "storage_key": "a" * 64 + ".pdf"},
            {"document_id": 8, "storage_key": "b" * 64 + ".jpg"},
        ]
    )
    storage = CleanupStorage()

    cleaned = cleanup_removed_documents(engine, storage, batch_size=25)

    assert cleaned == 2
    select = engine.connection.executed[0]
    assert "status_documento = 'removed'" in select[0]
    assert "storage_deleted_at IS NULL" in select[0]
    assert "FOR UPDATE SKIP LOCKED" in select[0]
    assert select[1] == (25,)
    assert storage.removed == ["a" * 64 + ".pdf", "b" * 64 + ".jpg"]
    assert [parameters for _sql, parameters in engine.connection.executed[1:]] == [
        (7,),
        (8,),
    ]
