# WimpSchool Supabase Setup Guide

## Current Issue: 406 Error on user_roles Query

When you try to log in, you're seeing this error:
```
Failed to load resource: the server responded with a status of 406 ()
```

This is a **Row Level Security (RLS)** permissions issue.

## Quick Fix (Development)

To get the app working immediately:

### Step 1: Go to Supabase Dashboard
1. Open https://app.supabase.com
2. Select your **WimpSchool** project
3. Go to **SQL Editor** (left sidebar)

### Step 2: Run This Command
Copy and paste this SQL, then click **RUN**:

```sql
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;
```

### Step 3: Test Login
Reload the login page and try again. The 406 error should be gone.

---

## Production Setup (With RLS Enabled)

After development, enable proper security policies:

### Step 1: In SQL Editor, Run:
```sql
-- Enable RLS on user_roles
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own role
CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow backend (service role) to manage roles
CREATE POLICY "Service role can read all roles" ON user_roles
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert roles" ON user_roles
  FOR INSERT
  TO service_role
  WITH CHECK (true);
```

### Step 2: Test Authentication
1. Create a user via Registration form
2. In Supabase **Authentication** tab, find your test user
3. Copy the user UUID
4. In SQL Editor, insert a test role:

```sql
INSERT INTO user_roles (user_id, role, school_id)
VALUES ('YOUR-USER-UUID', 'school_admin', NULL);
```

5. Try logging in with that user - should work now

---

## File References

- **SQL Scripts**: `supabase/rls_policies.sql` - Complete RLS policy setup
- **Dev Fix**: `supabase/disable_rls_dev.sql` - Quick development fix
- **Auth Code**: `js/auth.js` - Now displays banner when RLS blocks access

## What Each File Does

| File | Purpose |
|------|---------|
| `supabase/schema.sql` | Database table definitions |
| `supabase/rls_policies.sql` | Security policies for authenticated access |
| `supabase/disable_rls_dev.sql` | Development-only: disable RLS checks |
| `js/auth.js` | Shows error banner if RLS blocks user_roles query |
| `js/config-checker.js` | Configuration validation |

---

## Troubleshooting

### Still getting 406 error?
- Confirm you ran `ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;`
- Reload the page (hard refresh: Ctrl+Shift+R)
- Check browser console for exact error

### Login fails with "Invalid login credentials"?
- This is normal - the test email doesn't exist yet
- Register a new school first on the Registration page

### Red banner appears on login?
- This means RLS is blocking the user_roles query
- Run the "Quick Fix" SQL command above
