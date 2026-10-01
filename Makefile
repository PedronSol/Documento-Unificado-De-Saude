.PHONY: front-dev back-dev both build

front-dev:
	cd frontend && npm run dev

back-dev:
	cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

both:
	$(MAKE) -j2 front-dev back-dev

build:
	docker compose build
