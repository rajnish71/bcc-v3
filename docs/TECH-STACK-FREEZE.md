# FINAL_TECHNOLOGY_STACK_FREEZE
Status: FROZEN / AUTHORITATIVE
Authority: MISSION-007A

Frontend:  Astro (TypeScript, SSG/SSR hybrid, Vanilla CSS, Design Tokens, GSAP)
Backend:   NestJS + Fastify (TypeScript, Modular Monolith)
Database:  MySQL + Kysely (no ORM, database-first schema, SQL migrations)
API:       REST / JSON / /api/v1 / OpenAPI 3.x / Swagger / Typed Client Required
Auth:      DEFERRED (Session+JWT Hybrid OR JWT+Refresh Token)
Storage:   Cloudflare R2
CDN:       ImageKit.io
Infra:     Docker + Nginx + Linux (AWS compatible)
CI/CD:     Git + GitHub + GitHub Actions

FORBIDDEN:
- Microservices
- Polyrepo Architecture
- Heavy ORM Dependency
- GraphQL as Primary API
- Multiple Frontend Frameworks
- Dedicated Mobile Backend
- Kubernetes (current stage)
