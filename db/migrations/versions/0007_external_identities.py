"""Permite autenticacao externa opcional por identidade estavel.

Revision ID: 0007
Revises: 0006
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "password_hash",
        existing_type=sa.String(255),
        existing_nullable=False,
        nullable=True,
    )
    op.create_table(
        "external_identities",
        sa.Column(
            "external_identity_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("provider", mysql.ENUM("google"), nullable=False),
        sa.Column("issuer", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            mysql.DATETIME(fsp=6),
            nullable=False,
            server_default=sa.text("UTC_TIMESTAMP(6)"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            name="fk_external_identities_user",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "issuer",
            "subject",
            name="uq_external_identities_issuer_subject",
        ),
        sa.UniqueConstraint(
            "user_id",
            "provider",
            name="uq_external_identities_user_provider",
        ),
    )
    op.create_index(
        "idx_external_identities_user",
        "external_identities",
        ["user_id"],
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
