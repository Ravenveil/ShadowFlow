# Contributing to ShadowFlow

Thanks for your interest in contributing! 🎉 This guide covers everything you need to get started.

## Project Overview

ShadowFlow is a contract-first multi-agent workflow platform with a **dual backend**:

| Stack | Location | Tech | Port |
|---|---|---|---|
| Web UI | `src/` | React 18 + Vite + Zustand + ReactFlow | 3007 |
| Gateway API | `server/` | Node + tsx + Express + better-sqlite3 | 8002 |
| Python API | `shadowflow/` | FastAPI + Uvicorn | 8000 |

One command starts everything: `npm run dev` (requires the `.venv` Python env for the backend).

## Getting Started

```bash
# 1. Clone & install JS deps
git clone https://github.com/Ravenveil/ShadowFlow.git
cd ShadowFlow
npm install
cd server && npm install && cd ..

# 2. Python backend (optional, for full stack)
python -m venv .venv
# Windows:
.venv\Scripts\pip install -e ".[dev]"
# macOS/Linux:
.venv/bin/pip install -e ".[dev]"

# 3. Start everything
npm run dev          # UI :3007 + gateway :8002 + python :8000
npm run dev -- --no-python   # skip python backend
```

API keys are **BYOK** (bring-your-own-key): paste them in the web UI; they live in your browser's localStorage. See `.env.example` for optional server-side keys — **never commit real keys**.

## Development Workflow

```bash
npm run lint         # ESLint (zero-warning policy)
npm run test         # Vitest watch mode
npm run test:run     # single pass
npm run test:coverage
```

- Backend (Python) lint: `ruff` + `mypy` (advisory), run by CI
- Frontend tests live next to sources (`*.test.ts(x)`)
- Python tests in `tests/` (pytest)

## Pull Request Guidelines

1. **Branch from `main`**, use a descriptive name: `feat/...`, `fix/...`, `docs/...`
2. **CI must pass** — lint + tests + docker build run on every PR
3. Keep PRs focused; one logical change per PR
4. Update docs (`README.md` / `README.zh.md`) when behavior changes
5. Write commit messages in [Conventional Commits](https://www.conventionalcommits.org/) style:
   ```
   feat(gateway): add run-session streaming endpoint
   fix(ui): prevent canvas double-zoom on trackpad
   ```

## Code Style

- TypeScript strict mode; prettier formatting (`npm run format`)
- Python: `ruff` formatting, type hints encouraged
- i18n: user-facing strings go through `react-i18next` (en + zh locales)

## Security Notes

- Never commit API keys, tokens, or `.env` files — CI scrubs them, but don't rely on it
- Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/Ravenveil/ShadowFlow/security/advisories) rather than public issues

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
