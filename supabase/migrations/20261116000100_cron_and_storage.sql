-- Runs on Supabase only (pg_cron and the storage schema don't exist in a plain Postgres).
-- Enable pg_cron first: Dashboard → Database → Extensions → pg_cron.

create extension if not exists pg_cron;

-- Calendar: reminders before silence counts as approval, then auto-approval.
select cron.schedule('process-event-deadlines', '*/5 * * * *', $$select public.process_event_deadlines()$$);

-- Fixed bills: remind the responsible partner on their chosen day (US-9).
select cron.schedule('fixed-bill-reminders', '0 7 * * *', $$
  insert into public.notifications (user_id, apartment_id, kind, payload)
  select responsible_id, apartment_id, 'bill_reminder', jsonb_build_object('bill_id', id, 'name', name)
  from public.fixed_bills
  where active and reminder_day = extract(day from now() at time zone 'Asia/Jerusalem')
$$);

-- Photos and videos for landlord requests.
-- Path convention: <apartment_id>/<request_id>/<file name>
insert into storage.buckets (id, name, public) values ('request-media', 'request-media', false)
on conflict (id) do nothing;

create policy "request media: read" on storage.objects for select using (
  bucket_id = 'request-media'
  and (public.is_partner(((storage.foldername(name))[1])::uuid)
       or public.is_landlord(((storage.foldername(name))[1])::uuid)));

create policy "request media: upload" on storage.objects for insert with check (
  bucket_id = 'request-media'
  and public.is_partner(((storage.foldername(name))[1])::uuid));
