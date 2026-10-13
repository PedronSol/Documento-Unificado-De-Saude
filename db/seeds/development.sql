-- Dados fictícios exclusivos de desenvolvimento.
-- Todas as contas usam a senha: senha123

INSERT IGNORE INTO users (
    cpf, display_name, email, password_hash, active
)
VALUES
    (
        '00011122285', 'Carlos Eduardo Silva', 'carlos.silva@email.com',
        'pbkdf2_sha256$600000$7d188f6dd28a5e5da794b0a43553b265$afda27b4adf6569ca95cb65dad8439753650a6ba62806f9b491b1d7bea7af30e', TRUE
    ),
    (
        '11122233396', 'Mariana Costa Souza', 'mariana.souza@email.com',
        'pbkdf2_sha256$600000$7d188f6dd28a5e5da794b0a43553b265$afda27b4adf6569ca95cb65dad8439753650a6ba62806f9b491b1d7bea7af30e', TRUE
    ),
    (
        '22233344405', 'Dra. Helena Costa', 'helena.costa@email.com',
        'pbkdf2_sha256$600000$7d188f6dd28a5e5da794b0a43553b265$afda27b4adf6569ca95cb65dad8439753650a6ba62806f9b491b1d7bea7af30e', TRUE
    ),
    (
        '33344455508', 'Dr. Marcos Nunes', 'marcos.nunes@email.com',
        'pbkdf2_sha256$600000$7d188f6dd28a5e5da794b0a43553b265$afda27b4adf6569ca95cb65dad8439753650a6ba62806f9b491b1d7bea7af30e', TRUE
    ),
    (
        '44455566619', 'Dra. Paula Reis', 'paula.reis@email.com',
        'pbkdf2_sha256$600000$7d188f6dd28a5e5da794b0a43553b265$afda27b4adf6569ca95cb65dad8439753650a6ba62806f9b491b1d7bea7af30e', TRUE
    ),
    (
        '55566677720', 'Alex Ferreira', 'admin@email.com',
        'pbkdf2_sha256$600000$7d188f6dd28a5e5da794b0a43553b265$afda27b4adf6569ca95cb65dad8439753650a6ba62806f9b491b1d7bea7af30e', TRUE
    ),
    (
        '66677788830', 'Conta Inativa', 'inativo@email.com',
        'pbkdf2_sha256$600000$7d188f6dd28a5e5da794b0a43553b265$afda27b4adf6569ca95cb65dad8439753650a6ba62806f9b491b1d7bea7af30e', FALSE
    );

INSERT IGNORE INTO user_roles (user_id, role)
SELECT user_id, 'patient'
FROM users
WHERE email IN (
    'carlos.silva@email.com',
    'mariana.souza@email.com',
    'helena.costa@email.com',
    'paula.reis@email.com',
    'inativo@email.com'
);

INSERT IGNORE INTO user_roles (user_id, role)
SELECT user_id, 'doctor'
FROM users
WHERE email IN ('helena.costa@email.com', 'marcos.nunes@email.com');

INSERT IGNORE INTO user_roles (user_id, role)
SELECT user_id, 'admin'
FROM users
WHERE email = 'admin@email.com';

INSERT IGNORE INTO patients (
    user_id, nome_paciente, nome_completo, avatar, status_saude,
    tipo_sanguineo, tipo_sanguineo_origem, valor_qr, data_nascimento
)
SELECT
    user_id, 'Carlos Silva', 'Carlos Eduardo Silva', NULL, 'updated',
    'A+', 'doctor', 'QR-CARLOS-DEMO', '1985-04-12'
FROM users WHERE email = 'carlos.silva@email.com'
UNION ALL
SELECT
    user_id, 'Mariana Souza', 'Mariana Costa Souza', NULL, 'pending',
    'O-', 'doctor', 'QR-MARIANA-DEMO', '2021-07-11'
FROM users WHERE email = 'mariana.souza@email.com'
UNION ALL
SELECT
    user_id, 'Helena Costa', 'Dra. Helena Costa', NULL, 'updated',
    'A-', 'doctor', 'QR-HELENA-DEMO', '1988-03-18'
FROM users WHERE email = 'helena.costa@email.com'
UNION ALL
SELECT
    user_id, 'Paula Reis', 'Dra. Paula Reis', NULL, 'updated',
    'B+', 'doctor', 'QR-PAULA-DEMO', '1990-06-24'
FROM users WHERE email = 'paula.reis@email.com'
UNION ALL
SELECT
    user_id, 'Conta Inativa', 'Conta Inativa', NULL, 'pending',
    'O+', 'doctor', NULL, '1992-01-01'
FROM users WHERE email = 'inativo@email.com';

INSERT IGNORE INTO doctors (
    user_id, crm_number, crm_state, verification_status, verified_at
)
SELECT user_id, '100001', 'RN', 'verified', UTC_TIMESTAMP()
FROM users WHERE email = 'helena.costa@email.com'
UNION ALL
SELECT user_id, '100002', 'RN', 'verified', UTC_TIMESTAMP()
FROM users WHERE email = 'marcos.nunes@email.com'
UNION ALL
SELECT user_id, '100003', 'RN', 'pending', NULL
FROM users WHERE email = 'paula.reis@email.com';

INSERT IGNORE INTO vaccines (
    id_vacina, patient_id, nome_vacina, dose, data_aplicacao, status_vacina
)
SELECT
    1, patient_id, 'COVID-19 (Pfizer)', '3ª Dose - Reforço',
    '2024-02-10', 'applied'
FROM patients
WHERE user_id = (SELECT user_id FROM users WHERE email = 'carlos.silva@email.com')
UNION ALL
SELECT 2, patient_id, 'Influenza', 'Dose Anual', '2024-04-15', 'applied'
FROM patients
WHERE user_id = (SELECT user_id FROM users WHERE email = 'carlos.silva@email.com')
UNION ALL
SELECT 1, patient_id, 'Influenza', 'Dose Anual', NULL, 'pending'
FROM patients
WHERE user_id = (SELECT user_id FROM users WHERE email = 'mariana.souza@email.com');

INSERT IGNORE INTO alerts (
    id_alerta, patient_id, tipo_alerta, titulo_alerta,
    descricao_alerta, severidade_alerta
)
SELECT
    1, patient_id, 'condition', 'Hipertensão',
    'Acompanhamento regular recomendado.', 'medium'
FROM patients
WHERE user_id = (SELECT user_id FROM users WHERE email = 'carlos.silva@email.com');

INSERT IGNORE INTO care_groups (
    care_group_id, name, status, created_at, updated_at
)
VALUES
    (1, 'Unidade Centro', 'active', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    (2, 'Unidade Norte', 'active', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)),
    (
        3, 'Grupo Inativo de Demonstração', 'inactive',
        UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
    );

INSERT IGNORE INTO doctor_care_groups (
    care_group_id, doctor_id, status, starts_at, ends_at,
    created_at, updated_at
)
SELECT
    1, d.doctor_id, 'active', UTC_TIMESTAMP(6), NULL,
    UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
FROM doctors d
JOIN users u ON u.user_id = d.user_id
WHERE u.email = 'helena.costa@email.com'
UNION ALL
SELECT
    2, d.doctor_id, 'active', UTC_TIMESTAMP(6), NULL,
    UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
FROM doctors d
JOIN users u ON u.user_id = d.user_id
WHERE u.email = 'marcos.nunes@email.com'
UNION ALL
SELECT
    3, d.doctor_id, 'active', UTC_TIMESTAMP(6), NULL,
    UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
FROM doctors d
JOIN users u ON u.user_id = d.user_id
WHERE u.email = 'helena.costa@email.com';

INSERT IGNORE INTO patient_care_groups (
    care_group_id, patient_id, status, starts_at, ends_at,
    created_at, updated_at
)
SELECT
    1, p.patient_id, 'active', UTC_TIMESTAMP(6), NULL,
    UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
FROM patients p
JOIN users u ON u.user_id = p.user_id
WHERE u.email = 'carlos.silva@email.com'
UNION ALL
SELECT
    2, p.patient_id, 'active', UTC_TIMESTAMP(6), NULL,
    UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
FROM patients p
JOIN users u ON u.user_id = p.user_id
WHERE u.email = 'mariana.souza@email.com'
UNION ALL
SELECT
    3, p.patient_id, 'active', UTC_TIMESTAMP(6), NULL,
    UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
FROM patients p
JOIN users u ON u.user_id = p.user_id
WHERE u.email = 'mariana.souza@email.com';

UPDATE doctors
SET created_by_admin_user_id = (
    SELECT user_id FROM users WHERE email = 'admin@email.com'
)
WHERE created_by_admin_user_id IS NULL;

UPDATE care_groups
SET managed_by_admin_user_id = (
    SELECT user_id FROM users WHERE email = 'admin@email.com'
)
WHERE managed_by_admin_user_id IS NULL;

INSERT IGNORE INTO care_group_patient_invitations (
    care_invitation_id, care_group_id, patient_id, invited_by_admin_user_id,
    status, expires_at
)
SELECT
    1, 2, p.patient_id, admin.user_id, 'pending',
    UTC_TIMESTAMP(6) + INTERVAL 7 DAY
FROM patients p
JOIN users u ON u.user_id = p.user_id
JOIN users admin ON admin.email = 'admin@email.com'
WHERE u.email = 'paula.reis@email.com';

-- Guarda demonstrativa: Carlos é responsável por Mariana (menor), já aceita e
-- confirmada, para o contexto de dependente aparecer sem passos manuais.
INSERT IGNORE INTO patient_guardianships (
    dependent_patient_id, guardian_patient_id, relationship, status,
    requires_dependent_confirmation, dependent_confirmed_at, accepted_at
)
SELECT
    dependent.patient_id, guardian.patient_id, 'parent', 'active',
    TRUE, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
FROM patients dependent
JOIN users dependent_user ON dependent_user.user_id = dependent.user_id
JOIN users guardian_user ON guardian_user.email = 'carlos.silva@email.com'
JOIN patients guardian ON guardian.user_id = guardian_user.user_id
WHERE dependent_user.email = 'mariana.souza@email.com';
