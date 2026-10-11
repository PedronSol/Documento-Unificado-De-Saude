"""Evolui documentos para armazenamento privado e auditado.

Revision ID: 0013
Revises: 0012
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("original_filename", sa.String(255), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("storage_key", sa.String(80), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("media_type", sa.String(32), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("sha256", sa.String(64), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("removed_at", mysql.DATETIME(fsp=6), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("storage_deleted_at", mysql.DATETIME(fsp=6), nullable=True),
    )

    op.alter_column(
        "documents",
        "status_documento",
        existing_type=mysql.ENUM("viewed", "new"),
        type_=sa.String(20),
        existing_nullable=True,
        nullable=True,
    )
    op.execute(
        """
        UPDATE documents
        SET status_documento = 'removed',
            created_at = COALESCE(CAST(data_criacao_documento AS DATETIME(6)),
                                  UTC_TIMESTAMP(6)),
            removed_at = UTC_TIMESTAMP(6)
        """
    )
    op.execute(
        """
        UPDATE documents
        SET titulo_documento = 'Documento legado'
        WHERE titulo_documento IS NULL OR TRIM(titulo_documento) = ''
        """
    )
    op.execute(
        """
        UPDATE documents
        SET tipo_documento = 'other'
        WHERE tipo_documento IS NULL
           OR tipo_documento NOT IN ('exam', 'prescription', 'report', 'other')
        """
    )
    op.alter_column(
        "documents",
        "status_documento",
        existing_type=sa.String(20),
        type_=mysql.ENUM(
            "uploaded",
            "processing",
            "needs_review",
            "confirmed",
            "failed",
            "removed",
        ),
        existing_nullable=True,
        nullable=False,
    )
    op.alter_column(
        "documents",
        "titulo_documento",
        existing_type=sa.String(50),
        type_=sa.String(120),
        existing_nullable=True,
        nullable=False,
    )
    op.alter_column(
        "documents",
        "tipo_documento",
        existing_type=sa.String(20),
        type_=mysql.ENUM("exam", "prescription", "report", "other"),
        existing_nullable=True,
        nullable=False,
    )
    op.alter_column(
        "documents",
        "created_at",
        existing_type=mysql.DATETIME(fsp=6),
        existing_nullable=True,
        nullable=False,
    )

    op.create_unique_constraint(
        "uq_documents_storage_key",
        "documents",
        ["storage_key"],
    )
    op.create_check_constraint(
        "ck_documents_active_file",
        "documents",
        "status_documento = 'removed' OR "
        "(original_filename IS NOT NULL AND storage_key IS NOT NULL "
        "AND media_type IS NOT NULL AND size_bytes IS NOT NULL "
        "AND sha256 IS NOT NULL)",
    )
    op.create_check_constraint(
        "ck_documents_positive_size",
        "documents",
        "size_bytes IS NULL OR size_bytes > 0",
    )
    op.create_check_constraint(
        "ck_documents_sha256",
        "documents",
        "sha256 IS NULL OR sha256 REGEXP '^[0-9a-f]{64}$'",
    )
    op.create_index(
        "idx_documents_patient_status_created",
        "documents",
        ["patient_id", "status_documento", "created_at", "id_documento"],
    )
    op.create_index(
        "idx_documents_cleanup",
        "documents",
        ["status_documento", "storage_deleted_at"],
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
