# שותף: אפליקציה לניהול משק בית בדירת שותפים

React Native (Expo) + Supabase. כללי העבודה והתחום נמצאים ב-[CLAUDE.md](CLAUDE.md), ולוח הזמנים ב-[docs/plan.md](docs/plan.md).

## הרצה בפעם הראשונה

1. **מתקינים כלים:** Node.js 20 ומעלה במחשב, ואפליקציית **Expo Go** באייפון.
2. **פותחים פרויקט Supabase (חינם)** בכתובת supabase.com.
   - ב-SQL Editor מריצים את הקובץ `supabase/migrations/20261116000000_init.sql`.
   - מפעילים את pg_cron (Database → Extensions), ואז מריצים את `20261116000100_cron_and_storage.sql`.
   - ב-Authentication → Providers מפעילים **Phone** עם ספק SMS (למשל Twilio). לבדיקות אפשר להגדיר מספרי טלפון לבדיקה (Test OTP) בלי לשלוח SMS אמיתי.
3. **מגדירים משתני סביבה:** מעתיקים את `.env.example` לקובץ `.env`, וממלאים את ה-URL ואת ה-anon key מ-Project Settings → API.
4. **מתקינים ומריצים:**
   ```bash
   npm install
   npx expo install --fix     # aligns package versions with the Expo SDK
   npx expo start
   ```
   סורקים את קוד ה-QR עם המצלמה של האייפון, והאפליקציה נפתחת ב-Expo Go.

> אם Expo Go בטלפון מבקש גרסת SDK חדשה יותר, מריצים `npx expo install expo@latest`, ואחריו שוב `npx expo install --fix`.

## בדיקות

```bash
npm test                 # domain logic: splits, netting, payments (Jest)
npm run typecheck
```

בדיקות ההרשאות (RLS) וכללי העסק במסד הנתונים נמצאות ב-`supabase/tests/rls_and_rules_test.sql`. כדי להריץ אותן על Postgres רגיל:
```bash
psql -d test -f supabase/tests/00_plain_postgres_stub.sql
psql -d test -f supabase/migrations/20261116000000_init.sql
psql -d test -v ON_ERROR_STOP=1 -f supabase/tests/rls_and_rules_test.sql   # ends with ALL TESTS PASSED
```

## מבנה הפרויקט

```
app/                  screens (Expo Router)
  (auth)/             sign-in, verification, create/join apartment
  (partner)/[aptId]/  tabs: balance, shopping, calendar, requests, assistant
  (landlord)/         the landlord's area
src/domain/           pure, tested logic: money, split, netting, allocate
src/lib/              Supabase client, session, translations (he/en) and RTL
src/components/       shared UI
supabase/migrations/  schema, RLS, RPC functions
supabase/functions/   Edge Functions (AI, notifications)
supabase/tests/       SQL tests
docs/                 plan and AI-usage log
```

## מה כבר עובד
- התחברות עם טלפון וקוד, פתיחת דירה והצטרפות עם קוד. קוד שותף מצרף כשותף, וקוד בעל דירה מצרף כבעל הדירה.
- **מסך הבית:** המאזן בין כל זוג שותפים, השורה התחתונה (מינימום העברות) והסטטוס האישי.
- **מסד הנתונים** מוכן לכל ששת המודולים. הוא כולל את ההרשאות, את פונקציות ה-RPC (הוצאות, הצטרפות לקנייה, תשלומים, קניות, לוח שנה ופניות לבעל הדירה) ותור התראות.
- **מסך בעל הדירה:** רשימת הדירות שלו עם מספר הפניות הפתוחות בכל אחת.

השאר מתוכנן לפי השבועות ב-[docs/plan.md](docs/plan.md).
