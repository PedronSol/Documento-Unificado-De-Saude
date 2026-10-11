from auth.remembered import first_name, mask_email


def test_mascara_email_mantendo_primeiro_caractere_e_dominio():
    assert mask_email("carlos.silva@email.com") == "c•••@email.com"
    assert mask_email("a@exemplo.com.br") == "•••@exemplo.com.br"


def test_primeiro_nome_de_exibicao():
    assert first_name("Carlos Eduardo Silva") == "Carlos"
    assert first_name("  Mariana  ") == "Mariana"
