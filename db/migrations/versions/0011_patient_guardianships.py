"""Cria guarda legal de pacientes e reivindicacao pelo responsavel.

Revision ID: 0011
Revises: 0010
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patient_guardianships",
        sa.Column(
            "guardianship_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("dependent_patient_id", sa.BigInteger(), nullable=False),
        sa.Column("guardian_patient_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "relationship",
            mysql.ENUM("parent", "legal_guardian"),
            nullable=False,
        ),
        sa.Column(
            "status",
            mysql.ENUM("pending", "active", "rejected", "renounced", "released"),
            nullable=False,
        ),
        sa.Column(
            "open_key",
            mysql.TINYINT(),
            sa.Computed("IF(status IN ('pending', 'active'), 1, NULL)", persisted=True),
        ),
        sa.Column(
            "requires_dependent_confirmation",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("dependent_confirmed_at", mysql.DATETIME(fsp=6)),
        sa.Column("created_by_doctor_id", sa.BigInteger()),
        sa.Column("accepted_at", mysql.DATETIME(fsp=6)),
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
            "dependent_patient_id",
            "guardian_patient_id",
            "open_key",
            name="uq_patient_guardianships_open",
        ),
        sa.CheckConstraint(
            "dependent_patient_id <> guardian_patient_id",
            name="ck_patient_guardianships_distinct",
        ),
        sa.ForeignKeyConstraint(
            ["dependent_patient_id"],
            ["patients.patient_id"],
            name="fk_guardianships_dependent",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["guardian_patient_id"],
            ["patients.patient_id"],
            name="fk_guardianships_guardian",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_doctor_id"],
            ["doctors.doctor_id"],
            name="fk_guardianships_doctor",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "idx_guardianships_guardian",
        "patient_guardianships",
        ["guardian_patient_id", "status", "dependent_patient_id"],
    )
    op.alter_column(
        "patient_claims",
        "claim_type",
        existing_type=mysql.ENUM("self"),
        existing_nullable=False,
        type_=mysql.ENUM("self", "guardian"),
        nullable=False,
    )
    op.add_column(
        "patient_claims",
        sa.Column("guardianship_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_patient_claims_guardianship",
        "patient_claims",
        "patient_guardianships",
        ["guardianship_id"],
        ["guardianship_id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
