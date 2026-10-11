"""Permite contas provisorias de paciente e reivindicacao por link.

Revision ID: 0010
Revises: 0009
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "email",
        existing_type=sa.String(254),
        existing_nullable=False,
        nullable=True,
    )
    op.add_column(
        "users",
        sa.Column(
            "claimed_at",
            mysql.DATETIME(fsp=6),
            server_default=sa.text("(UTC_TIMESTAMP(6))"),
        ),
    )
    op.add_column(
        "users",
        sa.Column("provisioned_by_doctor_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_provisioned_by_doctor",
        "users",
        "doctors",
        ["provisioned_by_doctor_id"],
        ["doctor_id"],
        ondelete="RESTRICT",
    )
    op.execute("UPDATE users SET claimed_at = created_at WHERE claimed_at IS NULL")

    op.create_table(
        "patient_claims",
        sa.Column(
            "patient_claim_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("claim_type", mysql.ENUM("self"), nullable=False),
        sa.Column("account_patient_id", sa.BigInteger(), nullable=False),
        sa.Column("issued_by_user_id", sa.BigInteger(), nullable=False),
        sa.Column("token_hash", sa.CHAR(64), nullable=False),
        sa.Column(
            "status",
            mysql.ENUM("pending", "claimed", "revoked"),
            nullable=False,
        ),
        sa.Column(
            "failed_attempts",
            mysql.TINYINT(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("expires_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("claimed_at", mysql.DATETIME(fsp=6)),
        sa.Column(
            "created_at",
            mysql.DATETIME(fsp=6),
            nullable=False,
            server_default=sa.text("UTC_TIMESTAMP(6)"),
        ),
        sa.UniqueConstraint("token_hash", name="uq_patient_claims_token"),
        sa.ForeignKeyConstraint(
            ["account_patient_id"],
            ["patients.patient_id"],
            name="fk_patient_claims_patient",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["issued_by_user_id"],
            ["users.user_id"],
            name="fk_patient_claims_issuer",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "idx_patient_claims_account",
        "patient_claims",
        ["account_patient_id", "status"],
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
