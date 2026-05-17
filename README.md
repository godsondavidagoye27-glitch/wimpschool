# WimpSchool

A clean school management platform scaffold built with HTML, CSS, Vanilla JavaScript, Supabase placeholders, and Flutterwave payment integration points.

## Included pages

- `index.html` — public landing page
- `register.html` — school registration page
- `login.html` — unified login page
- `invite.html` — invite-based parent/teacher activation
- `forgot-password.html` — password reset page
- `admin.html` — private super admin login
- `school-admin-dashboard.html` — school admin dashboard placeholder
- `teacher-dashboard.html` — teacher dashboard placeholder
- `parent-portal.html` — parent portal placeholder
- `student-management.html` — student management placeholder
- `teacher-management.html` — teacher management placeholder
- `attendance.html` — attendance tracking placeholder
- `fee-management.html` — fee management placeholder
- `results.html` — results and report card placeholder
- `announcements.html` — school announcements placeholder
- `admin-settings.html` — admin settings placeholder
- `super-admin-panel.html` — super admin platform dashboard placeholder
- `offline.html` — offline fallback page

## PWA support

- `manifest.webmanifest`
- `service-worker.js`
- `twa-manifest.json` for Bubblewrap/TWA compatibility
- `capacitor.config.json` for Capacitor app packaging

## Backend support
- `supabase/schema.sql` defines the production tables and relationships
- `supabase/policies.sql` provides Supabase RLS policies for secure row-level access
- `supabase/functions/` includes backend function stubs for invites, attendance, payments, notifications, and bulk imports
- `js/backend.js` implements student, teacher, parent, attendance, results, payment, and announcement workflows

## Setup

1. Install dependencies.

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your Supabase and Flutterwave values.
3. Generate the browser config file from `.env` before running the static site. This is a hard requirement; the generator now fails if required values are missing.

```bash
# from repository root
node scripts/generate-config.js
```

This creates `js/config.js` from `.env`. `js/config.js` is ignored by git to keep secrets out of source control.

> If `node scripts/generate-config.js` reports missing values, fill in the required keys and retry before starting the app.

4. Deploy the Supabase Edge Function for super admin secret validation and add `SUPER_ADMIN_SECRET` to your Supabase project environment variables.

```bash
supabase functions deploy super-admin-login
```

5. Start the local site:

```bash
npm start
```

5. Supabase auth/database logic is implemented in `js/auth.js` and session-backed role enforcement is active in `js/app.js`.
6. Flutterwave inline checkout integration is now wired in `js/payments.js`.
7. Dashboard pages now include live data hooks for school admin, teacher, and parent views.

## Notes

- The current project is a front-end scaffold with Supabase role-based authentication and page enforcement.
- Google/Facebook social login options have been removed from the login UI.
- Real security and backend enforcement require Supabase RLS policies and server-side validation.
