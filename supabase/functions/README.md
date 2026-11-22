# Edge Functions (planned)

All AI calls go through these functions so the Claude API key stays in Supabase secrets:
`supabase secrets set ANTHROPIC_API_KEY=...`

| Function | Week | What it does |
|---|---|---|
| `ai-shopping` | 3 | `classify`: shared or open to join for an item, using the apartment's `shared_categories` (US-17). `suggest`: missing items from `shopping_items` history (US-18). |
| `ai-chat` | 5 | The chat assistant (US-28 – US-30). Uses Claude tool use. Each tool calls the same RPC as the UI with the **user's JWT**, so RLS applies. Financial tools (`record_payment`) are not executed; they return `{needsConfirmation: true, action}` and the app shows an approve button. Never proactive. |
| `notify` | 5 | Reads unsent rows from `public.notifications`, sends them through the Expo Push API to `push_tokens`, sets `sent_at`. Triggered by a database webhook on insert. |

Create one with `supabase functions new <name>`.
