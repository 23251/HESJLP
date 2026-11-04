# Visitor counts (Supabase) – maintainer notes

The site asks each visitor once whether they are a patient/family member or a provider/staff. Each answer saves one row (`role` plus time) in the Supabase table `public.visitor_responses`. Nothing identifying is stored.

## One-time setup: run schema.sql

1. Sign in at https://supabase.com/dashboard and open the project.
2. Left menu: **SQL Editor** → **New query**.
3. Paste the whole contents of `supabase/schema.sql` and click **Run**.
4. Check it worked, from a terminal in this folder:
   `scripts/verify-supabase.sh https://bgwaofspmqaxnhpsbwvy.supabase.co <publishable key from config.js>`
   Every line should say PASS. Each run adds one test row with role `provider`.

Running `schema.sql` again is safe. It does not delete saved answers.

## Viewing the counts

- **Table Editor:** left menu → **Table Editor** → `visitor_responses`. This shows every row.
- **SQL Editor** (as the project owner), totals:
  ```sql
  select role, count(*) from public.visitor_responses group by role order by role;
  ```
  Per day (Chicago time):
  ```sql
  select (created_at at time zone 'America/Chicago')::date as day, role, count(*)
  from public.visitor_responses group by day, role order by day desc, role;
  ```

The public website key cannot read these counts. Only you can, from the dashboard.

## Free-tier pause

Supabase pauses free-plan projects after a period of low activity (about a week, under Supabase's current policy). You get an email first. A paused project keeps its data, but it does not accept requests.

To restore: open the dashboard, select the project, and click **Restore project**. It takes a few minutes. Supabase's dashboard says how long a paused project can still be restored, so do not leave it paused for months.

**What the site does while the project is paused:** pages work normally and the prompt still shows. When someone answers, the save fails silently, so the answer is **not counted**. The browser still remembers the answer, so that visitor is not asked again. Nothing is queued or retried later.

## Turning counting off

In `config.js`, set `supabaseUrl: ""`. The prompt will no longer appear.

## Testing the prompt again in your own browser

Open any page with `?resetvisitor=1` added to the address (for example `index.html?resetvisitor=1`). Or run `localStorage.removeItem('hesjlp-visitor')` in the browser console and reload.
