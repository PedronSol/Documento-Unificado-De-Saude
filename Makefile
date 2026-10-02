.PHONY: front-dev back-dev both build local-up db-migrate db-seed db-reset

front-dev:
	cd frontend && npm run dev

back-dev:
	cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

both:
	$(MAKE) -j2 front-dev back-dev

build:
	docker compose build

local-up:
	docker compose up --build -d db backend

db-migrate:
	docker compose run --rm migrate python database_tasks.py migrate /db/alembic.ini

db-seed:
	docker compose run --rm migrate python database_tasks.py seed /db/seeds/development.sql

db-reset:
	docker compose run --rm migrate python database_tasks.py reset
	$(MAKE) db-migrate
	$(MAKE) db-seed
