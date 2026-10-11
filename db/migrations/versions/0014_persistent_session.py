"""Adiciona teto absoluto de sessão e login lembrado por aparelho.

Revision ID: 0014
Revises: 0013
"""

from alembic import op
import sqlalchemy as sa


revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("absolute_expires_at", sa.DateTime(), nullable=True),
    )
    op.execute("UPDATE sessions SET absolute_expires_at = expires_at")
    op.alter_column(
        "sessions",
        "absolute_expires_at",
        existing_type=sa.DateTime(),
        nullable=False,
    )

    op.create_table(
        "remembered_logins",
        sa.Column("token_hash", sa.CHAR(64), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            name="fk_remembered_logins_user",
            ondelete="CASCADE",
        ),
    )
    op.create_index("idx_remembered_logins_user", "remembered_logins", ["user_id"])
    op.create_index(
        "idx_remembered_logins_expiration",
        "remembered_logins",
        ["expires_at"],
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
