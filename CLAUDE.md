# שותף (Shutaf): an app for managing a shared apartment

A mobile app for roommates to manage their shared household: shared expenses and fixed bills, a shared shopping list, an event calendar, maintenance requests to the landlord, and an AI assistant.
Source of truth: the spec and user stories (`אפיון`, US-1 to US-33). When this file and the spec disagree, ask before deciding.

## Project context
- Final project for a development course, built by a team of three.
- **Final delivery: 2026-12-30.** Keep the scope realistic for that date.
- First target users: the team members and their roommates. Later: other roommates (students, young people), and later still, landlords who own several apartments.
- The course requires documenting how AI tools were used during development. Keep a short log in `docs/ai-usage.md` (what was asked, what was used, and what was changed by hand).

## Tech stack
- **App:** React Native with Expo (managed workflow) and TypeScript. Expo Router for navigation.
- **Backend:** Supabase: Postgres, Auth, Storage (request photos and videos), Realtime and Edge Functions.
- **Push notifications:** Expo Notifications.
- **AI:** Claude API. It is called only from Supabase Edge Functions, so API keys never reach the client.
- **Platforms:** iOS and Android only, with no web version. That applies to the landlord too.
- **Testing:** the team has only iPhones. Test iOS on the team's devices with Expo Go or dev builds, and Android on an emulator or a friend's phone.

## Scope
Mandatory for the 30.12 delivery:
1. **Bills** (ניהול חשבונות): shared expenses, fixed bills, the balance and payments
2. **Shopping** (קניות): the shared list, linked to expenses
3. **Calendar** (לוח שנה): booking events in the apartment
4. **Landlord requests** (פניות לבעל הדירה)
5. **AI chat assistant** (עוזר שיחה)
6. **AI for shopping**: classifying items and suggesting what is missing

Optional, only if there is time: **the cleaning rota** (לוח תורנויות), including the AI first split.

Out of scope for this version: real payments through the app (Bit, PayBox), receipt upload or scanning, and a web version.

## Roles and permissions
- **Partner (שותף):** all partners have equal rights. The partner who opened the apartment has no special permissions.
- **Landlord (בעל הדירה):** a separate, limited entry point. The landlord sees only requests and messages with the partners, and has **no access** to the calendar, expenses, debts or the shopping list. Partners invite the landlord, not the other way round.
- **Full visibility between partners:** every partner sees all apartment data, including debts between other partners.
- A user can belong to more than one apartment. A landlord can manage several apartments.
- Enforce all of this with Supabase **Row Level Security**, not only in the UI.

## Domain rules

### Registration and apartments
- Sign in with Google or with a phone number and a verification code. The plan is WhatsApp first and SMS as a fallback. The final choice is still open (see Open decisions).
- One partner creates a virtual apartment and shares a short invite code. A partner who joins later sees the full history, including earlier debts and events.
- Each apartment chooses its own currency and language (Hebrew or English). The layout must support both RTL and LTR.

### Leaving an apartment
- Only the partner who leaves can remove themselves. No one can remove another partner.
- Open debts stay. The partner who left can still see their own debts and mark them as paid.
- Before leaving, the partner must hand each fixed bill they are responsible for to another partner.
- A partner who leaves is removed from the cleaning rota automatically. A partner who is only away for a while is handled manually.
- Deleting the account removes the user's personal data. What happens to their debts and apartment data is still open (US-7).

### Fixed bills
- Split equally between all partners.
- Each bill has one responsible partner who pays the supplier. The others owe that partner their share. Any partner can change who is responsible.
- The responsible partner enters the amount by hand each month.
- Only the responsible partner gets a reminder, on a date they choose. The others just see the debt in the balance.

### Shared expenses and purchases
- Anyone can add an expense (for example, a food order) and choose whether to split it equally between everyone or between 2–3 selected partners.
- The buyer marks each purchase as **shared by everyone** or **open to join**. An item never belongs to both types: a mixed purchase is recorded as two separate purchases.
- The apartment defines categories in advance (for example, toilet paper) that are always shared by everyone.
- **Default:** a partner is not part of a purchase until they join it, except for shared categories.
- A partner can join or leave a purchase at any time. The split is then recalculated, and everyone affected gets a notification.

### Payments and the balance
- Marking a payment as "paid" closes the debt immediately. The receiver does not confirm it and there is no way to dispute it. This is on purpose: the app assumes the partners trust each other.
- Partial payment is allowed, either on a specific debt or on the overall balance. A payment on the overall balance goes to the **oldest debt first**.
- **Netting:** compute net balances and show a bottom line that keeps the number of transfers to a minimum.
- **Home screen:** at the top, the net balance between each pair of partners. Below it, a detailed list of purchases and bills. At the bottom, a quick personal status ("you owe ₪50" or "people owe you ₪30") and a quick-action button (FAB) to add an expense or a shopping item.
- Store money as integers in the smallest unit (agorot or cents), never as floats. Split remainders deterministically.

### Shopping list
- One shared list. Every partner can add items and everyone sees it.
- The buyer checks off the items they bought and enters a total. The purchase is then recorded automatically as an expense, using the rules above.

### Calendar
- Event types: guests at a specific time, a party, Shabbat or a large event.
- A request must include a date and a type. It can cover a whole day or a range of hours.
- **All** partners must approve. A partner who stays silent is counted as agreeing. How long to wait depends on how far away the event is (the exact limits are still open).
- A rejection must include a reason, and the request is cancelled.
- Two events cannot overlap. A pending request already blocks its time slot.
- The requester can cancel an approved event at any time, which frees the slot. A significant edit (date, hours or type) needs approval again; a small edit does not.
- An approval is final and cannot be taken back.
- **Notifications:** none when a request is created. Only a reminder about a pending request, sent before silence turns into agreement.
- Optional: sync events to the phone's own calendar.

### Landlord requests
- Any partner can open a request, without approval from the other partners. It is sent to the landlord immediately.
- A request includes a free-text description, photos or a video, a category (plumbing, electricity, appliances, doors and windows, other) and an urgency level.
- The landlord sets the status (new, in progress, handled), replies in writing inside the request, sets a visit time and shares a supplier or contractor with their contact details.
- When the landlord marks a request as "handled", it closes. The partners do not confirm it and it cannot be reopened.
- Requests have no costs and are not linked to the bills module.
- The landlord gets a push notification for every new request or reply. The partners see the status, the replies and the visit time.
- The landlord's dashboard lists all their apartments with the status of each one's requests. The landlord also keeps a list of their tradespeople's phone numbers.

### AI assistant
- Answers questions about the apartment ("How much do I owe Dana?", "What is my job this week?", "When is the next event?") and acts on the user's behalf (adding a shopping item, opening a request).
- **Financial actions, such as marking a payment, require the user's explicit confirmation.** Other actions run immediately.
- The assistant sees all apartment data, including debts between other partners.
- It only answers when someone talks to it. It never makes suggestions or sends notifications on its own.
- Implement each action as a tool, and run it through the same server-side logic and permission checks as the UI.

### AI for shopping
- Suggests whether each item is shared or open to join, based on the apartment's categories. The buyer confirms or changes it before it is saved.
- Suggests missing items based on the apartment's purchase history. The suggestions appear in a separate section of the list, and one tap adds an item.

### Cleaning rota (optional)
- The partners define the tasks, how to split them and how often each one happens. The rota rotates automatically every week.
- Each partner sees their job for the week on the board. Tasks are not marked as done, and there are no notifications.
- Any partner can edit the board without approval.
- The AI can suggest a first split, including a difficulty rating for each task. The partners approve or change it, and the explanation is shown only when asked for.

## Design principles
- Fast and simple, with as few steps per action as possible, so people actually use it.
- A clear visual difference between the partners' area (social, light, dynamic) and the landlord's area (business-like, clean, functional).
- Hebrew first, with full RTL support. Never hard-code a text direction.
- Every visible text comes from translation files (`he`, `en`). No hard-coded strings in components.

## Open decisions
Don't make these decisions silently. Ask, or leave a marked TODO:
- The sign-in method: Google, WhatsApp, SMS, or a combination. Sending verification codes costs money, mostly at scale and for users abroad, so check current prices.
- How long silence takes to count as agreement in the calendar, depending on how far away the event is.
- A complete notification policy.
- Privacy: what data is stored, the terms of use, and what happens to debts and data when an account is deleted (US-7).
- What the landlord's dashboard looks like with many apartments and requests.
- How AI use during development is documented for the course.

## Where things live
- `app/`: screens (Expo Router). `(auth)` handles sign-in and joining, `(partner)/[aptId]` holds the partner tabs, and `(landlord)` is the landlord's area.
- `src/domain/`: pure money logic, with Jest tests in `__tests__`. `splitEvenly` (remainder to the first participants, sorted by id) and `allocatePayment` (oldest debt first) are mirrored in SQL by `rewrite_shares()` and `record_payment()`. Change both together.
- `supabase/migrations/`: the schema, RLS and RPCs. Money and approvals are written only through security-definer RPCs; clients have no direct insert on `expenses` or `payments`.
- `public.notifications` is an outbox. RPCs and triggers write to it, and the `notify` Edge Function sends the push.
- `supabase/tests/rls_and_rules_test.sql`: permission and rule tests. Extend them whenever a policy or RPC changes.
- `docs/plan.md`: the weekly schedule and the open decisions.

## Commands
- `npm test` runs the domain tests, and `npm run typecheck` checks the types.
- `npx expo start` runs the app on a device through Expo Go.
- SQL tests on a plain Postgres: run `supabase/tests/00_plain_postgres_stub.sql`, then the init migration, then `rls_and_rules_test.sql`. The last one must end with `ALL TESTS PASSED`.

## Working conventions
- Talk to the user in Hebrew. Code, identifiers and commit messages are in English.
- Keep business logic (splits, netting, payment allocation, overlap checks) in pure, unit-tested functions or in Postgres functions. Don't put it inside UI components.
- Every database schema change goes in a Supabase migration file.
- Secrets (the Supabase service key and the Claude API key) never go into the app or into git.
- Link changes to user stories by number (for example, `US-14`) in commit messages and PRs.
