# Stories vs. Collections — Definition

> **Status:** Owner-approved 2026-07-14 (Stage 7 · Batch B1 · item 69).
> **Authority:** Subordinate to PHOTO-ARCH-001 (`PHOTO-ASSET-ARCHITECTURE_FREEZE_v1.0.md`).
> Both Stories and Collections are PHOTO-ARCH-001 **Containers** — they *reference*
> Canonical Photos and never own or copy them. This document defines only how the two
> presentation kinds differ. It does not alter the frozen PHOTO-ARCH-001 body.
>
> Data model: `photo_albums.kind` = `STORY | COLLECTION` (migration 0060).
> Narrative fields `eyebrow`, `subtitle`, `genre` added in migration 0061.

---

## 1. Stories (Narrative & Depth)

**Definition:** A curated, sequential photo essay driven by a specific theme, message, or
narrative arc. A Story focuses on the **why** and the **who**, capturing the emotional or
conceptual depth of a singular subject.

- **The Vibe:** Deep, intentional, and narrative-driven.
- **Structure:** A clear beginning, middle, and end. **The order of the photos matters
  deeply** to the message being conveyed (`photo_album_items.sort_order` is the reading order).
- **Scope:** Narrow and focused.
- **Example:** *"The Last Weavers of Varanasi"* — a close-up look at a single family
  struggling to keep a dying craft alive amidst modern industrialization.

## 2. Collections (Curation & Breadth)

**Definition:** A comprehensive showcase of high-quality photographs grouped by a shared
subject, style, or location. A Collection focuses on the **what** and the **where**, serving
as a visual archive that celebrates the diversity of a broader topic.

- **The Vibe:** Expansive, visually cohesive, and exploratory.
- **Structure:** A gallery of standout images. The photos complement each other
  aesthetically, but **each image can comfortably stand entirely on its own** (order is flexible).
- **Scope:** Broad and inclusive.
- **Example:** *"Varanasi: Life Along the Ganges"* — a wide-ranging compilation capturing
  street life, morning rituals, architecture, and landscapes across the entire city.

---

## 3. At-a-Glance Comparison

| Feature | Stories | Collections |
| --- | --- | --- |
| **Primary Goal** | Tell a specific narrative or convey a message. | Showcase visual variety within a single topic. |
| **Focus** | Depth — a narrow, deep dive into a specific angle. | Breadth — a wide overview of a category or place. |
| **Sequence** | Chronological or thematic progression (**order matters**). | Gallery format (**order is flexible**). |
| **Text / Captioning** | Often relies on strong captions or text to guide the plot. | Relies primarily on visual impact and basic metadata. |

> **Pro-tip:** Think of a **Collection** as a beautiful photo anthology book, and a
> **Story** as a single, gripping chapter within it.

---

## 4. Component Layout & Copy Blueprint

### 4.1 Section headings & intro blurbs
Placed on portfolio / gallery landing pages.

**Stories** — *Narrative-driven photo essays exploring a single theme, message, or conceptual
arc. Deep, intentional, and told in sequence.*

**Collections** — *Visual archives celebrating the breadth of a specific subject, style, or
location. A diverse showcase of standalone imagery.*

### 4.2 Info-modal content (ⓘ icon → popup)

**Modal title:** *Understanding Our Gallery: Stories vs. Collections* — a quick guide to
navigating our visual archives.

- **📸 Stories (Narrative & Depth)** — A curated, sequential photo essay with a clear
  beginning, middle, and end. The order of the photos matters deeply to the narrative arc.
  *Example: "The Last Weavers of Varanasi" — a deep dive into a single family's craft.*
- **🗂️ Collections (Curation & Breadth)** — A comprehensive visual showcase grouped by
  location, subject, or style. The photos complement each other aesthetically, but each image
  comfortably stands alone. *Example: "Varanasi: Life Along the Ganges" — a broad overview of
  the city's streets, landscapes, and rituals.*

---

## 5. Field usage by kind

| Field (`photo_albums`) | Story | Collection |
| --- | --- | --- |
| `title` | required | required |
| `eyebrow` | recommended (kicker above title) | optional |
| `subtitle` | recommended | optional |
| `description` | recommended (guides the plot) | optional |
| `genre` | single primary category (from the 20-name taxonomy) | single primary category |
| item `sort_order` | **meaningful** (reading order) | display order only |

Public pages **VS 22 Story Public Page** and **VS 23 Collection Public Page** consume these
fields; scaffolded in Batch B1, built when those wireframes are delivered.
