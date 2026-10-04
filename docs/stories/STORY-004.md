# STORY-004 — Send booking confirmations and update status

As a booking manager, I want to send booking confirmations and update the booking status, so that customers are informed and records are accurate.

**Release:** r1 · Enhanced Booking Management (weeks 2–2)
**Owner:** Booking Manager
**Blocked by:** STORY-003

## The requirement this satisfies

- **REQ-005** (Constraint, must) — The system must integrate with Gmail for sending booking confirmations.
- **REQ-004** (Functional, must) — The system must show all prepared bookings to the salon owner before sending confirmations.

## How to build it

Use the Gmail API to send confirmation emails and update the booking status in the database.

## Failure paths you must handle

- Email address is invalid
- Gmail API is down
- Booking status fails to update

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [x] Given a confirmed booking, when I send a confirmation, then the customer receives an email via Gmail.
- [x] Given a booking without an email address, when I attempt to send a confirmation, then I receive an error message.
- [x] Trust: Every sent confirmation is logged with a timestamp and booking ID.

When every box above is ticked, stop and show the demo.
