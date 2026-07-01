# WimpSchool Website Overview

## Purpose
WimpSchool is a role-based school management web app built for private schools. It supports:
- School admin workflows: student, teacher, fee, announcement and subscription management
- Teacher workflows: attendance, results entry, bulk result upload
- Parent workflows: child progress, fee balance, announcements and payments
- Super admin oversight in a separate portal

## Architecture
- Static HTML front end for each page
- Shared JavaScript modules in `js/`
- Supabase backend for authentication, database, and edge functions
- Role enforcement through `data-required-role` values on protected pages
- Session persistence using Supabase auth with fallback to local/session storage

## Core pages
- `login.html` — unified login portal with role mode selection
- `register.html` — school admin registration and subscription plan selection
- `school-admin-dashboard.html` — main admin dashboard with school overview
- `teacher-dashboard.html` — teacher home page with attendance and report entry
- `parent-portal.html` — parent home page for child status and payments
- `teacher-management.html` — admin page to invite and manage teachers
- `student-management.html` — admin page to add students and import in bulk
- `fee-management.html` — admin fee tracking and payment oversight
- `announcements.html` — admin announcement publishing
- `results.html` — teacher result entry and bulk CSV upload page
- `admin-settings.html` — admin settings, including plan upgrade scheduling
- `super-admin-panel.html` — super admin control panel

## Role-based access
The app enforces access at page load:
- `school_admin` → school admin pages only
- `teacher` → teacher pages only
- `parent` → parent portal only
- `super_admin` → super admin panel

Role checks are handled in `js/app.js` with `enforcePageRole()`. It:
- gets the Supabase session
- reads the user role from `user_roles`
- redirects based on role mismatch
- falls back to stored session if Supabase session is missing

## Plan upgrade flow
- `schools` table stores:
  - `subscription_plan`
  - `pending_subscription_plan`
  - `subscription_change_effective_date`
  - `next_billing_date`
- Admins can schedule an upgrade from `admin-settings.html`
- Upgrades are not immediate; they are scheduled to start on the next billing date
- The dashboard displays current plan and pending upgrade status

## Upgradeable paths
Planned upgrade paths for elite positioning:
- `Starter` → baseline core functionality
- `Growth` → advanced reporting and teacher / parent tools
- `Elite` → premium automation, analytics, notifications, and support

Later enhancements can include:
- payment gateway plan auto-renewals
- embedded invoice generation
- school-wide custom reports and dashboards
- teacher/parent mobile app experience
- branded portal customization per school

## How key pages work
### Login
- `js/app.js` listens for login form submit
- `js/auth.js` authenticates with Supabase
- `fetchUserRole()` ensures role is authoritative
- app redirects to the correct portal based on role

### School admin dashboard
- `js/dashboard.js` loads student counts, teacher counts, fee stats, and chart data
- the dashboard uses `school-admin-dashboard.html` role protection
- Added an Elite analytics widget section for attendance rate, fee recovery, and average score

### Admin settings
- `admin-settings.html` now includes school profile, contact, fee, grading, subscription, and branding forms
- `js/app.js` loads and saves settings to the `schools` table, including plan upgrade scheduling
- Branding preview is applied via `applySchoolBrandingPreview()` and persists to the database

### Teacher flow
- `results.html` allows both single result entry and CSV bulk upload
- `js/backend.js` maps CSV `student_code` to actual `student_id`
- `teacher-dashboard.html` provides quick access to attendance and scores

### Parent flow
- `parent-portal.html` shows child name, balance, attendance, and announcements
- `js/app.js` fetches parent and student records for the logged-in parent
- The portal now uses a more polished branded experience for parents and a clearer fee/payment view

## What remains to finish
- Final live verification of the settings, branding, and notification flows in a real Supabase-backed session
- Connect notification delivery to external channels such as email and SMS once provider credentials are available
- Expand the Elite analytics experience with richer reports, export formats, and more detailed school summaries
- Harden the production RLS setup further for any remaining tables and edge cases in the school workflow
- Continue polishing the remaining admin and teacher screens for a more complete mobile experience

## Notes for pitching
- Emphasize role separation: admins, teachers, and parents never share views
- Highlight the planned subscription upgrade mechanism as an enterprise feature
- Call out bulk CSV upload and parent payment portal as practical school operations
- Position WimpSchool as a lightweight, locally deployable school management system with potential to scale into premium support
