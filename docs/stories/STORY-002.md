# STORY-002 — Flag uncertain bookings for review

As a booking manager, I want to flag uncertain bookings for review, so that they can be verified before confirmation.

**Release:** r2 · User Experience Improvements (weeks 3–3)
**Owner:** Booking Manager
**Blocked by:** STORY-001

## The requirement this satisfies

- **REQ-003** (Functional, must) — The system must flag bookings for manual review when availability is uncertain.

## How to build it

Implement a flagging system in the booking review interface to mark uncertain bookings.

## Failure paths you must handle

- Booking data is corrupted
- Flagging system fails
- Review interface crashes

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [x] Given a booking with missing information, when I review it, then it is flagged for further action.
- [x] Given a booking with all required information, when I review it, then it is not flagged.
- [x] Trust: Every flagged booking is recorded with a reason for the flag.

When every box above is ticked, stop and show the demo.
