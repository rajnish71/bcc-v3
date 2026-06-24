# BCC Unified Platform V3

Bhopal Camera Club — Unified Platform

**Status:** Phase 0 — Foundation & Infrastructure

## Constitutional Documents
- MEM-006: Membership Constitution and Architecture v1.0 — FROZEN AUTHORITATIVE
- MEM-007: Membership Numbering Constitution v1.0 — FROZEN AUTHORITATIVE
- TECH: FINAL_TECHNOLOGY_STACK_FREEZE — FROZEN AUTHORITATIVE

## Stack
- Frontend: Astro (TypeScript, SSG/SSR hybrid)
- Backend: NestJS + Fastify (TypeScript, Modular Monolith)
- Database: MySQL 8.0 (Kysely query builder, no ORM)
- API: REST / JSON / /api/v1 / OpenAPI 3.x

## Repository Structure
/frontend   - Astro application
/backend    - NestJS application
/database   - SQL migration scripts and seeds
/docs       - OpenAPI specs, architecture decisions, constitutional documents
/infra      - Docker, Nginx, GitHub Actions
/scripts    - Migration utilities, data import scripts
/uploads    - Local dev staging only (gitignored)
/archives   - Historical data exports (gitignored)

## Domain
- https://v2bcc.bhopal.info (staging/development)
- https://bcc.bhopal.info (production - current live site, untouched)
