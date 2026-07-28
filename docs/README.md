# Supabase Backend Setup for WimpSchool

This folder contains the Supabase schema, RLS policy definitions, and edge function stubs for the WimpSchool platform.

## Schema
- `schema.sql` defines core tables for schools, roles, students, teachers, parents, attendance, results, payments, announcements, and notifications.

## RLS policies
- `policies.sql` enables row-level security and provides strict access control for school admins, teachers, and parents.
- Use these policies in Supabase to enforce backend authorization for all table interactions.

## Edge functions
The edge functions below are designed for server-side workflows requiring service role access:
- `invite.js` — create and store parent/teacher invites
- `attendance.js` — record and query attendance records
- `payments.js` — record and reconcile payment transactions
- `notifications.js` — create school and user notifications
- `bulk-import.js` — insert bulk student records from a structured import payload

## Deployment
1. Create a Supabase project.
2. Run `schema.sql` in the SQL editor to create tables.
3. Run `policies.sql` to enable RLS and policies.
4. Set project environment variables for edge functions:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Deploy edge functions from the `supabase/functions` folder following Supabase docs.

## Notes
- The frontend uses `js/backend.js` for data workflows, while backend enforcement happens through the Supabase policies here.
- For production, every request should be validated in a server-side function or via Supabase security rules.
