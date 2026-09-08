# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Internal sales reps (small team, 2-10 people) at Oqla who cold-call padel clubs. They use the app while on the phone: pulling up a club, following a live call script, then logging the outcome and scheduling a follow-up or demo. An admin role manages team member accounts.

## Product Purpose

A sales CRM for one specific motion: work a list of padel clubs from first cold call through to a signed deal. Tracks each club's status on a kanban-style pipeline, walks the rep through a branching call script during the call itself, and schedules/tracks demo meetings. Success is a club moving from "not called" to "won," with nothing falling through the cracks.

## Positioning

Purpose-built for this one sales motion (cold-call padel clubs about Oqla's court-camera product), not a generic CRM — the call script is Oqla's actual sales script embedded as a live, clickable decision tree, and the pipeline stages match Oqla's actual sales process rather than generic CRM stages.

## Operating Context

- Rep opens the board, picks a club, starts a call, clicks through the script live while talking, logs the outcome (sent offer, meeting booked, lost, etc.), leaves a note.
- CSV import/export for bulk-loading club lists, with a manual conflict-resolution step when imported data collides with existing records.
- Weekly calendar view of upcoming demo/follow-up meetings across all clubs.
- Admin panel: add team members, reset passwords.
- Backed by Supabase (multi-user, shared data); falls back to local-only mode (localStorage) when Supabase isn't configured.

## Capabilities and Constraints

- React + Vite SPA, single-page, two views (kanban board / active call script), no router library — routing is done through URL query params.
- Data model: clubs (with a JSON payload for flexible fields), user profiles with an admin flag, and team-wide shared memos.
- Existing brand: Oqla logo (`src/assets/logo-oqla.png`) — dark navy, a mid blue, and a bright green accent color.

## Brand Commitments

Redesign should stay recognizably Oqla: the logo's navy / blue / green palette is the anchor for the new visual system, not a from-scratch palette.

## Evidence on Hand

- `src/assets/logo-oqla.png` — real product logo, only brand asset on hand.
- No customer testimonials, case studies, or marketing copy — this is an internal tool, not a customer-facing surface.

## Product Principles

- Built for one specific workflow, not general-purpose flexibility — resist generic-CRM feature creep.
- Speed and scanability during a live phone call outrank visual flourish; the rep is on the phone while using this.
- Small trusted team — favor clarity and low friction over enterprise-grade permissioning/polish.

## Accessibility & Inclusion

No specific requirement established; standard web accessibility practice applies (this is a small internal tool, not a regulated or public-facing surface).
