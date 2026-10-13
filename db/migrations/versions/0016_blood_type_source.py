"""Registra quem informou o tipo sanguíneo do paciente.

Revision ID: 0016
Revises: 0015
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column(
            "tipo_sanguineo_origem",
            mysql.ENUM("patient", "guardian", "doctor"),
            nullable=True,
        ),
    )
    # Before this revision no flow wrote the blood type; existing values come
    # from demonstration data and are treated as professionally registered.
    op.execute(
        """
        UPDATE patients
        SET tipo_sanguineo_origem = 'doctor'
        WHERE tipo_sanguineo IS NOT NULL
        """
    )
    op.create_check_constraint(
        "ck_patients_blood_type_source",
        "patients",
        "(tipo_sanguineo IS NULL) = (tipo_sanguineo_origem IS NULL)",
    )


def downgrade() -> None:
    raise NotImplementedError("Migrações são forward-only")
