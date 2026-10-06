"""Cria eventos de auditoria clinica.

Revision ID: 0003
Revises: 0002
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clinical_audit_events",
        sa.Column(
            "audit_event_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column(
            "actor_type",
            mysql.ENUM("user", "public_share", "system"),
            nullable=False,
        ),
        sa.Column("actor_user_id", sa.BigInteger()),
        sa.Column("patient_id", sa.BigInteger(), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("resource_type", sa.String(32), nullable=False),
        sa.Column("resource_id", sa.BigInteger(), nullable=False),
        sa.Column("before_snapshot", mysql.JSON()),
        sa.Column("after_snapshot", mysql.JSON()),
        sa.Column("occurred_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.CheckConstraint(
            "(actor_type = 'user' AND actor_user_id IS NOT NULL) OR "
            "(actor_type IN ('public_share', 'system') "
            "AND actor_user_id IS NULL)",
            name="ck_clinical_audit_actor",
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.user_id"],
            name="fk_clinical_audit_actor",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.patient_id"],
            name="fk_clinical_audit_patient",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "idx_clinical_audit_patient_occurred",
        "clinical_audit_events",
        ["patient_id", "occurred_at"],
    )
    op.create_index(
        "idx_clinical_audit_actor_occurred",
        "clinical_audit_events",
        ["actor_user_id", "occurred_at"],
    )
    op.create_index(
        "idx_clinical_audit_resource",
        "clinical_audit_events",
        ["resource_type", "resource_id"],
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
