-- Enable RLS on each sensitive table

alter table user_roles enable row level security;
alter table schools enable row level security;
alter table students enable row level security;
alter table teachers enable row level security;
alter table parents enable row level security;
alter table attendance enable row level security;
alter table results enable row level security;
alter table payments enable row level security;
alter table announcements enable row level security;
alter table notifications enable row level security;

-- Allow authenticated users to read their own role membership
create policy "user roles select for owner" on user_roles
  for select using (auth.uid() = user_id);

-- School admins can manage rows in their school
create policy "schools select/manage by admin" on schools
  for all using (exists (
    select 1 from user_roles where user_roles.user_id = auth.uid() and user_roles.school_id = schools.id and user_roles.role = 'school_admin'
  ));

-- Students are visible to school admins and their parents
create policy "students select for school admin" on students
  for select using (exists (
    select 1 from user_roles where user_roles.school_id = students.school_id and user_roles.role in ('school_admin', 'teacher') and user_roles.user_id = auth.uid()
  ));

create policy "students select for parent" on students
  for select using (
    exists (
      select 1 from parents where parents.user_id = auth.uid() and parents.student_id = students.id
    )
  );

create policy "students insert for admin" on students
  for insert with check (exists (
    select 1 from user_roles where user_roles.user_id = auth.uid() and user_roles.school_id = students.school_id and user_roles.role = 'school_admin'
  ));

create policy "teachers select/manage for school admin" on teachers
  for all using (exists (
    select 1 from user_roles where user_roles.school_id = teachers.school_id and user_roles.role = 'school_admin' and user_roles.user_id = auth.uid()
  ));

create policy "parents select/manage for school admin" on parents
  for all using (exists (
    select 1 from user_roles where user_roles.school_id = parents.school_id and user_roles.role = 'school_admin' and user_roles.user_id = auth.uid()
  ));

create policy "parents select for parent" on parents
  for select using (parents.user_id = auth.uid());

create policy "attendance select for school staff" on attendance
  for select using (exists (
    select 1 from user_roles where user_roles.school_id = attendance.school_id and user_roles.role in ('school_admin', 'teacher') and user_roles.user_id = auth.uid()
  ) or exists (
    select 1 from parents where parents.user_id = auth.uid() and parents.student_id = attendance.student_id
  ));

create policy "attendance insert by teacher" on attendance
  for insert with check (exists (
    select 1 from user_roles where user_roles.school_id = attendance.school_id and user_roles.role = 'teacher' and user_roles.user_id = auth.uid()
  ));

create policy "results select for school staff" on results
  for select using (exists (
    select 1 from user_roles where user_roles.school_id = results.school_id and user_roles.role in ('school_admin', 'teacher') and user_roles.user_id = auth.uid()
  ) or exists (
    select 1 from parents where parents.user_id = auth.uid() and parents.student_id = results.student_id
  ));

create policy "results insert by teacher" on results
  for insert with check (exists (
    select 1 from user_roles where user_roles.school_id = results.school_id and user_roles.role = 'teacher' and user_roles.user_id = auth.uid()
  ));

create policy "payments select for school staff" on payments
  for select using (exists (
    select 1 from user_roles where user_roles.school_id = payments.school_id and user_roles.role in ('school_admin', 'teacher') and user_roles.user_id = auth.uid()
  ) or exists (
    select 1 from parents where parents.user_id = auth.uid() and parents.id = payments.parent_id
  ));

create policy "payments insert by caller" on payments
  for insert with check (exists (
    select 1 from user_roles where user_roles.school_id = payments.school_id and user_roles.role = 'school_admin' and user_roles.user_id = auth.uid()
  ) or exists (
    select 1 from parents where parents.user_id = auth.uid() and parents.id = payments.parent_id
  ));

create policy "announcements select for school staff" on announcements
  for select using (exists (
    select 1 from user_roles where user_roles.school_id = announcements.school_id and user_roles.role in ('school_admin', 'teacher') and user_roles.user_id = auth.uid()
  ) or exists (
    select 1 from parents where parents.user_id = auth.uid() and parents.school_id = announcements.school_id
  ));

create policy "announcements insert by admin" on announcements
  for insert with check (exists (
    select 1 from user_roles where user_roles.school_id = announcements.school_id and user_roles.role = 'school_admin' and user_roles.user_id = auth.uid()
  ));

create policy "notifications select for owner" on notifications
  for select using (notifications.user_id = auth.uid() or exists (
    select 1 from user_roles where user_roles.school_id = notifications.school_id and user_roles.role = 'school_admin' and user_roles.user_id = auth.uid()
  ));
