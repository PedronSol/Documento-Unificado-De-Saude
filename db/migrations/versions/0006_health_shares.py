"""Cria compartilhamentos temporarios do resumo de saude.

Revision ID: 0006
Revises: 0005
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "health_shares",
        sa.Column(
            "share_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("token_hash", sa.CHAR(64), nullable=False),
        sa.Column("patient_id", sa.BigInteger(), nullable=False),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            mysql.DATETIME(fsp=6),
            nullable=False,
            server_default=sa.text("UTC_TIMESTAMP(6)"),
        ),
        sa.Column("expires_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("revoked_at", mysql.DATETIME(fsp=6)),
        sa.Column("last_accessed_at", mysql.DATETIME(fsp=6)),
        sa.Column(
            "active_patient_id",
            sa.BigInteger(),
            sa.Computed(
                "CASE WHEN revoked_at IS NULL THEN patient_id ELSE NULL END",
                persisted=True,
            ),
        ),
        sa.CheckConstraint(
            "expires_at > created_at",
            name="ck_health_shares_expiration",
        ),
        sa.CheckConstraint(
            "revoked_at IS NULL OR revoked_at >= created_at",
            name="ck_health_shares_revocation",
        ),
        sa.CheckConstraint(
            "last_accessed_at IS NULL OR last_accessed_at >= created_at",
            name="ck_health_shares_last_access",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.patient_id"],
            name="fk_health_shares_patient",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.user_id"],
            name="fk_health_shares_created_by",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "token_hash",
            name="uq_health_shares_token_hash",
        ),
        sa.UniqueConstraint(
            "active_patient_id",
            name="uq_health_shares_active_patient",
        ),
    )
    op.create_index(
        "idx_health_shares_patient_expiration",
        "health_shares",
        ["patient_id", "expires_at"],
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
