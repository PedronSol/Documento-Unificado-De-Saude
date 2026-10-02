from database_config import DatabaseSettings, create_database_engine


def test_constroi_url_sqlalchemy_com_configuracao_injetada():
    settings = DatabaseSettings.from_mapping(
        {
            "DB_HOST": "mysql.internal",
            "DB_PORT": "3307",
            "DB_USER": "dus_user",
            "DB_PASSWORD": "p@ss/word",
            "DB_NAME": "dus_test",
        }
    )

    url = settings.to_url()

    assert url.drivername == "mysql+mysqlconnector"
    assert url.host == "mysql.internal"
    assert url.port == 3307
    assert url.username == "dus_user"
    assert url.password == "p@ss/word"
    assert url.database == "dus_test"


def test_factory_de_engine_recebe_url_sem_ler_ambiente():
    settings = DatabaseSettings(
        host="db",
        port=3306,
        user="root",
        password="secret",
        database="health",
    )
    received = {}
    expected_engine = object()

    def engine_factory(url, **options):
        received["url"] = url
        received["options"] = options
        return expected_engine

    engine = create_database_engine(settings, engine_factory=engine_factory)

    assert engine is expected_engine
    assert received["url"] == settings.to_url()
    assert received["options"] == {"pool_pre_ping": True}
