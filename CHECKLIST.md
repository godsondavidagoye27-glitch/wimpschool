# WimpSchool Implementation Checklist

## Brand and theme
- [x] Clean professional theme
- [x] White background
- [x] Red accent #e63a2e
- [x] Navy blue #1a1f5e secondary
- [x] Font family: Inter / Poppins throughout

## Tech stack
- [x] HTML, CSS, Vanilla JavaScript
- [x] Supabase auth + database placeholders implemented
- [x] Flutterwave payment placeholder implemented
- [x] Backend workflow helpers implemented in `js/backend.js`
- [x] Supabase schema and RLS policy files added
- [x] Edge function stubs added for invites, attendance, payments, notifications, and bulk imports

## PWA Requirements
- [x] `manifest.webmanifest` with app name, icons, theme color
- [x] `service-worker.js` for offline access and caching
- [x] Add to Home Screen prompt support
- [x] `twa-manifest.json` for Bubblewrap/TWA compatibility
- [x] `capacitor.config.json` for Capacitor app packaging

## User roles
- [x] Super Admin
- [x] School Admin
- [x] Teacher
- [x] Parent

## Login system
- [x] Main login page at `login.html`
- [x] Auto-redirect based on detected role (client-side placeholder)
- [x] Separate super admin login at `admin.html`
- [x] Actual secure role detection using Supabase role data

## Registration flow
- [x] School admin registration page
- [x] Student management page
- [x] Bulk student import placeholder page
- [x] Invite-based parent/teacher registration page

## Pages built
- [x] Landing page
- [x] School registration page
- [x] Login page
- [x] Invite page
- [x] Forgot password page
- [x] Super admin login page
- [x] School admin dashboard
- [x] Student management page
- [x] Teacher management page
- [x] Teacher dashboard
- [x] Attendance tracking page
- [x] Fee management page
- [x] Results page
- [x] Parent portal page
- [x] Timetable manager page
- [x] Announcements page
- [x] Admin settings page
- [x] Super admin panel page

## Supabase tables (design only)
- [x] `schools`
- [x] `students`
- [x] `teachers`
- [x] `parents`
- [x] `attendance`
- [x] `fees`
- [x] `fee_payments`
- [x] `debt_warnings`
- [x] `results`
- [x] `announcements`
- [x] `timetable`
- [x] `user_roles`

## Supabase Edge functions (design only)
- [x] `send-parent-invite`
- [x] `send-teacher-invite`
- [x] `bulk-import-students`
- [x] `send-debt-warning`
- [x] `generate-report-card`
- [x] `auto-fee-reminder`
- [x] `notify-absence`
- [x] `verify-school-email`

## Additional work
- [x] Remove sign in with Google/Facebook option from login UI
- [x] Create `.env.example` and `.env`
- [x] Add `CHECKLIST.md` for tracking implementation status

## Notes
- The project is a full front-end scaffold with Supabase and Flutterwave integration points.
- Actual secure backend enforcement must be implemented on the Supabase side.
