# user_photo_titles — Legacy Classification Report

Stage: **CLASSIFY** — no carry-forward performed. Human Authority approval required before MAP / CARRY FORWARD.

- Snapshot: `user_photo_titles.snapshot.json` (sha256 `e484943c8e00fd4efcd8e5c59bacea4ed40c74ae3f7695b99b7165aaca539706`)
- Captured (prod server time): 2026-10-07 12:12:20
- Rows: 12 — MAPPABLE 4 · REQUIRES_CLASSIFICATION 2 · NOT_MAPPABLE 6

| Legacy id | User id | Username | body_code | body_name | title_code | sort | Classification | Proposed mapping | Reason |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 27 | sanjaykumarshukla | FIP | — | EFIP | 10 | MAPPABLE | FIP / EFIP | Exact match on HA-identified valid legacy distinction FIP / EFIP. Carry-forward requires HA approval of this report and creation of the catalogue entry (name, badge eligibility). |
| 2 | 27 | sanjaykumarshukla | PSA | — | PPSA | 20 | MAPPABLE | PSA / PPSA | Exact match on HA-identified valid legacy distinction PSA / PPSA. Carry-forward requires HA approval of this report and creation of the catalogue entry (name, badge eligibility). |
| 3 | 27 | sanjaykumarshukla | FIAP | — | AFIAP | 30 | MAPPABLE | FIAP / AFIAP | Exact match on HA-identified valid legacy distinction FIAP / AFIAP. Carry-forward requires HA approval of this report and creation of the catalogue entry (name, badge eligibility). |
| 4 | 27 | sanjaykumarshukla | GPU | — | GPU-CR3 | 40 | REQUIRES_CLASSIFICATION | GPU / (HA decision) | GPU value "GPU-CR3" requires Human Authority classification before carry-forward. No semantic meaning is inferred. |
| 5 | 27 | sanjaykumarshukla | GPU | — | GPU VIP-3 | 41 | REQUIRES_CLASSIFICATION | GPU / (HA decision) | GPU value "GPU VIP-3" requires Human Authority classification before carry-forward. No semantic meaning is inferred. |
| 6 | 27 | sanjaykumarshukla | OTHER | FRPA | FRPA | 50 | NOT_MAPPABLE | — | Body "FRPA" is not in the institution catalogue (FIP, FIAP, PSA, RPS, GPU) and there is no generic OTHER institution. Not migrated unless a future HA-approved catalogue decision adds it; preserved for review/re-declaration. |
| 7 | 27 | sanjaykumarshukla | OTHER | GNG | GNG | 51 | NOT_MAPPABLE | — | Body "GNG" is not in the institution catalogue (FIP, FIAP, PSA, RPS, GPU) and there is no generic OTHER institution. Not migrated unless a future HA-approved catalogue decision adds it; preserved for review/re-declaration. |
| 8 | 27 | sanjaykumarshukla | OTHER | PESGSPC | Hon PESGSPC | 52 | NOT_MAPPABLE | — | Body "PESGSPC" is not in the institution catalogue (FIP, FIAP, PSA, RPS, GPU) and there is no generic OTHER institution. Not migrated unless a future HA-approved catalogue decision adds it; preserved for review/re-declaration. |
| 9 | 27 | sanjaykumarshukla | OTHER | PESGSPC | GPA-PESGSPC | 53 | NOT_MAPPABLE | — | Body "PESGSPC" is not in the institution catalogue (FIP, FIAP, PSA, RPS, GPU) and there is no generic OTHER institution. Not migrated unless a future HA-approved catalogue decision adds it; preserved for review/re-declaration. |
| 10 | 27 | sanjaykumarshukla | OTHER | VNPC | HonVNPC | 54 | NOT_MAPPABLE | — | Body "VNPC" is not in the institution catalogue (FIP, FIAP, PSA, RPS, GPU) and there is no generic OTHER institution. Not migrated unless a future HA-approved catalogue decision adds it; preserved for review/re-declaration. |
| 11 | 27 | sanjaykumarshukla | OTHER | WPAI | Hon WPAI | 55 | NOT_MAPPABLE | — | Body "WPAI" is not in the institution catalogue (FIP, FIAP, PSA, RPS, GPU) and there is no generic OTHER institution. Not migrated unless a future HA-approved catalogue decision adds it; preserved for review/re-declaration. |
| 45 | 16 | kshitijpatle | FIP | — | AFIP | 20 | MAPPABLE | FIP / AFIP | Exact match on HA-identified valid legacy distinction FIP / AFIP. Carry-forward requires HA approval of this report and creation of the catalogue entry (name, badge eligibility). |
