-- =====================================================================
-- Shutaf: initial schema
-- Money is always integer minor units (agorot / cents) in *_minor columns.
-- Writes that involve money or approvals go through security-definer RPCs;
-- tables only allow direct writes where the rule is simple.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Users and apartments
-- ---------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  phone        text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.phone)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Short, unambiguous invite codes (no 0/O/1/I).
create or replace function public.gen_invite_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6)
$$;

create table public.apartments (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  address              text,
  currency             text not null default 'ILS',
  language             text not null default 'he' check (language in ('he', 'en')),
  invite_code          text not null unique default public.gen_invite_code(),
  landlord_invite_code text not null unique default public.gen_invite_code(),
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now()
);

create table public.memberships (
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null check (role in ('partner', 'landlord')),
  joined_at    timestamptz not null default now(),
  left_at      timestamptz,
  primary key (apartment_id, user_id)
);
create index on public.memberships (user_id);

-- Permission helpers (security definer so they can be used inside RLS policies
-- without recursing into memberships' own policies).
create or replace function public.is_partner(apt uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where apartment_id = apt and user_id = auth.uid()
                   and role = 'partner' and left_at is null)
$$;

create or replace function public.is_landlord(apt uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where apartment_id = apt and user_id = auth.uid() and role = 'landlord')
$$;

-- Partner now or in the past (a partner who left still sees their own debts).
create or replace function public.was_partner(apt uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where apartment_id = apt and user_id = auth.uid() and role = 'partner')
$$;

create or replace function public.active_partner_ids(apt uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(user_id order by user_id), '{}')
  from memberships where apartment_id = apt and role = 'partner' and left_at is null
$$;

-- ---------------------------------------------------------------------
-- Notifications outbox (the `notify` Edge Function sends push from here)
-- ---------------------------------------------------------------------

create table public.notifications (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  apartment_id uuid references public.apartments (id) on delete cascade,
  kind         text not null,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  read_at      timestamptz
);
create index on public.notifications (user_id, created_at desc);

create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create or replace function public.notify_users(users uuid[], apt uuid, kind text, payload jsonb)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, apartment_id, kind, payload)
  select u, apt, kind, payload from unnest(users) as u where u is distinct from auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Bills and expenses
-- ---------------------------------------------------------------------

create table public.shared_categories (
  id           uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  name         text not null,
  unique (apartment_id, name)
);

create table public.fixed_bills (
  id             uuid primary key default gen_random_uuid(),
  apartment_id   uuid not null references public.apartments (id) on delete cascade,
  name           text not null,                       -- rent, electricity, ...
  responsible_id uuid not null references auth.users (id),
  reminder_day   int check (reminder_day between 1 and 28),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  payer_id     uuid not null references auth.users (id),
  description  text not null,
  amount_minor bigint not null check (amount_minor > 0),
  kind         text not null check (kind in ('bill', 'purchase', 'spontaneous')),
  share_mode   text not null check (share_mode in ('all', 'selected', 'opt_in')),
  category_id  uuid references public.shared_categories (id) on delete set null,
  fixed_bill_id uuid references public.fixed_bills (id) on delete set null,
  bill_month   date,                                  -- first day of the month, for fixed bills
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now()
);
create index on public.expenses (apartment_id, created_at);

-- One row per participant. The payer's own share is included (it is not a debt).
create table public.expense_shares (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  user_id     uuid not null references auth.users (id),
  share_minor bigint not null check (share_minor >= 0),
  unique (expense_id, user_id)
);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  from_id      uuid not null references auth.users (id),
  to_id        uuid not null references auth.users (id),
  amount_minor bigint not null check (amount_minor > 0),
  created_at   timestamptz not null default now(),
  check (from_id <> to_id)
);

create table public.payment_allocations (
  payment_id   uuid not null references public.payments (id) on delete cascade,
  share_id     uuid not null references public.expense_shares (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  primary key (payment_id, share_id)
);

-- Rewrite an expense's shares with an even split. Remainder goes to the first
-- participants by id (same rule as splitEvenly() in src/domain/money.ts).
create or replace function public.rewrite_shares(exp uuid, participants uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  total bigint;
  n int;
begin
  select amount_minor into total from expenses where id = exp;
  select count(distinct p) into n from unnest(participants) p;
  if n = 0 then raise exception 'An expense needs at least one participant'; end if;

  delete from expense_shares where expense_id = exp;
  insert into expense_shares (expense_id, user_id, share_minor)
  select exp, p, total / n + case when rn <= total % n then 1 else 0 end
  from (select p, row_number() over (order by p) as rn
        from (select distinct p from unnest(participants) p) d) s;
end $$;

-- US-9, US-11, US-16: add an expense. For 'opt_in' the payer is the only
-- participant until others join; a shared category forces 'all'.
create or replace function public.add_expense(
  apt uuid, description text, amount_minor bigint, kind text, share_mode text,
  participant_ids uuid[] default null, category_id uuid default null,
  payer_id uuid default null, fixed_bill_id uuid default null, bill_month date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  exp uuid;
  mode text := share_mode;
  payer uuid := coalesce(payer_id, auth.uid());
  participants uuid[];
begin
  if not is_partner(apt) then raise exception 'Not a partner in this apartment'; end if;
  if not payer = any (active_partner_ids(apt)) then raise exception 'Payer is not a partner'; end if;
  if category_id is not null then
    if not exists (select 1 from shared_categories c where c.id = category_id and c.apartment_id = apt) then
      raise exception 'Unknown category';
    end if;
    mode := 'all';
  end if;

  participants := case mode
    when 'all' then active_partner_ids(apt)
    when 'selected' then participant_ids
    when 'opt_in' then array[payer]
  end;
  if mode = 'selected' and exists (select 1 from unnest(participants) p where not p = any (active_partner_ids(apt))) then
    raise exception 'Every participant must be a partner';
  end if;

  insert into expenses (apartment_id, payer_id, description, amount_minor, kind, share_mode,
                        category_id, fixed_bill_id, bill_month, created_by)
  values (apt, payer, description, amount_minor, kind, mode, category_id, fixed_bill_id, bill_month, auth.uid())
  returning id into exp;

  perform rewrite_shares(exp, participants);
  return exp;
end $$;

-- US-9: the responsible partner enters this month's amount for a fixed bill.
create or replace function public.add_bill_amount(bill uuid, amount_minor bigint, month date)
returns uuid language plpgsql security definer set search_path = public as $$
declare b fixed_bills;
begin
  select * into b from fixed_bills where id = bill;
  if b.id is null or not is_partner(b.apartment_id) then raise exception 'Not allowed'; end if;
  return add_expense(b.apartment_id, b.name, amount_minor, 'bill', 'all',
                     payer_id => b.responsible_id, fixed_bill_id => b.id,
                     bill_month => date_trunc('month', month)::date);
end $$;

-- US-12: join or leave an "open to join" purchase. Recalculates and notifies.
create or replace function public.set_expense_participation(exp uuid, joining boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  e expenses;
  participants uuid[];
begin
  select * into e from expenses where id = exp;
  if e.id is null or not is_partner(e.apartment_id) then raise exception 'Not allowed'; end if;
  if e.share_mode <> 'opt_in' then raise exception 'This purchase is not open to join'; end if;
  if not joining and auth.uid() = e.payer_id then raise exception 'The buyer cannot leave their own purchase'; end if;

  select array_agg(user_id) into participants from expense_shares where expense_id = exp;
  participants := case when joining then array_append(participants, auth.uid())
                       else array_remove(participants, auth.uid()) end;
  perform rewrite_shares(exp, participants);

  perform notify_users(participants || auth.uid(), e.apartment_id, 'expense_split_changed',
                       jsonb_build_object('expense_id', exp, 'user_id', auth.uid(), 'joined', joining));
end $$;

-- US-14: mark a payment. Closes immediately (no confirmation by design).
-- With debt_share, that debt is paid first; the rest goes to the oldest debts.
-- Same rule as allocatePayment() in src/domain/allocate.ts.
create or replace function public.record_payment(apt uuid, to_id uuid, amount_minor bigint, debt_share uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pay uuid;
  left_minor bigint := amount_minor;
  d record;
  take bigint;
begin
  -- A partner who left can still pay their open debts (spec §3.2).
  if not was_partner(apt) then raise exception 'Not a partner in this apartment'; end if;
  if amount_minor <= 0 then raise exception 'A payment must be positive'; end if;
  if to_id = auth.uid() then raise exception 'Cannot pay yourself'; end if;

  insert into payments (apartment_id, from_id, to_id, amount_minor)
  values (apt, auth.uid(), to_id, amount_minor) returning id into pay;

  for d in
    select s.id, s.share_minor - coalesce((select sum(a.amount_minor) from payment_allocations a where a.share_id = s.id), 0) as outstanding
    from expense_shares s join expenses e on e.id = s.expense_id
    where e.apartment_id = apt and s.user_id = auth.uid() and e.payer_id = record_payment.to_id
    order by (s.id = debt_share) desc nulls last, e.created_at, s.id
  loop
    exit when left_minor = 0;
    continue when d.outstanding <= 0;
    take := least(left_minor, d.outstanding);
    insert into payment_allocations (payment_id, share_id, amount_minor) values (pay, d.id, take);
    left_minor := left_minor - take;
  end loop;

  perform notify_users(array[to_id], apt, 'payment_marked',
                       jsonb_build_object('payment_id', pay, 'amount_minor', amount_minor));
  return pay;
end $$;

-- Net debt between every pair: debtor owes creditor amount_minor (> 0).
-- security_invoker so the caller's RLS on expenses/payments applies.
create view public.pair_balances with (security_invoker = true) as
with flows as (
  select e.apartment_id, s.user_id as debtor, e.payer_id as creditor, s.share_minor as amount
  from expense_shares s join expenses e on e.id = s.expense_id
  where s.user_id <> e.payer_id
  union all
  -- paying someone back = they now owe you that amount
  select apartment_id, to_id, from_id, amount_minor from payments
), directed as (
  select apartment_id, debtor, creditor, sum(amount) as amount from flows group by 1, 2, 3
), netted as (
  select d.apartment_id, d.debtor, d.creditor, d.amount - coalesce(r.amount, 0) as net
  from directed d
  left join directed r on r.apartment_id = d.apartment_id and r.debtor = d.creditor and r.creditor = d.debtor
)
select apartment_id, debtor, creditor, net as amount_minor from netted where net > 0;

-- Open debts per share, for the detailed list and for "pay this debt".
create view public.open_debts with (security_invoker = true) as
select s.id as share_id, e.apartment_id, e.id as expense_id, e.description, e.created_at,
       s.user_id as debtor, e.payer_id as creditor,
       s.share_minor - coalesce(sum(a.amount_minor), 0) as outstanding_minor
from expense_shares s
join expenses e on e.id = s.expense_id
left join payment_allocations a on a.share_id = s.id
where s.user_id <> e.payer_id
group by s.id, e.id
having s.share_minor - coalesce(sum(a.amount_minor), 0) > 0;

-- ---------------------------------------------------------------------
-- Shopping
-- ---------------------------------------------------------------------

create table public.shopping_items (
  id           uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  name         text not null,
  added_by     uuid not null references auth.users (id) default auth.uid(),
  status       text not null default 'open' check (status in ('open', 'bought')),
  category_id  uuid references public.shared_categories (id) on delete set null,
  ai_suggested boolean not null default false,
  expense_id   uuid references public.expenses (id) on delete set null,
  created_at   timestamptz not null default now(),
  bought_at    timestamptz
);
create index on public.shopping_items (apartment_id, status);

-- US-16: the buyer checks off items and enters the total; becomes one expense.
-- A mixed purchase is recorded as two calls (one per share mode).
create or replace function public.complete_shopping(apt uuid, item_ids uuid[], total_minor bigint,
                                                    share_mode text, description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  exp uuid;
  all_shared boolean;
begin
  if not is_partner(apt) then raise exception 'Not a partner in this apartment'; end if;
  if exists (select 1 from unnest(item_ids) i where not exists
             (select 1 from shopping_items s where s.id = i and s.apartment_id = apt and s.status = 'open')) then
    raise exception 'Some items are not open items of this apartment';
  end if;
  -- Items that are all in shared categories are always split between everyone.
  select bool_and(category_id is not null) into all_shared from shopping_items where id = any (item_ids);

  exp := add_expense(apt, coalesce(description, 'קניות'), total_minor, 'purchase',
                     case when all_shared then 'all' else share_mode end);
  update shopping_items set status = 'bought', bought_at = now(), expense_id = exp where id = any (item_ids);
  return exp;
end $$;

-- ---------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------

create table public.events (
  id                uuid primary key default gen_random_uuid(),
  apartment_id      uuid not null references public.apartments (id) on delete cascade,
  requester_id      uuid not null references auth.users (id),
  type              text not null check (type in ('guests', 'party', 'shabbat_big')),
  title             text,
  period            tstzrange not null check (not isempty(period)),
  all_day           boolean not null default false,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decision_deadline timestamptz not null,
  reminded_at       timestamptz,
  created_at        timestamptz not null default now(),
  -- US-22: no two events at the same time. A pending request already holds the slot.
  constraint no_overlap exclude using gist (apartment_id with =, period with &&)
    where (status in ('pending', 'approved'))
);

create table public.event_responses (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references auth.users (id),
  response   text not null check (response in ('approve', 'reject')),
  reason     text,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  check (response = 'approve' or coalesce(trim(reason), '') <> '')
);

-- How long partners have to answer before silence counts as approval.
-- OPEN DECISION (spec §13): placeholder = half the time until the event,
-- at least 2 hours and at most 48 hours.
create or replace function public.event_deadline(starts timestamptz) returns timestamptz
language sql stable as $$
  select now() + least(interval '48 hours', greatest(interval '2 hours', (starts - now()) / 2))
$$;

-- US-19
create or replace function public.request_event(apt uuid, type text, starts timestamptz, ends timestamptz,
                                                all_day boolean default false, title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare ev uuid;
begin
  if not is_partner(apt) then raise exception 'Not a partner in this apartment'; end if;
  if starts <= now() then raise exception 'An event must be in the future'; end if;
  insert into events (apartment_id, requester_id, type, title, period, all_day, decision_deadline)
  values (apt, auth.uid(), type, title, tstzrange(starts, ends, '[)'), all_day, event_deadline(starts))
  returning id into ev;
  insert into event_responses (event_id, user_id, response) values (ev, auth.uid(), 'approve');
  perform maybe_approve_event(ev);
  return ev;
end $$;

-- Approve when every active partner has approved.
create or replace function public.maybe_approve_event(ev uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = ev;
  if e.status = 'pending' and not exists (
       select 1 from unnest(active_partner_ids(e.apartment_id)) p
       where not exists (select 1 from event_responses r where r.event_id = ev and r.user_id = p and r.response = 'approve'))
  then
    update events set status = 'approved' where id = ev;
  end if;
end $$;

-- US-20: approve or reject. Approval is final; rejection needs a reason and cancels the request.
create or replace function public.respond_event(ev uuid, response text, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = ev;
  if e.id is null or not is_partner(e.apartment_id) then raise exception 'Not allowed'; end if;
  if e.status <> 'pending' then raise exception 'This request is no longer pending'; end if;
  insert into event_responses (event_id, user_id, response, reason) values (ev, auth.uid(), response, reason);
  if response = 'reject' then
    update events set status = 'rejected' where id = ev;
    perform notify_users(array[e.requester_id], e.apartment_id, 'event_rejected',
                         jsonb_build_object('event_id', ev, 'reason', reason));
  else
    perform maybe_approve_event(ev);
  end if;
end $$;

-- US-23: the requester cancels (frees the slot) or edits.
-- A significant edit (type or time) needs approval again; a title change does not.
create or replace function public.cancel_event(ev uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update events set status = 'cancelled'
  where id = ev and requester_id = auth.uid() and status in ('pending', 'approved');
  if not found then raise exception 'Only the requester can cancel an open event'; end if;
end $$;

create or replace function public.edit_event(ev uuid, new_type text, starts timestamptz, ends timestamptz,
                                             new_all_day boolean, new_title text)
returns void language plpgsql security definer set search_path = public as $$
declare
  e events;
  significant boolean;
begin
  select * into e from events where id = ev;
  if e.id is null or e.requester_id <> auth.uid() or e.status not in ('pending', 'approved') then
    raise exception 'Only the requester can edit an open event';
  end if;
  significant := e.type <> new_type or e.period <> tstzrange(starts, ends, '[)') or e.all_day <> new_all_day;
  update events set type = new_type, period = tstzrange(starts, ends, '[)'), all_day = new_all_day, title = new_title,
         status = case when significant then 'pending' else status end,
         decision_deadline = case when significant then event_deadline(starts) else decision_deadline end,
         reminded_at = case when significant then null else reminded_at end
  where id = ev;
  if significant then
    delete from event_responses where event_id = ev and user_id <> auth.uid();
    perform maybe_approve_event(ev);
  end if;
end $$;

-- Run every few minutes by pg_cron (see 20261116000100_cron.sql):
-- 1. remind partners who haven't answered, shortly before silence counts as approval (US-21);
-- 2. approve requests whose deadline passed.
create or replace function public.process_event_deadlines() returns void
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  for e in select * from events where status = 'pending' and reminded_at is null
             and decision_deadline - now() < (decision_deadline - created_at) / 4
  loop
    perform notify_users(
      array(select p from unnest(active_partner_ids(e.apartment_id)) p
            where not exists (select 1 from event_responses r where r.event_id = e.id and r.user_id = p)),
      e.apartment_id, 'event_reminder', jsonb_build_object('event_id', e.id, 'deadline', e.decision_deadline));
    update events set reminded_at = now() where id = e.id;
  end loop;

  update events set status = 'approved' where status = 'pending' and decision_deadline <= now();
end $$;

-- ---------------------------------------------------------------------
-- Landlord requests
-- ---------------------------------------------------------------------

create table public.maintenance_requests (
  id           uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references public.apartments (id) on delete cascade,
  opened_by    uuid not null references auth.users (id) default auth.uid(),
  category     text not null check (category in ('plumbing', 'electricity', 'appliances', 'doors_windows', 'other')),
  urgency      text not null default 'normal' check (urgency in ('low', 'normal', 'urgent')),
  description  text not null,
  status       text not null default 'new' check (status in ('new', 'in_progress', 'handled')),
  visit_at     timestamptz,
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create index on public.maintenance_requests (apartment_id, status);

create table public.request_media (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.maintenance_requests (id) on delete cascade,
  storage_path text not null,               -- bucket "request-media"
  kind         text not null check (kind in ('image', 'video')),
  created_at   timestamptz not null default now()
);

create table public.landlord_contacts (
  id          uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null,
  trade       text,                         -- electrician, plumber, ...
  phone       text not null
);

create table public.request_messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.maintenance_requests (id) on delete cascade,
  author_id  uuid not null references auth.users (id) default auth.uid(),
  body       text not null,
  contact_id uuid references public.landlord_contacts (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.request_apartment(req uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select apartment_id from maintenance_requests where id = req
$$;

create or replace function public.landlords_of(apt uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(user_id), '{}') from memberships where apartment_id = apt and role = 'landlord'
$$;

-- US-26: the landlord updates status and visit time. "handled" is final.
create or replace function public.update_request(req uuid, new_status text, new_visit_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare r maintenance_requests;
begin
  select * into r from maintenance_requests where id = req;
  if r.id is null or not is_landlord(r.apartment_id) then raise exception 'Only the landlord can update a request'; end if;
  if r.status = 'handled' then raise exception 'A handled request is closed'; end if;
  update maintenance_requests
  set status = new_status, visit_at = coalesce(new_visit_at, visit_at),
      closed_at = case when new_status = 'handled' then now() end
  where id = req;
  perform notify_users(active_partner_ids(r.apartment_id), r.apartment_id, 'request_updated',
                       jsonb_build_object('request_id', req, 'status', new_status));
end $$;

-- US-25 / US-27: push on every new request or message to the other side.
create or replace function public.on_request_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_users(landlords_of(new.apartment_id), new.apartment_id, 'request_created',
                       jsonb_build_object('request_id', new.id, 'urgency', new.urgency));
  return new;
end $$;
create trigger request_created after insert on public.maintenance_requests
  for each row execute function public.on_request_created();

create or replace function public.on_request_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare apt uuid := request_apartment(new.request_id);
begin
  perform notify_users(case when is_landlord(apt) then active_partner_ids(apt) else landlords_of(apt) end,
                       apt, 'request_message', jsonb_build_object('request_id', new.request_id));
  return new;
end $$;
create trigger request_message after insert on public.request_messages
  for each row execute function public.on_request_message();

-- ---------------------------------------------------------------------
-- Joining and leaving
-- ---------------------------------------------------------------------

-- US-2
create or replace function public.create_apartment(name text, currency text default 'ILS', language text default 'he')
returns uuid language plpgsql security definer set search_path = public as $$
declare apt uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into apartments (name, currency, language, created_by)
  values (name, currency, language, auth.uid()) returning id into apt;
  insert into memberships (apartment_id, user_id, role) values (apt, auth.uid(), 'partner');
  return apt;
end $$;

-- US-3 / US-4: a partner code makes you a partner, a landlord code makes you the landlord.
create or replace function public.join_apartment(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a apartments;
  r text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into a from apartments where invite_code = upper(trim(code)) or landlord_invite_code = upper(trim(code));
  if a.id is null then raise exception 'Invalid code'; end if;
  r := case when a.invite_code = upper(trim(code)) then 'partner' else 'landlord' end;
  insert into memberships (apartment_id, user_id, role) values (a.id, auth.uid(), r)
  on conflict (apartment_id, user_id) do update
    set left_at = null, joined_at = now()
    where memberships.role = excluded.role;   -- can't switch between partner and landlord
  if not exists (select 1 from memberships where apartment_id = a.id and user_id = auth.uid() and role = r and left_at is null) then
    raise exception 'You are already in this apartment with a different role';
  end if;
  return a.id;
end $$;

-- US-6: only you can remove yourself. Hand over your fixed bills first.
create or replace function public.leave_apartment(apt uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_partner(apt) then raise exception 'Not a partner in this apartment'; end if;
  if exists (select 1 from fixed_bills where apartment_id = apt and responsible_id = auth.uid() and active) then
    raise exception 'Hand over your fixed bills to another partner before leaving';
  end if;
  update memberships set left_at = now() where apartment_id = apt and user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.apartments           enable row level security;
alter table public.memberships          enable row level security;
alter table public.notifications        enable row level security;
alter table public.push_tokens          enable row level security;
alter table public.shared_categories    enable row level security;
alter table public.fixed_bills          enable row level security;
alter table public.expenses             enable row level security;
alter table public.expense_shares       enable row level security;
alter table public.payments             enable row level security;
alter table public.payment_allocations  enable row level security;
alter table public.shopping_items       enable row level security;
alter table public.events               enable row level security;
alter table public.event_responses      enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.request_media        enable row level security;
alter table public.landlord_contacts    enable row level security;
alter table public.request_messages     enable row level security;

-- Profiles: yourself, and anyone you share an apartment with (partners and landlord).
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.memberships mine join public.memberships theirs using (apartment_id)
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id));
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- Apartments: any member (incl. a partner who left). Partners can rename etc.
create policy apartments_select on public.apartments for select using (was_partner(id) or is_landlord(id));
create policy apartments_update on public.apartments for update using (is_partner(id)) with check (is_partner(id));

-- Memberships: read-only from the client; changes go through the RPCs above.
create policy memberships_select on public.memberships for select
  using (user_id = auth.uid() or is_partner(apartment_id) or is_landlord(apartment_id));

create policy notifications_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_tokens_own on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Partner-only data. The landlord has no access to any of it.
create policy categories_rw on public.shared_categories for all
  using (is_partner(apartment_id)) with check (is_partner(apartment_id));
create policy fixed_bills_rw on public.fixed_bills for all
  using (is_partner(apartment_id))
  with check (is_partner(apartment_id) and responsible_id = any (active_partner_ids(apartment_id)));
create policy shopping_rw on public.shopping_items for all
  using (is_partner(apartment_id)) with check (is_partner(apartment_id));

-- Money: everyone in the apartment sees all of it (spec §3). A partner who left
-- sees only what involves them. Writes only through RPCs.
-- (security definer helpers avoid expenses <-> expense_shares policy recursion)
create or replace function public.can_see_expense(exp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from expenses e where e.id = exp and (
      is_partner(e.apartment_id) or e.payer_id = auth.uid()
      or exists (select 1 from expense_shares s where s.expense_id = exp and s.user_id = auth.uid())))
$$;
create or replace function public.can_see_all_shares(exp uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from expenses e where e.id = exp and (is_partner(e.apartment_id) or e.payer_id = auth.uid()))
$$;
create policy expenses_select on public.expenses for select using (can_see_expense(id));
create policy shares_select on public.expense_shares for select
  using (user_id = auth.uid() or can_see_all_shares(expense_id));
create policy payments_select on public.payments for select using (
  is_partner(apartment_id) or from_id = auth.uid() or to_id = auth.uid());
create policy allocations_select on public.payment_allocations for select using (
  exists (select 1 from public.payments p where p.id = payment_id));   -- inherits payments' RLS

create policy events_select on public.events for select using (is_partner(apartment_id));
create policy event_responses_select on public.event_responses for select using (
  exists (select 1 from public.events e where e.id = event_id));       -- inherits events' RLS

-- Landlord requests: partners and the landlord both see them.
create policy requests_select on public.maintenance_requests for select
  using (is_partner(apartment_id) or is_landlord(apartment_id));
create policy requests_insert on public.maintenance_requests for insert
  with check (is_partner(apartment_id) and opened_by = auth.uid() and status = 'new');
create policy media_select on public.request_media for select
  using (is_partner(request_apartment(request_id)) or is_landlord(request_apartment(request_id)));
create policy media_insert on public.request_media for insert
  with check (is_partner(request_apartment(request_id)));
create policy messages_select on public.request_messages for select
  using (is_partner(request_apartment(request_id)) or is_landlord(request_apartment(request_id)));
create policy messages_insert on public.request_messages for insert with check (
  author_id = auth.uid()
  and (is_partner(request_apartment(request_id)) or is_landlord(request_apartment(request_id)))
  and (select status from public.maintenance_requests where id = request_id) <> 'handled'
  and (contact_id is null or exists (select 1 from public.landlord_contacts c where c.id = contact_id and c.landlord_id = auth.uid())));
-- A contact shared in a request is visible to that request's partners.
create policy contacts_select on public.landlord_contacts for select using (
  landlord_id = auth.uid() or exists (
    select 1 from public.request_messages m where m.contact_id = landlord_contacts.id
      and is_partner(request_apartment(m.request_id))));
create policy contacts_write on public.landlord_contacts for all
  using (landlord_id = auth.uid()) with check (landlord_id = auth.uid());

-- Internal helpers are not part of the API.
revoke execute on function public.rewrite_shares(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.notify_users(uuid[], uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.process_event_deadlines() from public, anon, authenticated;
revoke execute on function public.maybe_approve_event(uuid) from public, anon, authenticated;
