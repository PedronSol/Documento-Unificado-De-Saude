from pathlib import Path
from typing import BinaryIO, Protocol
from uuid import uuid4
import os


class DocumentStorage(Protocol):
    def publish(self, source: BinaryIO, key: str) -> None: ...

    def open(self, key: str) -> BinaryIO: ...

    def remove(self, key: str) -> None: ...


class LocalDocumentStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)

    def publish(self, source: BinaryIO, key: str) -> None:
        target = self._resolve_key(key)
        temporary = self.root / f".{uuid4().hex}.tmp"
        try:
            with temporary.open("xb") as output:
                os.chmod(temporary, 0o600)
                source.seek(0)
                while chunk := source.read(64 * 1024):
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            # A hard link publishes within the same private filesystem and,
            # unlike replace(), atomically refuses to overwrite an existing key.
            os.link(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)

    def open(self, key: str) -> BinaryIO:
        return self._resolve_key(key).open("rb")

    def remove(self, key: str) -> None:
        self._resolve_key(key).unlink(missing_ok=True)

    def _resolve_key(self, key: str) -> Path:
        if not key or Path(key).name != key or key in {".", ".."}:
            raise ValueError("Chave de documento inválida.")
        target = (self.root / key).resolve()
        if target.parent != self.root:
            raise ValueError("Chave de documento inválida.")
        return target
