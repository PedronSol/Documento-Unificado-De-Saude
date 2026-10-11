from dataclasses import dataclass
from hashlib import sha256
from pathlib import PurePath
from tempfile import SpooledTemporaryFile
from typing import BinaryIO
import re

from fastapi import HTTPException, UploadFile, status


CHUNK_SIZE = 64 * 1024
ALLOWED_FILES = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}


@dataclass
class StagedDocument:
    content: BinaryIO
    original_filename: str
    extension: str
    media_type: str
    size_bytes: int
    checksum: str

    def close(self) -> None:
        self.content.close()


async def stage_valid_document(
    upload: UploadFile,
    *,
    max_bytes: int,
) -> StagedDocument:
    filename = _safe_filename(upload.filename)
    extension = PurePath(filename).suffix.lower()
    expected_media_type = ALLOWED_FILES.get(extension)
    if expected_media_type is None or upload.content_type != expected_media_type:
        raise _invalid_file()

    staged = SpooledTemporaryFile(max_size=min(max_bytes, 1024 * 1024), mode="w+b")
    digest = sha256()
    size = 0
    try:
        while chunk := await upload.read(CHUNK_SIZE):
            size += len(chunk)
            if size > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="O arquivo excede o limite de 10 MB.",
                )
            digest.update(chunk)
            staged.write(chunk)
        if not _has_valid_structure(staged, size, expected_media_type):
            raise _invalid_file()
        staged.seek(0)
        canonical_extension = ".jpg" if expected_media_type == "image/jpeg" else extension
        return StagedDocument(
            content=staged,
            original_filename=filename,
            extension=canonical_extension,
            media_type=expected_media_type,
            size_bytes=size,
            checksum=digest.hexdigest(),
        )
    except BaseException:
        staged.close()
        raise


def normalize_title(value: str) -> str:
    normalized = " ".join(value.split())
    if not 1 <= len(normalized) <= 120:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Título deve ter entre 1 e 120 caracteres.",
        )
    return normalized


def _safe_filename(value: str | None) -> str:
    filename = (value or "").replace("\\", "/").rsplit("/", 1)[-1]
    filename = re.sub(r"[\x00-\x1f\x7f]", "", filename).strip()
    if not filename or len(filename) > 255:
        raise _invalid_file()
    return filename


def _has_valid_structure(content: BinaryIO, size: int, media_type: str) -> bool:
    if not size:
        return False
    content.seek(0)
    beginning = content.read(32)
    if media_type == "application/pdf":
        content.seek(max(0, size - 1024))
        ending = content.read()
        return beginning.startswith(b"%PDF-") and ending.rstrip().endswith(b"%%EOF")
    if media_type == "image/jpeg":
        content.seek(max(0, size - 2))
        return beginning.startswith(b"\xff\xd8\xff") and content.read() == b"\xff\xd9"
    if media_type == "image/png":
        content.seek(max(0, size - 12))
        return (
            beginning.startswith(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
            and content.read() == b"\x00\x00\x00\x00IEND\xaeB`\x82"
        )
    return False


def _invalid_file() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Envie um arquivo PDF, JPG ou PNG válido.",
    )
