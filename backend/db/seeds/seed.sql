-- Sample data for local testing. Run after schema.sql.
-- Passwords are bcrypt of "password123".

INSERT INTO users (id, email, password_hash, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@brainhack.sg', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin'),
  ('00000000-0000-0000-0000-000000000002', 'volunteer@brainhack.sg', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Volunteer User')
ON CONFLICT (email) DO NOTHING;

INSERT INTO crises (id, title, description, type, severity, status, lat, lng, location_name, source) VALUES
  (
    '11111111-0000-0000-0000-000000000001',
    'Flash Flood — Kranji',
    'Water levels rising rapidly near Kranji MRT. Low-lying areas affected.',
    'flood', 'high', 'active',
    1.4255, 103.7576, 'Kranji', 'pub'
  ),
  (
    '11111111-0000-0000-0000-000000000002',
    'EWL Disruption — Jurong East to Clementi',
    'Train service disrupted between Jurong East and Clementi due to track fault.',
    'mrt', 'medium', 'active',
    1.3329, 103.7436, 'Jurong East', 'lta'
  ),
  (
    '11111111-0000-0000-0000-000000000003',
    'Haze Alert — Central Region',
    'PSI reading at 142. Unhealthy for sensitive groups.',
    'haze', 'medium', 'active',
    1.3521, 103.8198, 'Central Singapore', 'nea'
  ),
  (
    '11111111-0000-0000-0000-000000000004',
    'Dengue Cluster — Tampines',
    'NEA red dengue cluster in Tampines. 64 cases reported. Remove stagnant water and apply repellent.',
    'dengue', 'high', 'active',
    1.3536, 103.9436, 'Tampines', 'nea'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO tasks (crisis_id, title, description, status) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Deploy sandbags at Kranji Road', 'Coordinate with NEA to deploy sandbags at flood-prone junction.', 'pending'),
  ('11111111-0000-0000-0000-000000000001', 'Evacuate elderly residents at Blk 812', 'Check on residents in block 812 who may need mobility assistance.', 'pending'),
  ('11111111-0000-0000-0000-000000000002', 'Deploy feeder buses along EWL corridor', 'Arrange free shuttle buses between Jurong East and Clementi.', 'in_progress'),
  ('11111111-0000-0000-0000-000000000003', 'Distribute N95 masks at community centres', 'Priority: elderly residents and children.', 'pending'),
  ('11111111-0000-0000-0000-000000000004', 'Mozzie Wipeout sweep at Tampines blocks', 'Door-to-door check for stagnant water in flowerpots, gully traps, and bins.', 'pending'),
  ('11111111-0000-0000-0000-000000000004', 'Hand out repellent at Tampines Hub', 'Priority: households with young children and elderly.', 'pending');
