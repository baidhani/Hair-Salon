# Hair Salon Booking Manager — Requirements

A simple web-based booking management system for salon owners, integrating with Gmail for communication and ensuring correct customer contact information.

This is the source of truth for what you are building. Your Claude Code prompts
point here. If you sharpen a requirement, edit it — your version is the real one.

| Kind | Meaning |
|---|---|
| Functional | something the system does |
| Safety | a guardrail, with a check that enforces it |
| Reliability | how it behaves when something fails |
| Constraint | a technology or vendor you must use — context, not a task |

## Booking Review

### REQ-004 — Functional · must

The system must show all prepared bookings to the salon owner before sending confirmations.

Fulfilled by: STORY-003, STORY-004

## Booking Verification

### REQ-002 — Functional · must

The system must verify correct customer contact information before confirming a booking.

Fulfilled by: STORY-001

### REQ-003 — Functional · must

The system must flag bookings for manual review when availability is uncertain.

Fulfilled by: STORY-002

## Integrations

### REQ-005 — Constraint

The system must integrate with Gmail for sending booking confirmations.

Fulfilled by: STORY-004

## UI

### REQ-001 — Functional · must

The system must provide a web-based UI for salon owners to manage bookings.

Fulfilled by: STORY-001, STORY-005
