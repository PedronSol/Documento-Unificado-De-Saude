"""Cria o schema inicial do Documento Unificado de Saúde.

Revision ID: 0001
Revises:
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pacientes",
        sa.Column("cpf_paciente", sa.CHAR(11), primary_key=True),
        sa.Column("nome_paciente", sa.String(20), nullable=False),
        sa.Column("nome_completo", sa.String(100), nullable=False),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("senha_hash", sa.String(255), nullable=False),
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
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("data_nascimento", sa.Date(), nullable=False),
        sa.CheckConstraint(
            "cpf_paciente REGEXP '^[0-9]{11}$'",
            name="ck_pacientes_cpf_numerico",
        ),
    )

    op.create_table(
        "sessoes",
        sa.Column("token_hash", sa.CHAR(64), primary_key=True),
        sa.Column("paciente_id", sa.CHAR(11), nullable=False),
        sa.Column("expira_em", sa.DateTime(), nullable=False),
        sa.Column(
            "criado_em",
            sa.TIMESTAMP(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["paciente_id"],
            ["pacientes.cpf_paciente"],
            ondelete="CASCADE",
        ),
    )
    op.create_index("idx_sessoes_paciente", "sessoes", ["paciente_id"])
    op.create_index("idx_sessoes_expiracao", "sessoes", ["expira_em"])

    op.create_table(
        "vacinas",
        sa.Column("id_vacina", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("paciente_id", sa.CHAR(11), primary_key=True),
        sa.Column("nome_vacina", sa.String(100)),
        sa.Column("dose", sa.String(50)),
        sa.Column("data_aplicacao", sa.Date()),
        sa.Column(
            "status_vacina",
            mysql.ENUM("pending", "applied", "overdue"),
        ),
        sa.ForeignKeyConstraint(
            ["paciente_id"],
            ["pacientes.cpf_paciente"],
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "alertas",
        sa.Column("id_alerta", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("paciente_id", sa.CHAR(11), primary_key=True),
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
            ["paciente_id"],
            ["pacientes.cpf_paciente"],
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "documentos",
        sa.Column(
            "id_documento",
            sa.Integer(),
            autoincrement=True,
            primary_key=True,
        ),
        sa.Column("paciente_id", sa.CHAR(11), primary_key=True),
        sa.Column("titulo_documento", sa.String(50)),
        sa.Column("tipo_documento", sa.String(20)),
        sa.Column("data_criacao_documento", sa.Date()),
        sa.Column("status_documento", mysql.ENUM("viewed", "new")),
        sa.ForeignKeyConstraint(
            ["paciente_id"],
            ["pacientes.cpf_paciente"],
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
