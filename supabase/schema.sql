-- =====================================================================
-- Visitor count table for the "Medicaid Is Changing" website
-- =====================================================================
-- What this does, in plain English:
--   The first time a browser opens the website, the site adds ONE row
--   with role 'visit', so every first-time visitor is counted. The site
--   then asks: "Are you a patient/family member or a health care
--   provider/staff?" If they answer, the site adds ONE more row with
--   that answer. Each row holds only the role and the time.
--   No names, no IP addresses, nothing that identifies a person.
--
-- How to run it:
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole
--   file -> Run. It is safe to run more than once ("idempotent"): it will
--   not delete existing rows and will not create duplicates.
-- =====================================================================


-- Create the table if it does not exist yet. Each row is one answer.
--   id         : a number Postgres assigns automatically (1, 2, 3, ...).
--   role       : 'visit' (a first-time visitor), or the answer,
--                'patient' or 'provider'. Anything else is rejected by
--                the database.
--   created_at : the date and time the answer was saved (filled in
--                automatically by the database, not by the visitor).
create table if not exists public.visitor_responses (
  id         bigint generated always as identity primary key,
  role       text not null check (role in ('visit', 'patient', 'provider')),
  created_at timestamptz not null default now()
);


-- If the table was created by an older copy of this file (before 'visit'
-- existed), "create table if not exists" leaves the old rule in place.
-- Replace the rule so 'visit' rows are accepted too.
alter table public.visitor_responses
  drop constraint if exists visitor_responses_role_check;
alter table public.visitor_responses
  add constraint visitor_responses_role_check
  check (role in ('visit', 'patient', 'provider'));


-- Turn on Row Level Security (RLS). With RLS on, the public website key
-- can do NOTHING with this table except what a policy below allows.
alter table public.visitor_responses enable row level security;


-- Remove the old copy of our one policy (if this file was run before),
-- so the next statement can create it fresh without an error.
drop policy if exists "Website visitors can add an answer" on public.visitor_responses;


-- The one and only policy: the public website (the "anon" role) may ADD
-- a row, and only when the role is 'visit', 'patient', or 'provider'.
-- There are deliberately NO policies for reading, changing, or deleting
-- rows, so the public website cannot see or alter any saved answers.
create policy "Website visitors can add an answer"
  on public.visitor_responses
  for insert
  to anon
  with check (role in ('visit', 'patient', 'provider'));


-- Take away every permission the public roles might have on this table
-- (Supabase grants some by default). "anon" is the public website key;
-- "authenticated" is any logged-in user (this site has no logins).
revoke all on public.visitor_responses from anon, authenticated;


-- Give back exactly one permission: the public website may insert a row
-- and may fill in ONLY the "role" column. It cannot set id or created_at,
-- cannot add extra fields, and cannot read anything back.
grant insert (role) on public.visitor_responses to anon;


-- =====================================================================
-- HOW TO SEE THE COUNTS (run these yourself; they are not run above)
-- =====================================================================
-- You are the project owner, so the SQL Editor can read the table even
-- though the public website cannot. Copy ONE query below (without the
-- leading "-- ") into a new SQL Editor query and click Run.
--
-- Totals by type ('visit' = first-time visitors, whether or not they answered;
-- 'patient' and 'provider' = answers):
--   select role, count(*) from public.visitor_responses group by role order by role;
--
-- Share of first-time visitors who answered:
--   select count(*) filter (where role = 'visit')                      as visitors,
--          count(*) filter (where role in ('patient', 'provider'))     as answered,
--          count(*) filter (where role = 'patient')                    as patients
--   from public.visitor_responses;
--
-- Answers per day (Chicago time), newest day first:
--   select (created_at at time zone 'America/Chicago')::date as day,
--          role,
--          count(*)
--   from public.visitor_responses
--   group by day, role
--   order by day desc, role;
--
-- Note: rows whose role is 'provider' or 'visit' may include a few test
-- rows added by scripts/verify-supabase.sh (it never inserts 'patient',
-- so patient counts stay clean).
-- =====================================================================
