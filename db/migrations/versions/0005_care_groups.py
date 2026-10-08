"""Cria grupos de atendimento e vinculos vigentes.

Revision ID: 0005
Revises: 0004
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
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
    )


def upgrade() -> None:
    op.create_table(
        "care_groups",
        sa.Column(
            "care_group_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "status",
            mysql.ENUM("active", "inactive"),
            nullable=False,
        ),
        *_timestamps(),
    )

    op.create_table(
        "doctor_care_groups",
        sa.Column("care_group_id", sa.BigInteger(), nullable=False),
        sa.Column("doctor_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            mysql.ENUM("active", "inactive"),
            nullable=False,
        ),
        sa.Column("starts_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("ends_at", mysql.DATETIME(fsp=6)),
        *_timestamps(),
        sa.PrimaryKeyConstraint(
            "care_group_id",
            "doctor_id",
            name="pk_doctor_care_groups",
        ),
        sa.ForeignKeyConstraint(
            ["care_group_id"],
            ["care_groups.care_group_id"],
            name="fk_doctor_care_groups_group",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["doctor_id"],
            ["doctors.doctor_id"],
            name="fk_doctor_care_groups_doctor",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "ends_at IS NULL OR ends_at > starts_at",
            name="ck_doctor_care_groups_period",
        ),
    )

    op.create_table(
        "patient_care_groups",
        sa.Column("care_group_id", sa.BigInteger(), nullable=False),
        sa.Column("patient_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            mysql.ENUM("active", "inactive"),
            nullable=False,
        ),
        sa.Column("starts_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("ends_at", mysql.DATETIME(fsp=6)),
        *_timestamps(),
        sa.PrimaryKeyConstraint(
            "care_group_id",
            "patient_id",
            name="pk_patient_care_groups",
        ),
        sa.ForeignKeyConstraint(
            ["care_group_id"],
            ["care_groups.care_group_id"],
            name="fk_patient_care_groups_group",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.patient_id"],
            name="fk_patient_care_groups_patient",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "ends_at IS NULL OR ends_at > starts_at",
            name="ck_patient_care_groups_period",
        ),
    )

    op.create_index(
        "idx_doctor_care_groups_authorization",
        "doctor_care_groups",
        ["doctor_id", "status", "starts_at", "ends_at", "care_group_id"],
    )
    op.create_index(
        "idx_patient_care_groups_authorization",
        "patient_care_groups",
        ["patient_id", "status", "starts_at", "ends_at", "care_group_id"],
    )
    op.create_index(
        "idx_patient_care_groups_listing",
        "patient_care_groups",
        ["care_group_id", "status", "starts_at", "ends_at", "patient_id"],
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
