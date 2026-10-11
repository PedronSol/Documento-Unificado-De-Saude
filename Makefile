PYTHON ?= python3
VENV ?= .venv
BACKEND_PORT ?= 8000
BACKEND_PYTHON := $(abspath $(VENV)/bin/python)
BACKEND_READY := $(VENV)/.backend-ready

.PHONY: front-dev back-setup back-dev both build local-up local-down db-migrate db-seed db-reset admin-create documents-cleanup

front-dev:
	cd frontend && npm run dev

$(BACKEND_READY): backend/requirements.txt
	$(PYTHON) -m venv $(VENV)
	$(BACKEND_PYTHON) -m pip install -r backend/requirements.txt
	touch $(BACKEND_READY)

back-setup: $(BACKEND_READY)

back-dev: $(BACKEND_READY)
	cd backend && $(BACKEND_PYTHON) -m uvicorn main:app --reload --host 0.0.0.0 --port $(BACKEND_PORT)

both:
	$(MAKE) -j2 front-dev back-dev

build:
	docker compose build

local-up:
	docker compose up --build -d db backend

local-down:
	docker compose down

db-migrate:
	docker compose run --rm migrate python database_tasks.py migrate /db/alembic.ini

db-seed:
	docker compose run --rm migrate python database_tasks.py seed /db/seeds/development.sql

db-reset:
	docker compose run --rm migrate python database_tasks.py reset
	$(MAKE) db-migrate
	$(MAKE) db-seed

admin-create:
	docker compose run --rm -it migrate python database_tasks.py create-admin --email "$(EMAIL)" --cpf "$(CPF)" --name "$(NAME)"

documents-cleanup:
	docker compose exec backend python database_tasks.py cleanup-documents
