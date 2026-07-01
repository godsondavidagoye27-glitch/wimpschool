-- Quick RLS Fix for Development - Disable RLS on user_roles
-- This allows browser login to work while you set up proper policies

ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;

-- Optional: Also disable on related tables for full dev access
-- ALTER TABLE schools DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE students DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE teachers DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE parents DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE announcements DISABLE ROW LEVEL SECURITY;

-- Once login works, enable RLS back and run the policies from rls_policies.sql
-- ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
