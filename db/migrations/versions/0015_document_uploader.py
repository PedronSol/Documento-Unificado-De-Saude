"""Registra quem enviou cada documento e por qual papel.

Revision ID: 0015
Revises: 0014
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("uploaded_by_user_id", sa.BigInteger(), nullable=True),
    )
    # Every upload before this revision came through the patient routes.
    op.add_column(
        "documents",
        sa.Column(
            "uploader_role",
            mysql.ENUM("patient", "doctor"),
            nullable=False,
            server_default="patient",
        ),
    )
    # The upload event is the authoritative record of who sent the file.
    op.execute(
        """
        UPDATE documents d
        JOIN clinical_audit_events e
          ON e.resource_type = 'document'
         AND e.resource_id = d.id_documento
         AND e.action = 'document.uploaded'
        SET d.uploaded_by_user_id = e.actor_user_id
        """
    )
    op.create_foreign_key(
        "fk_documents_uploaded_by",
        "documents",
        "users",
        ["uploaded_by_user_id"],
        ["user_id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_documents_active_uploader",
        "documents",
        "status_documento = 'removed' OR uploaded_by_user_id IS NOT NULL",
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
