"""Cria vinculos diretos entre medico e paciente.

Revision ID: 0009
Revises: 0008
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "doctor_patient_links",
        sa.Column("link_id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("doctor_id", sa.BigInteger(), nullable=False),
        sa.Column("patient_id", sa.BigInteger(), nullable=False),
        sa.Column("origin", mysql.ENUM("request", "provisional"), nullable=False),
        sa.Column(
            "status",
            mysql.ENUM(
                "pending",
                "active",
                "rejected",
                "expired",
                "cancelled",
                "revoked",
            ),
            nullable=False,
        ),
        sa.Column(
            "open_key",
            mysql.TINYINT(),
            sa.Computed("IF(status IN ('pending', 'active'), 1, NULL)", persisted=True),
        ),
        sa.Column("expires_at", mysql.DATETIME(fsp=6)),
        sa.Column("decided_by_user_id", sa.BigInteger()),
        sa.Column("decided_at", mysql.DATETIME(fsp=6)),
        sa.Column("ended_at", mysql.DATETIME(fsp=6)),
        sa.Column(
            "created_at",
            mysql.DATETIME(fsp=6),
            nullable=False,
            server_default=sa.text("UTC_TIMESTAMP(6)"),
        ),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=6),
            nullable=False,
            server_default=sa.text("UTC_TIMESTAMP(6)"),
        ),
        sa.UniqueConstraint(
            "doctor_id",
            "patient_id",
            "open_key",
            name="uq_doctor_patient_links_open",
        ),
        sa.ForeignKeyConstraint(
            ["doctor_id"],
            ["doctors.doctor_id"],
            name="fk_doctor_patient_links_doctor",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.patient_id"],
            name="fk_doctor_patient_links_patient",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by_user_id"],
            ["users.user_id"],
            name="fk_doctor_patient_links_decider",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "idx_doctor_patient_links_authorization",
        "doctor_patient_links",
        ["doctor_id", "status", "patient_id"],
    )
    op.create_index(
        "idx_doctor_patient_links_patient",
        "doctor_patient_links",
        ["patient_id", "status", "expires_at"],
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
