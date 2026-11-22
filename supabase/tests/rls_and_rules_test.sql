-- Permission and business-rule tests. Run after the init migration:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_and_rules_test.sql
-- Each block raises an exception on failure. Everything is rolled back at the end.
begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.rewrite_shares(uuid, uuid[]), public.notify_users(uuid[], uuid, text, jsonb),
  public.process_event_deadlines(), public.maybe_approve_event(uuid) from authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- A, partner
  ('00000000-0000-0000-0000-00000000000b'),  -- B, partner
  ('00000000-0000-0000-0000-00000000000c'),  -- C, partner
  ('00000000-0000-0000-0000-00000000000d'),  -- D, partner in another apartment
  ('00000000-0000-0000-0000-00000000000e');  -- L, landlord

create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

create or replace function pg_temp.as_user(letter text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000' || letter, true),
         set_config('role', 'authenticated', true)
$$;
create or replace function pg_temp.u(letter text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-00000000000' || letter)::uuid
$$;

-- A creates the apartment; B, C and the landlord join; D has their own apartment.
select pg_temp.as_user('a');
insert into ctx values ('apt', create_apartment('הדירה ברחביה'));
reset role;
select invite_code as code, lower(landlord_invite_code) as lcode from apartments \gset
select pg_temp.as_user('b'); select join_apartment(:'code'); reset role;
select pg_temp.as_user('c'); select join_apartment(:'code'); reset role;
select pg_temp.as_user('e'); select join_apartment(:'lcode'); reset role;
select pg_temp.as_user('d'); insert into ctx values ('apt2', create_apartment('דירה אחרת')); reset role;

do $$ begin
  assert (select count(*) from memberships where apartment_id = (select v from ctx where k = 'apt') and role = 'partner') = 3,
    'three partners';
  assert (select role from memberships where user_id = pg_temp.u('e')) = 'landlord', 'landlord joined with landlord code';
end $$;

-- The spec example: pizza ₪150 (A), groceries ₪200 (B), plumber ₪350 (C), all shared.
select pg_temp.as_user('a'); select add_expense((select v from ctx where k = 'apt'), 'פיצה', 15000, 'spontaneous', 'all'); reset role;
select pg_temp.as_user('b'); select add_expense((select v from ctx where k = 'apt'), 'קנייה בסופר', 20000, 'purchase', 'all'); reset role;
select pg_temp.as_user('c'); select add_expense((select v from ctx where k = 'apt'), 'אינסטלטור', 35000, 'spontaneous', 'all'); reset role;

-- Same numbers as src/domain/__tests__/netting.test.ts.
select pg_temp.as_user('a');
do $$ begin
  assert (select amount_minor from pair_balances where debtor = pg_temp.u('a') and creditor = pg_temp.u('b')) = 1667, 'A owes B 16.67';
  assert (select amount_minor from pair_balances where debtor = pg_temp.u('a') and creditor = pg_temp.u('c')) = 6667, 'A owes C 66.67';
  assert (select amount_minor from pair_balances where debtor = pg_temp.u('b') and creditor = pg_temp.u('c')) = 5001, 'B owes C 50.01';
  assert (select count(*) from pair_balances) = 3, 'three pairs';
end $$;
reset role;

-- Partial payment on the overall balance goes to the oldest debt first.
select pg_temp.as_user('a'); select record_payment((select v from ctx where k = 'apt'), pg_temp.u('c'), 6000); reset role;
do $$ begin
  assert (select a.amount_minor from payment_allocations a join expense_shares s on s.id = a.share_id
          join expenses e on e.id = s.expense_id where e.description = 'אינסטלטור') = 6000, 'allocated to the plumber debt';
end $$;
select pg_temp.as_user('a');
do $$ begin
  assert (select amount_minor from pair_balances where debtor = pg_temp.u('a') and creditor = pg_temp.u('c')) = 667, 'A now owes C 6.67';
end $$;
reset role;

-- Opt-in purchase: buyer only, then B joins (split recalculated, A gets notified), then B leaves.
select pg_temp.as_user('a'); insert into ctx values ('snack', add_expense((select v from ctx where k = 'apt'), 'חטיפים', 3000, 'purchase', 'opt_in')); reset role;
select pg_temp.as_user('b'); select set_expense_participation((select v from ctx where k = 'snack'), true); reset role;
do $$ begin
  assert (select array_agg(share_minor order by user_id) from expense_shares where expense_id = (select v from ctx where k = 'snack')) = '{1500,1500}', 'split after join';
  assert exists (select 1 from notifications where user_id = pg_temp.u('a') and kind = 'expense_split_changed'), 'buyer notified';
end $$;
select pg_temp.as_user('b'); select set_expense_participation((select v from ctx where k = 'snack'), false); reset role;
do $$ begin
  assert (select array_agg(share_minor) from expense_shares where expense_id = (select v from ctx where k = 'snack')) = '{3000}', 'split after leave';
end $$;

-- RLS: the landlord sees no money, no shopping and no calendar.
select pg_temp.as_user('e');
do $$ begin
  assert (select count(*) from expenses) = 0, 'landlord sees no expenses';
  assert (select count(*) from expense_shares) = 0, 'landlord sees no shares';
  assert (select count(*) from payments) = 0, 'landlord sees no payments';
  assert (select count(*) from pair_balances) = 0, 'landlord sees no balances';
  assert (select count(*) from apartments) = 1, 'landlord sees their apartment';
end $$;
reset role;

-- RLS: a partner of another apartment sees nothing of this one.
select pg_temp.as_user('d');
do $$ begin
  assert (select count(*) from expenses) = 0, 'D sees no expenses of apt 1';
  assert (select count(*) from apartments) = 1, 'D sees only their own apartment';
  assert (select count(*) from memberships where apartment_id <> (select v from ctx where k = 'apt2')) = 0, 'D sees no foreign memberships';
end $$;
do $$ begin
  perform add_expense((select v from ctx where k = 'apt'), 'hack', 100, 'spontaneous', 'all');
  raise exception 'D should not add expenses';
exception when raise_exception then
  if sqlerrm = 'D should not add expenses' then raise; end if;
end $$;
reset role;

-- RLS: clients can't write money tables directly.
select pg_temp.as_user('a');
do $$ begin
  begin
    insert into payments (apartment_id, from_id, to_id, amount_minor)
    values ((select v from ctx where k = 'apt'), pg_temp.u('b'), pg_temp.u('a'), 999999);
    raise exception 'direct insert should fail';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Landlord requests: partner opens, landlord gets notified and answers, "handled" is final.
select pg_temp.as_user('b');
insert into maintenance_requests (apartment_id, category, urgency, description)
values ((select v from ctx where k = 'apt'), 'plumbing', 'urgent', 'הכיור דולף');
reset role;
do $$ begin
  assert exists (select 1 from notifications where user_id = pg_temp.u('e') and kind = 'request_created'), 'landlord notified';
end $$;
select pg_temp.as_user('e');
select update_request((select id from maintenance_requests), 'in_progress', now() + interval '1 day');
insert into request_messages (request_id, body) values ((select id from maintenance_requests), 'אינסטלטור יגיע מחר');
select update_request((select id from maintenance_requests), 'handled');
do $$ begin
  begin
    perform update_request((select id from maintenance_requests), 'in_progress');
    raise exception 'reopen should fail';
  exception when raise_exception then
    if sqlerrm = 'reopen should fail' then raise; end if;
  end;
end $$;
reset role;
select pg_temp.as_user('a');
do $$ begin
  assert (select status from maintenance_requests) = 'handled', 'partner sees status';
  assert (select count(*) from request_messages) = 1, 'partner sees landlord reply';
end $$;
reset role;

-- Calendar: overlap blocked, rejection needs a reason, all approvals → approved.
select pg_temp.as_user('a');
insert into ctx values ('ev', request_event((select v from ctx where k = 'apt'), 'party',
  now() + interval '3 days', now() + interval '3 days 4 hours'));
reset role;
select pg_temp.as_user('b');
do $$ begin
  begin
    perform request_event((select v from ctx where k = 'apt'), 'guests', now() + interval '3 days 1 hour', now() + interval '3 days 2 hours');
    raise exception 'overlap should fail';
  exception when exclusion_violation then null;
  end;
  begin
    perform respond_event((select v from ctx where k = 'ev'), 'reject');
    raise exception 'reject without reason should fail';
  exception when check_violation then null;
  end;
end $$;
select respond_event((select v from ctx where k = 'ev'), 'approve');
reset role;
select pg_temp.as_user('c'); select respond_event((select v from ctx where k = 'ev'), 'approve'); reset role;
do $$ begin
  assert (select status from events where id = (select v from ctx where k = 'ev')) = 'approved', 'approved by all';
end $$;

-- Silence counts as approval once the deadline passes.
select pg_temp.as_user('b');
insert into ctx values ('ev2', request_event((select v from ctx where k = 'apt'), 'guests',
  now() + interval '5 days', now() + interval '5 days 2 hours'));
reset role;
update events set decision_deadline = now() - interval '1 minute' where id = (select v from ctx where k = 'ev2');
select process_event_deadlines();
do $$ begin
  assert (select status from events where id = (select v from ctx where k = 'ev2')) = 'approved', 'silence = approval';
end $$;

-- Leaving: blocked while responsible for a fixed bill; afterwards you still see your own debts.
select pg_temp.as_user('b');
insert into fixed_bills (apartment_id, name, responsible_id, reminder_day)
values ((select v from ctx where k = 'apt'), 'חשמל', pg_temp.u('b'), 10);
do $$ begin
  begin
    perform leave_apartment((select v from ctx where k = 'apt'));
    raise exception 'leaving with a bill should fail';
  exception when raise_exception then
    if sqlerrm = 'leaving with a bill should fail' then raise; end if;
  end;
end $$;
update fixed_bills set responsible_id = pg_temp.u('a');
select leave_apartment((select v from ctx where k = 'apt'));
do $$ begin
  assert (select count(*) from expenses) = 3, 'B still sees the 3 expenses they share in';
  assert (select count(*) from shopping_items) = 0 and (select count(*) from events) = 0, 'B no longer sees apartment data';
end $$;
select record_payment((select v from ctx where k = 'apt'), pg_temp.u('c'), 5001);
reset role;

select 'ALL TESTS PASSED' as result;
rollback;
