# STORY-003 — Review and approve prepared bookings

As a salon owner, I want to review all prepared bookings before they are sent, so that I can ensure accuracy.

**Release:** r0 · Initial Setup and Verification (weeks 1–1)
**Owner:** Salon Owner
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-004** (Functional, must) — The system must show all prepared bookings to the salon owner before sending confirmations.

## How to build it

Develop the booking review interface and approval workflow.

## Failure paths you must handle

- Review interface failure
- Approval workflow error
- Logging failure

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [x] Given prepared bookings, When I review them, Then I can approve or edit before sending.
- [x] Given a booking error, When I review, Then I can correct it before approval.
- [ ] Trust: Given a booking review, When approved, Then the approval is logged.

When every box above is ticked, stop and show the demo.
