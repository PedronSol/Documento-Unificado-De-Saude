from security import (
    create_session_token,
    create_share_token,
    hash_password,
    hash_session_token,
    hash_share_token,
    verify_password,
)


def test_password_hash_round_trip():
    encoded = hash_password("senha-forte")

    assert encoded != "senha-forte"
    assert verify_password("senha-forte", encoded)
    assert not verify_password("senha-errada", encoded)


def test_invalid_password_hash_is_rejected():
    assert not verify_password("senha", "texto-puro")


def test_session_tokens_are_random_and_stored_as_hashes():
    first_token = create_session_token()
    second_token = create_session_token()

    assert first_token != second_token
    assert hash_session_token(first_token) != first_token
    assert len(hash_session_token(first_token)) == 64


def test_share_tokens_have_256_bits_and_are_stored_only_as_hashes():
    first_token = create_share_token()
    second_token = create_share_token()

    assert first_token != second_token
    assert len(first_token) >= 43
    assert hash_share_token(first_token) != first_token
    assert len(hash_share_token(first_token)) == 64
