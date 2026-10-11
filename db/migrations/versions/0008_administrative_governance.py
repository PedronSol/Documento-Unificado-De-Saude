"""Cria governanca administrativa, convites e auditoria administrativa.

Revision ID: 0008
Revises: 0007
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0008"
down_revision = "0007"
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
    op.add_column(
        "doctors",
        sa.Column("created_by_admin_user_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "doctors",
        sa.Column(
            "professional_status",
            mysql.ENUM("active", "suspended", "deactivated"),
            nullable=False,
            server_default="active",
        ),
    )
    op.create_foreign_key(
        "fk_doctors_created_by_admin",
        "doctors",
        "users",
        ["created_by_admin_user_id"],
        ["user_id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "idx_doctors_created_by_admin",
        "doctors",
        ["created_by_admin_user_id"],
    )

    op.add_column(
        "care_groups",
        sa.Column("managed_by_admin_user_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_care_groups_managed_by_admin",
        "care_groups",
        "users",
        ["managed_by_admin_user_id"],
        ["user_id"],
        ondelete="RESTRICT",
    )
    op.create_unique_constraint(
        "uq_care_groups_admin_name",
        "care_groups",
        ["managed_by_admin_user_id", "name"],
    )

    op.create_table(
        "doctor_invitations",
        sa.Column(
            "doctor_invitation_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("token_hash", sa.CHAR(64), nullable=False),
        sa.Column("created_by_admin_user_id", sa.BigInteger(), nullable=False),
        sa.Column("cpf", sa.CHAR(11), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("crm_number", sa.String(20), nullable=False),
        sa.Column("crm_state", sa.CHAR(2), nullable=False),
        sa.Column(
            "status",
            mysql.ENUM("pending", "accepted", "revoked"),
            nullable=False,
        ),
        sa.Column("expires_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("accepted_user_id", sa.BigInteger()),
        *_timestamps(),
        sa.UniqueConstraint("token_hash", name="uq_doctor_invitations_token"),
        sa.ForeignKeyConstraint(
            ["created_by_admin_user_id"],
            ["users.user_id"],
            name="fk_doctor_invitations_admin",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["accepted_user_id"],
            ["users.user_id"],
            name="fk_doctor_invitations_accepted_user",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "idx_doctor_invitations_admin",
        "doctor_invitations",
        ["created_by_admin_user_id", "status", "created_at"],
    )

    op.create_table(
        "care_group_patient_invitations",
        sa.Column(
            "care_invitation_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("care_group_id", sa.BigInteger(), nullable=False),
        sa.Column("patient_id", sa.BigInteger(), nullable=False),
        sa.Column("invited_by_admin_user_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            mysql.ENUM("pending", "accepted", "rejected", "cancelled", "expired"),
            nullable=False,
        ),
        sa.Column(
            "pending_key",
            mysql.TINYINT(),
            sa.Computed("IF(status = 'pending', 1, NULL)", persisted=True),
        ),
        sa.Column("expires_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("decided_at", mysql.DATETIME(fsp=6)),
        *_timestamps(),
        sa.UniqueConstraint(
            "care_group_id",
            "patient_id",
            "pending_key",
            name="uq_care_invitations_single_pending",
        ),
        sa.ForeignKeyConstraint(
            ["care_group_id"],
            ["care_groups.care_group_id"],
            name="fk_care_invitations_group",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.patient_id"],
            name="fk_care_invitations_patient",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["invited_by_admin_user_id"],
            ["users.user_id"],
            name="fk_care_invitations_admin",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "idx_care_invitations_patient",
        "care_group_patient_invitations",
        ["patient_id", "status", "expires_at"],
    )

    op.create_table(
        "administrative_audit_events",
        sa.Column(
            "administrative_audit_event_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("actor_user_id", sa.BigInteger(), nullable=False),
        sa.Column("managing_admin_user_id", sa.BigInteger()),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.BigInteger(), nullable=False),
        sa.Column("details", mysql.JSON()),
        sa.Column("occurred_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.user_id"],
            name="fk_administrative_audit_actor",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["managing_admin_user_id"],
            ["users.user_id"],
            name="fk_administrative_audit_admin",
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "idx_administrative_audit_admin",
        "administrative_audit_events",
        ["managing_admin_user_id", "occurred_at"],
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
