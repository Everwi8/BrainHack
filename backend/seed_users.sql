-- Demo users for the BrainySG hackathon MVP.
-- Run this in the Supabase SQL editor AFTER wiping the users table.
--
-- All accounts share the password: password
-- (bcrypt hash below verified against "password").
--
-- These match the one-click presets on the login screen
-- (frontend/src/pages/Login.jsx) and DEMO_CREDENTIALS.md.

-- Optional: start from a clean slate.
-- TRUNCATE TABLE users;
-- or: DELETE FROM users;

INSERT INTO users (email, password_hash, name, role) VALUES
  ('coordinator1@brainhack.sg', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Coordinator Alice', 'coordinator'),
  ('coordinator2@brainhack.sg', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Coordinator Bob',   'coordinator'),
  ('volunteer1@brainhack.sg',   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Volunteer Carol',   'volunteer'),
  ('volunteer2@brainhack.sg',   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Volunteer Dave',    'volunteer'),
  ('volunteer3@brainhack.sg',   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Volunteer Eve',     'volunteer'),
  ('resident1@brainhack.sg',    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Resident Frank',    'resident'),
  ('resident2@brainhack.sg',    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Resident Grace',    'resident'),
  ('resident3@brainhack.sg',    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Resident Henry',    'resident'),
  ('resident4@brainhack.sg',    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Resident Irene',    'resident'),
  ('resident5@brainhack.sg',    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Resident James',    'resident');
