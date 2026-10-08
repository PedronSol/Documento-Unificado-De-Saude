"""Cria marcadores de saude.

Revision ID: 0004
Revises: 0003
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "health_markers",
        sa.Column(
            "marker_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("patient_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "marker_type",
            mysql.ENUM("medication", "diagnosis", "condition", "allergy"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column(
            "normalized_name",
            sa.String(160, collation="utf8mb4_bin"),
            nullable=False,
        ),
        sa.Column("description", sa.String(500)),
        sa.Column("dosage", sa.String(100)),
        sa.Column("frequency", sa.String(100)),
        sa.Column(
            "status",
            mysql.ENUM("active", "removed"),
            nullable=False,
        ),
        sa.Column(
            "active_name_key",
            sa.String(160, collation="utf8mb4_bin"),
            sa.Computed(
                "CASE WHEN status = 'active' THEN normalized_name ELSE NULL END",
                persisted=True,
            ),
        ),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=False),
        sa.Column("updated_by_user_id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("updated_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("removed_at", mysql.DATETIME(fsp=6)),
        sa.CheckConstraint(
            "marker_type = 'medication' OR "
            "(dosage IS NULL AND frequency IS NULL)",
            name="ck_health_markers_medication_fields",
        ),
        sa.CheckConstraint(
            "(status = 'active' AND removed_at IS NULL) OR "
            "(status = 'removed' AND removed_at IS NOT NULL)",
            name="ck_health_markers_removed_at",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.patient_id"],
            name="fk_health_markers_patient",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.user_id"],
            name="fk_health_markers_created_by",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.user_id"],
            name="fk_health_markers_updated_by",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "patient_id",
            "marker_type",
            "active_name_key",
            name="uq_health_markers_active_name",
        ),
    )
    op.create_index(
        "idx_health_markers_patient_status_type_name",
        "health_markers",
        ["patient_id", "status", "marker_type", "name"],
    )
    op.create_index(
        "idx_health_markers_patient_status_removed",
        "health_markers",
        ["patient_id", "status", "removed_at"],
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
