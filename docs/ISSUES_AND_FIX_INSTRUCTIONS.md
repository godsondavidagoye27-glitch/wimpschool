# WimpSchool — Issues & Fix Instructions

Paste this whole document into your coding assistant (Claude Code, Cursor, etc.) and ask it to work through each item in order. Severity order = fix order. Do not launch to real schools/parents until everything in "CRITICAL" is done.

---

## CRITICAL — Fix before any real user touches this app

### 1. Anyone can make themselves a Super Admin (full platform takeover)

**File:** `supabase/functions/ensure-user-role/index.ts`

This edge function accepts `{ userId, role, schoolId }` from the browser and inserts it straight into `user_roles` — including `role: "super_admin"` — with zero check on who is calling it. It uses the service role key (which bypasses all database security), so any logged-in user can call this function directly and grant themselves super admin access to every school's data on the platform.

To make it worse: `login.html`'s normal login flow (`getRoleRedirect` in `js/app.js`) sends anyone with `role: "super_admin"` in `user_roles` straight to `super-admin-panel.html` — it does **not** require the `SUPER_ADMIN_SECRET` that `admin.html` checks. That secret-check page is just one of two doors in, and the other door has no lock.

**Fix:**
- In `ensure-user-role/index.ts`, require the caller's own JWT (Supabase passes this automatically) and verify the calling user's identity matches `userId` being inserted.
- Never allow the function to set `role: "super_admin"` from client input. Super admin accounts should only be created manually by you, directly in the Supabase dashboard/SQL editor — never through app code.
- Add a check: if `role === 'super_admin'` in the request body, reject it (403) unless the request includes a separate server-side-only secret that only your internal tooling has (not the browser).

### 2. Fake "successful" payments can be recorded without any money moving

**Files:** `js/payments.js`, `js/backend.js` (`recordPayment`), `supabase/functions/payments/index.ts`, `supabase/rls_policies.sql`

Right now, "was this payment successful" is decided by the **browser**, not your server:
- The Flutterwave checkout widget calls back to your own JavaScript with `response.status === 'successful'`.
- Your code trusts that response and directly inserts `status: 'paid'` into the `payments` table.
- The `payments` edge function (which should be the trusted gatekeeper) also blindly inserts whatever `status` value it's sent — it never re-checks with Flutterwave that the transaction actually happened.
- On top of that, `rls_policies.sql` lets any authenticated parent insert directly into `payments` for their own school, with any `status` value they want.

Anyone with basic browser dev tools could mark themselves as "paid" without paying a naira.

**Fix:**
- After Flutterwave's checkout callback fires, do **not** trust `response.status` client-side. Send `tx_ref` to a server-side edge function.
- That edge function must call Flutterwave's **Verify Transaction** endpoint (`GET /v3/transactions/{id}/verify`) using your **secret key** (server-side only, never exposed to the browser), and confirm the `amount`, `currency`, and `status` match what's expected.
- Only after that server-side verification succeeds should the edge function write `status: 'paid'` into the `payments` table.
- Update the RLS policy on `payments` so normal users can only ever insert rows with `status: 'pending'` — never `'paid'`. Only the service role (via the verified edge function) may set a payment to `'paid'`.

### 3. Parents' fees don't reach the school's bank account

**Files:** `js/payments.js`, `schools` table in `supabase/schema.sql`, `admin-settings.html`

All schools currently share **one** Flutterwave public key (`FLUTTERWAVE_PUBLIC_KEY` in `.env`). Every parent payment, from every school, lands in one single account — yours — with no automatic way to route funds to the actual school.

**Fix:**
- Add columns to `schools`: `flutterwave_subaccount_id`, `bank_account_number`, `bank_code`, `bank_account_name`, `platform_fee_percentage`.
- Build a school-onboarding step (in `admin-settings.html`) where a school admin submits their bank details. Send these server-side (edge function, using your Flutterwave **secret** key) to Flutterwave's `/v3/subaccounts` endpoint, and store the returned subaccount ID.
- Update the Flutterwave checkout call in `js/payments.js` to include a `subaccounts` array with that school's subaccount ID and a split ratio (e.g. school keeps 97%, platform keeps 3%). Flutterwave then automatically routes the money.
- Block fee collection for any school that hasn't completed bank onboarding (`flutterwave_subaccount_id IS NULL`) — show a clear "complete payout setup" message to the admin instead.

### 4. Two conflicting, contradictory sets of database security rules exist

**Files:** `supabase/rls_policies.sql`, `supabase/policies.sql`, `supabase/disable_rls_dev.sql`

There are three different, inconsistent security-policy files:
- `rls_policies.sql` — broad "anyone in the school can insert/update" rules, and explicitly notes "consider disabling RLS during development."
- `policies.sql` — a stricter, role-specific rule set (only `school_admin` can insert students, only `teacher` can insert attendance, etc.) — this is the correct approach.
- `disable_rls_dev.sql` — turns security **off entirely** on `user_roles`, meaning literally anyone could read or write anyone's role. If this was ever run against your live database and not reverted, it's an open door on its own.

It's unclear which of these is actually applied to your live Supabase project, which is dangerous — you may be running the weak or fully-disabled version right now without knowing it.

**Fix:**
- Delete `disable_rls_dev.sql` and `rls_policies.sql` entirely — keep only one canonical policy file.
- Rebuild it starting from the stricter logic in `policies.sql`, and fill in the gaps it's missing (it currently has no INSERT policy for `payments` restricted to the verified edge function, no policy limiting who can insert into `user_roles` at all — that should be **service role only, always**).
- Go into your actual live Supabase project → Authentication → Policies, and confirm RLS is `ENABLED` on every table, then paste in the final policy file to see exactly what's active. Don't assume — verify directly in the dashboard.

### 5. The invite-creation edge function is unauthenticated too

**File:** `supabase/functions/invite/index.ts`

This is the same class of bug as #1. It accepts `{ name, email, role, schoolId }` from anyone and creates a `parents` or `teachers` invite row for **any `schoolId` you give it** — there's no check that the caller is actually a `school_admin` of that school. Anyone could generate invite tokens tied to a school they have nothing to do with, or flood a school with fake pending invites.

**Fix:**
- Require the caller's JWT, look up their role in `user_roles` server-side, and reject the request (403) unless they are a `school_admin` (or `super_admin`) of the `schoolId` in the payload.
- Apply the same pattern to `supabase/functions/notifications/index.ts` — it currently has no auth check either, and it can trigger real SendGrid emails / Twilio SMS on your dime for anyone who calls it directly.

---

## PARENT & TEACHER INVITE FLOW — full rework

This is its own section because the invite system currently has three separate problems stacked on top of each other, beyond the security issue above (#5).

### 6. Invite links are never actually emailed to anyone

**Files:** `js/backend.js` (`inviteParent`, `inviteTeacher`), `js/app.js` (line ~704)

When a school admin invites a parent or teacher, `inviteParent`/`inviteTeacher` creates the invite row and token, then calls `sendSchoolNotification()` — which only writes a row into the in-app `notifications` table. It never calls the `notifications` edge function with `channel: 'email'`, so no actual email goes out.

Right now the admin just sees a raw status message on screen like *"Teacher invited: name@email.com. Invite token: abc123..."* — meaning **you're expecting the school admin to manually copy a token and send the invite link themselves** (by WhatsApp, by hand, however). That's not a real invite flow; it's a token generator.

**Fix:**
- After successfully creating the invite row, call the `notifications` edge function (once it's fixed per #5) with `channel: 'email'`, `recipient: payload.email`, and a message containing the full invite link: `https://yourdomain.com/invite.html?token=<token>`.
- Add a "Resend invite" button in `teacher-management.html` / `student-management.html` for admins, in case the email bounces or the parent loses it — don't make them regenerate a whole new invite.
- Show the admin a clear success/failure state for the email send itself (SendGrid can fail silently right now — `notifications/index.ts` just returns `ok:false` with a reason, but nothing in the UI surfaces that).

### 7. Invite tokens never expire

**Files:** `js/auth.js` (`verifyInviteToken`), `supabase/schema.sql`

`invite_token` on `parents` and `teachers` has no expiry. A link generated a year ago, forwarded, or accidentally leaked will activate an account forever, with no way to invalidate it short of manually clearing the token in the database.

**Fix:**
- Add an `invite_expires_at` column to both `parents` and `teachers` (e.g. 7 days from creation).
- In `verifyInviteToken`, reject the token with a clear "This invite link has expired, please ask your school to resend it" message if `now() > invite_expires_at`.
- Give admins a way to manually revoke/regenerate a specific pending invite from the management pages.

### 8. Two different, inconsistent code paths create invites

**Files:** `js/backend.js` (`inviteParent`/`inviteTeacher`) vs. `supabase/functions/invite/index.ts`

Your app currently has two separate ways an invite can be created: the client-side functions in `backend.js` (which do link `parent_student_links` correctly and fire an in-app notification) and the `invite` edge function (which does neither — it only inserts the bare row and hands back a token). If both paths ever get called from different pages, you'll end up with parent accounts that are missing their student link, or teachers with no linked notification trail — inconsistent data depending on which button the admin happened to click.

**Fix:**
- Pick one path — the `backend.js` version is more complete, so extend it (add the email-sending step from #6 and the auth check pattern from #5's fix, applied server-side) and delete `supabase/functions/invite/index.ts` entirely, or make `backend.js` call that same edge function exclusively so there's only one source of truth.

---

## REAL-TIME DATA — make the app update live, not just on refresh

### 9. Almost nothing in the app is real-time right now

**Files:** `js/dashboard.js`, `js/app.js`, `school-admin-dashboard.html`, `teacher-dashboard.html`, `super-admin-panel.html`, `announcements.html`

Right now the app is almost entirely "load once, sit still." Every dashboard fetch in `js/dashboard.js` is a one-time Supabase query — if a teacher submits attendance while an admin is looking at the dashboard, the admin sees nothing new until they manually reload the page. Announcements, notifications, attendance, and results all work this way. There is exactly **one** exception: the parent portal has a partial real-time subscription for payments (`js/app.js`, the `parent-payments-` channel), plus a polling timer as a fallback — but it's scoped too broadly (it listens for *any* payment insert across the whole school, not just this parent's own payments, so it triggers unnecessary refetches) and nothing else in the app has anything like it.

**Fix — add Supabase Realtime subscriptions to:**
- **`school-admin-dashboard.html` / `dashboard.js`** — subscribe to `INSERT`/`UPDATE` on `payments`, `attendance`, `results`, and `announcements` filtered by `school_id`, so the admin's metrics and recent-activity widgets update live without a refresh.
- **`teacher-dashboard.html`** — subscribe to changes on `results` and `attendance` scoped to that teacher, so submitted results/attendance reflect instantly if edited elsewhere.
- **Notifications generally** — anywhere the app shows a notification bell/count, subscribe to `INSERT` on `notifications` filtered by `user_id` or `school_id`, instead of only loading it once per page visit.
- **`announcements.html`** and any page displaying announcements — subscribe so a newly published announcement appears for logged-in users without a refresh.
- **Fix the existing parent-portal payment subscription** to filter on `parent_id`/`student_id` rather than the whole school, so it only reacts to payments that are actually relevant to that parent.

Use the same pattern already working in `app.js` as the template:
```js
const channel = client.channel('some-unique-name');
channel.on('postgres_changes', {
  event: '*', // or 'INSERT' / 'UPDATE'
  schema: 'public',
  table: 'the_table',
  filter: `school_id=eq.${schoolId}`
}, () => {
  // re-fetch or patch local state
});
channel.subscribe();
```
Remember to `client.removeChannel(channel)` (or unsubscribe) when navigating away from a page, so you don't leak open connections as users move around the app.

---

## HIGH PRIORITY — Fix before scaling past a handful of pilot schools

### 10. Registration (`signUpSchoolAdmin`) inserts roles directly from the browser

**File:** `js/auth.js` (`signUpSchoolAdmin`, `acceptInvite`)

These functions call `client.from('user_roles').insert(...)` directly from browser code (not through the edge function). This only works at all if RLS on `user_roles` is either disabled or has a permissive insert policy — which, per issue #4, is inconsistent and unsafe. Once you lock down `user_roles` to service-role-only inserts (as issues #1 and #4 require), this registration code will silently break.

**Fix:**
- Route **all** `user_roles` inserts (school admin signup, invite acceptance) through the `ensure-user-role` edge function exclusively — after fixing that function per issue #1 — never insert directly from the browser client.

### 11. Session timeout is enforced only in the browser, not the server

**File:** `js/app.js`

Sessions are stored in `localStorage`/`sessionStorage` with a 30-minute expiry checked client-side (`loadSession`). This only logs the user out of the *website UI* — the underlying Supabase auth session and any admin actions remain valid until Supabase's own token expiry, independent of this 30-minute check. A user could bypass the UI timeout entirely by calling the Supabase client directly.

**Fix:**
- Set the actual Supabase session/token expiry (JWT `exp`) to match your intended timeout via Supabase Auth settings, rather than only tracking it in local storage.

### 12. No real bank-detail or payout verification before schools start receiving funds

Once subaccounts (issue #3) exist, you still need a way to confirm a school's bank account is real and belongs to them before money starts flowing — otherwise a malicious "school admin" signup could redirect a legitimate school's fees to their own bank account.

**Fix:**
- Require a manual verification step (you personally confirm bank details, or use Flutterwave's account resolve/verify-name API) before a subaccount goes live, at least while you're small.

---

## MEDIUM PRIORITY — Cleanup and reliability

### 13. `payments` edge function duplicates `recordPayment` in `backend.js` with different logic
Two separate code paths write to the `payments` table (one via edge function, one via direct client insert) with slightly different fields and no shared validation. Consolidate into one path — the fixed, server-verified edge function from issue #2 — and delete the direct-insert path from `backend.js`.

### 14. `.env` holds sensitive keys alongside a `.env.example` fallback that can silently activate
`scripts/generate-config.js` falls back to `.env.example` if `.env` is missing. If this ever runs in a real deployment without `.env` present, it could silently generate a broken/placeholder config rather than failing loudly. Make it fail hard (non-zero exit, clear error) if `.env` is missing in a production build.

### 15. Service worker caches `js/config.js`
This means changing Supabase/Flutterwave keys later requires a cache-busting strategy or users will keep using stale config after you rotate credentials. Add a versioned filename or cache-invalidation step to your deploy process.

---

## Suggested order of work

1. Lock down `ensure-user-role` (#1), `invite` (#5), and `notifications` (#5) edge functions, plus `user_roles` RLS (#4) — these are all the same underlying "open door" pattern and should be fixed as one pass.
2. Fix payment verification (#2) before touching payment splitting — don't build payouts on top of unverified "paid" statuses.
3. Add Flutterwave subaccounts / payment splitting (#3).
4. Rebuild the invite flow end-to-end (#6, #7, #8) — actually send the email, expire tokens, collapse the two code paths into one.
5. Route all role inserts through the fixed edge function (#10).
6. Add real-time subscriptions (#9) once the data layer underneath it is trustworthy — no point live-streaming data through a still-open security hole.
7. Everything else (#11–#15) as time allows before scaling up.