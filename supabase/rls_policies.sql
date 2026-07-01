-- WimpSchool RLS (Row Level Security) Policies
-- Run these SQL commands in Supabase SQL Editor to enable secure access control

-- Enable RLS on user_roles table
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow authenticated users to read their own role
CREATE POLICY "Users can read own role" ON user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy 2: Allow school admins and super admins to read school role memberships
CREATE POLICY "Admins can view school roles" ON user_roles
  FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')
    )
  );

-- Policy 3: Allow service role (backend) to read all roles
CREATE POLICY "Service role can read all roles" ON user_roles
  FOR SELECT
  TO service_role
  USING (true);

-- Policy 4: Allow service role to insert roles
CREATE POLICY "Service role can insert roles" ON user_roles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy 5: Allow service role to update roles
CREATE POLICY "Service role can update roles" ON user_roles
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Enable RLS on schools table
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read their school if they belong to it
CREATE POLICY "Users can read their school" ON schools
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- Policy: Restrict school updates to admins only
CREATE POLICY "Only admins can update school" ON schools
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT school_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')
    )
  )
  WITH CHECK (
    id IN (
      SELECT school_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')
    )
  );

-- Policy: Service role can read all schools
CREATE POLICY "Service role can read schools" ON schools
  FOR SELECT
  TO service_role
  USING (true);

-- Policy: Service role can insert schools
CREATE POLICY "Service role can insert schools" ON schools
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Enable RLS on students table
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Policy: Allow school members to read students in their school
CREATE POLICY "Users can read school students" ON students
  FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- Policy: Allow parents to read only their linked children
CREATE POLICY "Parents can read linked children" ON students
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT student_id FROM parent_student_links
      WHERE parent_id IN (
        SELECT id FROM parents WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Service role can read all students
CREATE POLICY "Service role can read students" ON students
  FOR SELECT
  TO service_role
  USING (true);

-- Enable RLS on teachers table
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read teachers in their school
CREATE POLICY "Users can read school teachers" ON teachers
  FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- Policy: Restrict teacher updates to teacher records they own or school admins
CREATE POLICY "Teachers can update own record" ON teachers
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() OR
    school_id IN (
      SELECT school_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')
    )
  )
  WITH CHECK (
    user_id = auth.uid() OR
    school_id IN (
      SELECT school_id FROM user_roles
      WHERE user_id = auth.uid() AND role IN ('school_admin', 'super_admin')
    )
  );

-- Policy: Service role can manage teachers
CREATE POLICY "Service role can read teachers" ON teachers
  FOR SELECT
  TO service_role
  USING (true);

-- Enable RLS on parents table
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;

-- Policy: Allow parents to read own record
CREATE POLICY "Parents can read own record" ON parents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Allow parents to read their linked student payments only
CREATE POLICY "Parents can read linked payments" ON payments
  FOR SELECT
  TO authenticated
  USING (
    parent_id IN (
      SELECT id FROM parents WHERE user_id = auth.uid()
    ) OR
    student_id IN (
      SELECT student_id FROM parent_student_links
      WHERE parent_id IN (
        SELECT id FROM parents WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Service role can manage parents
CREATE POLICY "Service role can read parents" ON parents
  FOR SELECT
  TO service_role
  USING (true);

-- Enable RLS on announcements table
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Enable RLS on attendance/results/payments/notifications tables
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read announcements in their school
CREATE POLICY "Users can read school announcements" ON announcements
  FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can read school attendance" ON attendance
  FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can read school results" ON results
  FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can read school payments" ON payments
  FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can read school notifications" ON notifications
  FOR SELECT
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role can read/manage announcements
CREATE POLICY "Service role can read announcements" ON announcements
  FOR SELECT
  TO service_role
  USING (true);

-- Additional write policies for authenticated school members
CREATE POLICY "School members can insert students" ON students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "School members can update students" ON students
  FOR UPDATE
  TO authenticated
  USING (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM user_roles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "School members can insert teachers" ON teachers
  FOR INSERT
  TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can update teachers" ON teachers
  FOR UPDATE
  TO authenticated
  USING (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can insert announcements" ON announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can update announcements" ON announcements
  FOR UPDATE
  TO authenticated
  USING (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can insert attendance" ON attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can insert results" ON results
  FOR INSERT
  TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can insert payments" ON payments
  FOR INSERT
  TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can insert notifications" ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can update notifications" ON notifications
  FOR UPDATE
  TO authenticated
  USING (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can insert attendance" ON attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can update attendance" ON attendance
  FOR UPDATE
  TO authenticated
  USING (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can insert results" ON results
  FOR INSERT
  TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can update results" ON results
  FOR UPDATE
  TO authenticated
  USING (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can insert payments" ON payments
  FOR INSERT
  TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

CREATE POLICY "School members can update payments" ON payments
  FOR UPDATE
  TO authenticated
  USING (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid()));

-- Note: The policies above use "service_role" for backend operations.
-- If you're using anon key from browser, you may need to adjust policies
-- to allow anon users initially or use a custom JWT claim for roles.
-- For browser access during development, consider temporarily disabling RLS
-- or using a more permissive policy on user_roles:
--
-- ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;
