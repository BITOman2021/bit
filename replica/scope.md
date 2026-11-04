# Scope draft: salon booking app for Oman

Status: DRAFT. Written without network access. Nothing here is taken from a
competitor's pages; competitor facts come later from `/replica-recon`.

## Product
A booking app for salons in Oman (women's and men's salons, barbers, beauty
centres). Customers book online with no account. Salons manage their day from
a dashboard. Clinics are out of scope for v1 (medical-data privacy rules).

## Target and market
- Buyer: the salon owner (B2B). Users: salon staff and their customers.
- Country: Oman. Currency: OMR (3 decimals). Time zone: Asia/Muscat (UTC+4, no DST).
- Languages: Arabic (RTL) and English, Arabic first.
- Week: Sun-Thu workdays are common but configurable per salon. Prayer-time and
  Ramadan opening hours need per-day overrides.
- Reminder channel: WhatsApp first, SMS fallback. (Needs an official provider:
  WhatsApp Business API; template approval required.)
- Women-only salons: hide staff photos and gallery by default (setting).

## Core loop (the slice to build first)
Customer opens salon link -> picks service -> picks staff (or "any") -> picks
time -> enters name + phone -> gets confirmation + WhatsApp reminder.
Owner sees it on the calendar and can confirm, move or cancel.

## v1 features
| area | feature | priority |
| --- | --- | --- |
| customer | public booking page per salon (link / QR) | must |
| customer | service list with duration and price | must |
| customer | choose staff or "any available" | must |
| customer | slot picker honouring hours, breaks, existing bookings | must |
| customer | phone-number verification (OTP) | should |
| customer | cancel / reschedule via link | should |
| salon | day and week calendar | must |
| salon | services, categories, durations, prices | must |
| salon | staff, their services and working hours | must |
| salon | opening hours, breaks, holidays, Ramadan override | must |
| salon | manual booking by phone / walk-in | must |
| salon | customer list with visit history and notes | should |
| salon | WhatsApp / SMS reminders and confirmations | must |
| salon | no-show tracking | could |
| salon | simple daily sales summary | could |
| platform | Arabic RTL + English | must |
| platform | monthly subscription billing | should |

## Out of v1
Online payments and deposits, native mobile apps (web first, installable PWA),
multi-salon marketplace / discovery, loyalty and gift cards, inventory,
payroll, clinics.

## Monetisation (hypothesis to test)
Flat monthly subscription per salon, with a free trial. A free tier limited to
one staff member is a candidate. Price to be set from competitor pricing pages
(`/replica-launch`) and a few owner interviews. Do not assume a number yet.

## Open questions
1. Which payment path suits Omani merchants for the subscription (card,
   Thawani, bank transfer)?
2. Is WhatsApp Business API cost per message acceptable at salon price points?
3. Do owners want customer self-booking, or mainly a staff-side calendar?
   Validate with 5 owners before building beyond the core loop.
4. Data protection: Oman's Personal Data Protection Law applies to customer
   phone numbers and names. Needs a privacy policy and a consent line.

## Recon still to do (blocked on network access)
- Competitors to map: Fresha, Setmore, Booksy, plus any Oman/GCC local apps.
- Sources per the skill: help centre, pricing, changelog, store listings.
- Output: `replica/recon.md`, `replica/features.csv`, `replica/screens/`.
- Then: `/replica-architect`.

## Rules carried over
Rebuild features and flows only, clean-room. No competitor code, logo, copy or
imagery. Public sources and the user's own free trial accounts only.
