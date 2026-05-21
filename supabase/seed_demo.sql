-- ============================================================================
-- Demo seed data — Acquisition Pipeline
-- ============================================================================
-- OPT-IN seed file (NOT in the migrations/ directory, so it does NOT auto-run).
-- Paste this into Supabase SQL Editor when you want a populated demo state:
-- 2 realistic Hotel Plus job descriptions + 8 candidates spread across the
-- Kanban funnel, so the tracker isn't an empty grid when the reviewer signs in.
--
-- Idempotent: hardcoded UUIDs + ON CONFLICT DO NOTHING means re-running is safe.
-- ============================================================================

-- --- Job descriptions --------------------------------------------------------

INSERT INTO job_descriptions (
  id, org_id, title, department, location, body_markdown,
  must_have, nice_to_have, weights, threshold
) VALUES (
  'd0000001-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Full Stack Developer',
  'Engineering',
  'Bangkok, Thailand (Hybrid)',
  E'We''re looking for a full-stack developer to join Hotel Plus and own the engineering side of our hotel-management consulting products.\n\nYou''ll work across our web app (TypeScript / Next.js / Postgres), build internal tools that our consulting team uses with clients, and integrate with a growing list of third-party APIs (booking engines, channel managers, POS systems).\n\nThis is a small team — your code ships fast and the impact on the business is direct.',
  ARRAY['TypeScript', 'React', 'Node.js', 'SQL / Postgres', '3+ years building production web apps'],
  ARRAY['Next.js App Router', 'Supabase / RLS', 'Hospitality industry experience', 'Thai/English bilingual'],
  '{"skills": 0.4, "experience": 0.4, "culture": 0.2}'::jsonb,
  7.0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO job_descriptions (
  id, org_id, title, department, location, body_markdown,
  must_have, nice_to_have, weights, threshold
) VALUES (
  'd0000002-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Hotel Operations Manager',
  'Operations',
  'Bangkok, Thailand (On-site)',
  E'Hotel Plus partners with independent hotels across Thailand to run their operations end-to-end. We''re hiring an Operations Manager to be the day-to-day owner of 2-3 hotel accounts in our portfolio.\n\nYou''ll be the bridge between hotel owners and our team — building the ops playbook, training their staff, monitoring KPIs (occupancy, ADR, guest satisfaction), and reporting back to ownership monthly.\n\nThe right person is hands-on, comfortable in both back-of-house and front-of-house, and obsessed with making numbers move.',
  ARRAY['5+ years hotel operations experience', 'Thai/English fluent', 'P&L ownership at department or property level', 'Excel / spreadsheets'],
  ARRAY['Multi-property experience', 'Boutique hotel background', 'Familiar with PMS systems (Opera, Cloudbeds)'],
  '{"skills": 0.3, "experience": 0.5, "culture": 0.2}'::jsonb,
  7.5
)
ON CONFLICT (id) DO NOTHING;

-- --- Candidates --------------------------------------------------------------
-- Distribution across the funnel so the Kanban tells a story at a glance.
-- Mix of Thai + foreign names, realistic titles, varied sources.

-- sourced (2) — outbound LinkedIn finds, not yet engaged
INSERT INTO candidates (
  id, org_id, full_name, email, phone, current_title, location,
  linkedin_url, source, source_url, stage, jd_id, applied_at
) VALUES (
  'c0000001-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Pimchanok Wattanasiri',
  'pimchanok.w@example.com',
  NULL,
  'Senior Software Engineer at Agoda',
  'Bangkok',
  'https://www.linkedin.com/in/pimchanok-wattanasiri',
  'outbound_sourced',
  'https://www.linkedin.com/in/pimchanok-wattanasiri',
  'sourced',
  'd0000001-0000-0000-0000-000000000001',
  NOW() - INTERVAL '6 days'
),
(
  'c0000002-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Marcus Chen',
  NULL,
  NULL,
  'Full Stack Engineer at LINE',
  'Bangkok',
  'https://www.linkedin.com/in/marcus-chen',
  'outbound_sourced',
  'https://www.linkedin.com/in/marcus-chen',
  'sourced',
  'd0000001-0000-0000-0000-000000000001',
  NOW() - INTERVAL '5 days'
)
ON CONFLICT (id) DO NOTHING;

-- applied / contacted (2) — inbound + outbound after cold email
INSERT INTO candidates (
  id, org_id, full_name, email, phone, current_title, location,
  linkedin_url, source, source_url, stage, jd_id, applied_at
) VALUES (
  'c0000003-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Nattapong Saetang',
  'nattapong.s@example.com',
  '+66 81 234 5678',
  'Frontend Developer at Wongnai',
  'Bangkok',
  'https://www.linkedin.com/in/nattapong-saetang',
  'referral',
  NULL,
  'applied',
  'd0000001-0000-0000-0000-000000000001',
  NOW() - INTERVAL '4 days'
),
(
  'c0000004-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'Aria Tanaka',
  'aria.tanaka@example.com',
  '+66 82 555 1234',
  'Full Stack Developer at Klook',
  'Bangkok',
  'https://www.linkedin.com/in/aria-tanaka',
  'linkedin',
  'https://www.linkedin.com/in/aria-tanaka',
  'applied',
  'd0000001-0000-0000-0000-000000000001',
  NOW() - INTERVAL '3 days'
)
ON CONFLICT (id) DO NOTHING;

-- screening (1) — CV reviewed, decision pending
INSERT INTO candidates (
  id, org_id, full_name, email, phone, current_title, location,
  linkedin_url, source, source_url, stage, jd_id, applied_at
) VALUES (
  'c0000005-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000001',
  'Sirinya Phongphan',
  'sirinya.p@example.com',
  '+66 89 111 2222',
  'Operations Lead at Centara Hotels',
  'Bangkok',
  'https://www.linkedin.com/in/sirinya-phongphan',
  'jobsdb',
  'https://th.jobsdb.com/job/sirinya-phongphan',
  'screening',
  'd0000002-0000-0000-0000-000000000002',
  NOW() - INTERVAL '5 days'
)
ON CONFLICT (id) DO NOTHING;

-- prescreen_call (1) — phone screen booked
INSERT INTO candidates (
  id, org_id, full_name, email, phone, current_title, location,
  linkedin_url, source, source_url, stage, jd_id, applied_at
) VALUES (
  'c0000006-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000001',
  'Thanaphat Boonruang',
  'thanaphat.b@example.com',
  '+66 86 777 8888',
  'Backend Engineer at SCB Tech X',
  'Bangkok',
  'https://www.linkedin.com/in/thanaphat-boonruang',
  'linkedin',
  'https://www.linkedin.com/in/thanaphat-boonruang',
  'prescreen_call',
  'd0000001-0000-0000-0000-000000000001',
  NOW() - INTERVAL '8 days'
)
ON CONFLICT (id) DO NOTHING;

-- first_interview (1) — passed prescreen, meeting hiring manager
INSERT INTO candidates (
  id, org_id, full_name, email, phone, current_title, location,
  linkedin_url, source, source_url, stage, jd_id, applied_at
) VALUES (
  'c0000007-0000-0000-0000-000000000007',
  '00000000-0000-0000-0000-000000000001',
  'Lalita Sukcharoen',
  'lalita.s@example.com',
  '+66 91 234 5566',
  'Senior Full Stack Developer at Bitkub',
  'Bangkok',
  'https://www.linkedin.com/in/lalita-sukcharoen',
  'referral',
  NULL,
  'first_interview',
  'd0000001-0000-0000-0000-000000000001',
  NOW() - INTERVAL '12 days'
)
ON CONFLICT (id) DO NOTHING;

-- rejected (1) — culture/experience mismatch
INSERT INTO candidates (
  id, org_id, full_name, email, phone, current_title, location,
  linkedin_url, source, source_url, stage, jd_id, applied_at
) VALUES (
  'c0000008-0000-0000-0000-000000000008',
  '00000000-0000-0000-0000-000000000001',
  'Watcharaphon Inthanon',
  'watcharaphon.i@example.com',
  NULL,
  'Junior Web Developer (1 yr experience)',
  'Chiang Mai',
  NULL,
  'paste',
  NULL,
  'rejected',
  'd0000001-0000-0000-0000-000000000001',
  NOW() - INTERVAL '2 days'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- After running:
--   - /tracker shows 8 candidates across 6 stages
--   - /jds shows 2 JDs
--   - Try scoring c0000005 (Sirinya) against d0000002 (Operations Manager)
-- ============================================================================
