# IronLog — web

Strength-training log: follow a rotating plan, log weight × sets × reps, review history and see strength scores per
muscle group. Web companion of [ironlog-android](https://github.com/yu1357465/ironlog-android); the two exchange plans
(share code / QR) and history (CSV) — see [docs/formats.md](docs/formats.md).

Started as a University of Glasgow group project ([yu1357465/IronLog](https://github.com/yu1357465/IronLog), history
preserved here) and rewritten in 2026 as a separate backend and frontend.

## Stack

| | |
| --- | --- |
| Backend | Django 6 + Django REST Framework, session auth with CSRF, SQLite |
| Frontend | React 19 + TypeScript, Vite, TanStack Query, Tailwind CSS 4 |
| Charts / QR | hand-written SVG; `qrcode-generator`; scanning via `BarcodeDetector` or lazily loaded `jsQR` |

English and Chinese UI (chosen from the browser at sign-up, switchable in Settings), light and dark themes, works on
phones (bottom tabs) and desktop (sidebar).

## Layout

```
backend/
  config/            settings (all secrets from env), URLs, SPA fallback
  ironlog/
    models.py        exercises, plans → days → template items, today's board, sessions → entries, profile
    services.py      business rules (mirrors FitnessRepository.kt in the Android app)
    views.py         REST API (urls.py lists every endpoint)
    domain/          framework-free logic shared in spirit with Android:
                     strength.py + standards.py (scoring), share.py (plan codes), history_csv.py, seed.py
    tests/           domain + API tests
frontend/
  src/api.ts         typed API client
  src/pages/         Today, Plans (+ share/import), Day editor, History, Analytics, Exercises, Settings
  src/ui.tsx         small design system (sheets on native <dialog>, menus, toasts, …)
docs/formats.md      share code and CSV formats
```

## Develop

```bash
# backend (Python 3.12+)
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # macOS/Linux: .venv/bin/pip
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py runserver           # http://127.0.0.1:8000

# frontend, in another terminal
cd frontend
npm install
npm run dev                                         # http://localhost:5173, proxies /api to :8000
```

Local test account used during development (local SQLite only): `demo` / `ironlog-demo-2026`.

```bash
cd backend && .venv/Scripts/python manage.py test ironlog    # backend tests
cd frontend && npx vitest run                                # frontend tests
```

## Build & deploy

`npm run build` (in `frontend/`) writes the app to `backend/frontend_dist/`; Django then serves it for every non-API
URL, so one Django process hosts everything.

Production settings come from environment variables:

| variable | |
| --- | --- |
| `IRONLOG_DEBUG` | `false` in production |
| `IRONLOG_SECRET_KEY` | required when debug is off |
| `IRONLOG_ALLOWED_HOSTS` | e.g. `ironlog.pythonanywhere.com` |
| `IRONLOG_CSRF_TRUSTED_ORIGINS` | e.g. `https://ironlog.pythonanywhere.com` |
| `IRONLOG_DB_PATH` | optional SQLite path |

Then `python manage.py migrate` and `python manage.py collectstatic`.
