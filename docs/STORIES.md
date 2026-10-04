# Hair Salon Booking Manager — Stories

5 stories across 4 releases, walking-skeleton first:
the earliest release proves the thinnest end-to-end path including the trust
spine, and later releases stack features on top of something already working.

## Before the releases — start here

- **[STORY-000](stories/STORY-000.md)** — Build your Command Center

The first thing you build, on day one, before any part of the system itself. It is
the page you keep open for the rest of the programme and demo from. It belongs to no
release and fulfils none of your requirements, because it is the window onto your
system rather than a part of it.

## r0 · Initial Setup and Verification — weeks 1–1

**Goal:** Establish the basic booking management system with verification and review features.
**Done when you can show:** Show a booking being created, verified, flagged for review, and displayed for owner approval before sending via Gmail.

- **[STORY-001](stories/STORY-001.md)** — Create and verify a booking
- **[STORY-003](stories/STORY-003.md)** — Review and approve prepared bookings

## r1 · Enhanced Booking Management — weeks 2–2

**Goal:** Improve the booking management process with additional features and optimizations.
**Done when you can show:** Demonstrate enhanced booking management capabilities with improved UI and error handling.

- **[STORY-004](stories/STORY-004.md)** — Send booking confirmations and update status _(waits on STORY-003)_
- **[STORY-005](stories/STORY-005.md)** — Enhance booking UI for better user experience _(waits on STORY-004)_

## r2 · User Experience Improvements — weeks 3–3

**Goal:** Enhance the user interface and experience for salon owners.
**Done when you can show:** Showcase a more intuitive and user-friendly interface for managing bookings.

- **[STORY-002](stories/STORY-002.md)** — Flag uncertain bookings for review _(waits on STORY-001)_

## r3 · Performance Optimization — weeks 4–4

**Goal:** Optimize system performance and reliability.
**Done when you can show:** Demonstrate faster booking processing and reliable system performance under load.

_No stories in this release._
