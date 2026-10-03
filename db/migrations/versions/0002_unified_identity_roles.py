"""Unifica identidade, roles e relacionamentos por IDs internos.

Revision ID: 0002
Revises: 0001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("user_id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("cpf", sa.CHAR(11), nullable=False, unique=True),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint("cpf REGEXP '^[0-9]{11}$'", name="ck_users_cpf_numeric"),
    )

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "role",
            mysql.ENUM("patient", "doctor", "admin"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            name="fk_user_roles_user",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "role"),
    )

    op.create_table(
        "patients",
        sa.Column(
            "patient_id",
            sa.BigInteger(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("user_id", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("nome_paciente", sa.String(20), nullable=False),
        sa.Column("nome_completo", sa.String(100), nullable=False),
        sa.Column("avatar", sa.String(255)),
        sa.Column(
            "status_saude",
            mysql.ENUM("updated", "pending", "overdue"),
        ),
        sa.Column(
            "tipo_sanguineo",
            mysql.ENUM("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"),
        ),
        sa.Column("valor_qr", sa.String(255)),
        sa.Column(
            "criado_em",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("data_nascimento", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            name="fk_patients_user",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "doctors",
        sa.Column("doctor_id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("crm_number", sa.String(20), nullable=False),
        sa.Column("crm_state", sa.CHAR(2), nullable=False),
        sa.Column(
            "verification_status",
            mysql.ENUM("pending", "verified", "rejected"),
            nullable=False,
        ),
        sa.Column("verified_at", sa.DateTime()),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            name="fk_doctors_user",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("crm_state", "crm_number", name="uq_doctors_crm"),
    )

    op.create_table(
        "sessions",
        sa.Column("token_hash", sa.CHAR(64), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.user_id"],
            name="fk_sessions_user",
            ondelete="CASCADE",
        ),
    )
    op.create_index("idx_sessions_user", "sessions", ["user_id"])
    op.create_index("idx_sessions_expiration", "sessions", ["expires_at"])

    op.create_table(
        "vaccines",
        sa.Column("id_vacina", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("patient_id", sa.BigInteger(), primary_key=True),
        sa.Column("nome_vacina", sa.String(100)),
        sa.Column("dose", sa.String(50)),
        sa.Column("data_aplicacao", sa.Date()),
        sa.Column(
            "status_vacina",
            mysql.ENUM("pending", "applied", "overdue"),
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.patient_id"],
            name="fk_vaccines_patient",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "alerts",
        sa.Column("id_alerta", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("patient_id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "tipo_alerta",
            mysql.ENUM("condition", "medication", "allergy"),
        ),
        sa.Column("titulo_alerta", sa.String(50)),
        sa.Column("descricao_alerta", sa.String(200)),
        sa.Column(
            "severidade_alerta",
            mysql.ENUM("low", "medium", "high"),
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.patient_id"],
            name="fk_alerts_patient",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "documents",
        sa.Column(
            "id_documento",
            sa.Integer(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("patient_id", sa.BigInteger(), primary_key=True),
        sa.Column("titulo_documento", sa.String(50)),
        sa.Column("tipo_documento", sa.String(20)),
        sa.Column("data_criacao_documento", sa.Date()),
        sa.Column("status_documento", mysql.ENUM("viewed", "new")),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patients.patient_id"],
            name="fk_documents_patient",
            ondelete="CASCADE",
        ),
    )

    op.execute(
        """
        INSERT INTO users (
            cpf, display_name, email, password_hash, active, created_at
        )
        SELECT
            cpf_paciente, nome_completo, email, senha_hash, TRUE, criado_em
        FROM pacientes
        """
    )
    op.execute(
        """
        INSERT INTO user_roles (user_id, role)
        SELECT user_id, 'patient' FROM users
        """
    )
    op.execute(
        """
        INSERT INTO patients (
            user_id, nome_paciente, nome_completo, avatar, status_saude,
            tipo_sanguineo, valor_qr, criado_em, data_nascimento
        )
        SELECT
            u.user_id, p.nome_paciente, p.nome_completo, p.avatar,
            p.status_saude, p.tipo_sanguineo, p.valor_qr, p.criado_em,
            p.data_nascimento
        FROM pacientes p
        JOIN users u ON u.cpf = p.cpf_paciente
        """
    )
    op.execute(
        """
        INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
        SELECT s.token_hash, u.user_id, s.expira_em, s.criado_em
        FROM sessoes s
        JOIN users u ON u.cpf = s.paciente_id
        """
    )
    op.execute(
        """
        INSERT INTO vaccines (
            id_vacina, patient_id, nome_vacina, dose, data_aplicacao,
            status_vacina
        )
        SELECT
            v.id_vacina, p.patient_id, v.nome_vacina, v.dose,
            v.data_aplicacao, v.status_vacina
        FROM vacinas v
        JOIN users u ON u.cpf = v.paciente_id
        JOIN patients p ON p.user_id = u.user_id
        """
    )
    op.execute(
        """
        INSERT INTO alerts (
            id_alerta, patient_id, tipo_alerta, titulo_alerta,
            descricao_alerta, severidade_alerta
        )
        SELECT
            a.id_alerta, p.patient_id, a.tipo_alerta, a.titulo_alerta,
            a.descricao_alerta, a.severidade_alerta
        FROM alertas a
        JOIN users u ON u.cpf = a.paciente_id
        JOIN patients p ON p.user_id = u.user_id
        """
    )
    op.execute(
        """
        INSERT INTO documents (
            id_documento, patient_id, titulo_documento, tipo_documento,
            data_criacao_documento, status_documento
        )
        SELECT
            d.id_documento, p.patient_id, d.titulo_documento,
            d.tipo_documento, d.data_criacao_documento, d.status_documento
        FROM documentos d
        JOIN users u ON u.cpf = d.paciente_id
        JOIN patients p ON p.user_id = u.user_id
        """
    )

    op.drop_table("vacinas")
    op.drop_table("alertas")
    op.drop_table("documentos")
    op.drop_table("sessoes")
    op.drop_table("pacientes")


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
