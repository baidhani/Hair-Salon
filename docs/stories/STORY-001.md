# STORY-001 — Create and verify a booking

As a salon owner, I want to create a booking and verify customer contact information, so that I can ensure accurate bookings.

**Release:** r0 · Initial Setup and Verification (weeks 1–1)
**Owner:** Salon Owner
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-001** (Functional, must) — The system must provide a web-based UI for salon owners to manage bookings.
- **REQ-002** (Functional, must) — The system must verify correct customer contact information before confirming a booking.

## How to build it

Implement the booking creation form and integrate contact verification logic.

## Failure paths you must handle

- Invalid contact info
- Network error during verification
- UI form submission failure

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a new booking request, When I enter customer contact information, Then the system verifies the information is correct.
- [ ] Given incorrect contact information, When I try to confirm the booking, Then the system flags the error and prevents confirmation.
- [ ] Trust: Given a booking creation, When contact info is verified, Then it is logged for audit.

When every box above is ticked, stop and show the demo.
