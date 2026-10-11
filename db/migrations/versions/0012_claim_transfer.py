"""Permite transferencia de conta do dependente adulto.

Revision ID: 0012
Revises: 0011
"""

from alembic import op
from sqlalchemy.dialects import mysql


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "patient_claims",
        "claim_type",
        existing_type=mysql.ENUM("self", "guardian"),
        existing_nullable=False,
        type_=mysql.ENUM("self", "guardian", "transfer"),
        nullable=False,
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
