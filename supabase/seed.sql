-- AirDrums demo seed
--
-- Demo accounts (all use password: Demo123456! )
--   admin@airdrums.demo        -> admin account
--   mona@airdrums.demo         -> host with approved + pending listings
--   leo@airdrums.demo          -> host with approved + rejected listings
--   gina@airdrums.demo         -> verified guest with completed + future stays
--   sam@airdrums.demo          -> guest with pending request + review reminder
--   antox.qscwdv@gmail.com     -> demo user account for Artem Melnikov
--
-- Run with:
--   supabase db reset
-- or
--   supabase db push --include-seed

begin;

-- ---------------------------------------------------------------------------
-- Deterministic IDs
-- ---------------------------------------------------------------------------
-- users
-- admin: 10000000-0000-4000-8000-000000000001
-- mona : 10000000-0000-4000-8000-000000000002
-- leo  : 10000000-0000-4000-8000-000000000003
-- gina : 10000000-0000-4000-8000-000000000004
-- sam  : 10000000-0000-4000-8000-000000000005
-- artem: 10000000-0000-4000-8000-000000000006
--
-- listings
-- loft    : 20000000-0000-4000-8000-000000000001
-- night   : 20000000-0000-4000-8000-000000000002
-- pending : 20000000-0000-4000-8000-000000000003
-- reject  : 20000000-0000-4000-8000-000000000004
-- soho    : 20000000-0000-4000-8000-000000000005
-- brooklyn: 20000000-0000-4000-8000-000000000006
-- harlem  : 20000000-0000-4000-8000-000000000007

-- ---------------------------------------------------------------------------
-- Cleanup existing branch data so the seed can rebuild a full demo state from
-- scratch. This is intentionally destructive and is meant for disposable
-- local/dev environments only.
-- ---------------------------------------------------------------------------
truncate table
  public.notifications,
  public.reservation_reviews,
  public.chat_messages,
  public.chat_participants,
  public.chats,
  public.reservation_payments,
  public.checkout_holds,
  public.reservations,
  public.listing_weekly_slots,
  public.listing_booking_policies,
  public.listings,
  public.user_roles,
  public."user",
  auth.identities,
  auth.users
cascade;

-- ---------------------------------------------------------------------------
-- Auth users + identities. signup_user() trigger creates matching public.user rows.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin@airdrums.demo',
    extensions.crypt('Demo123456!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Avery","last_name":"Admin"}'::jsonb,
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'mona@airdrums.demo',
    extensions.crypt('Demo123456!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Mona","last_name":"Rhodes"}'::jsonb,
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'leo@airdrums.demo',
    extensions.crypt('Demo123456!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Leo","last_name":"Park"}'::jsonb,
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'gina@airdrums.demo',
    extensions.crypt('Demo123456!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Gina","last_name":"Torres"}'::jsonb,
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'sam@airdrums.demo',
    extensions.crypt('Demo123456!', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Sam","last_name":"Walker"}'::jsonb,
    now(),
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000006',
    'authenticated',
    'authenticated',
    'antox.qscwdv@gmail.com',
    extensions.crypt('sukablya', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Artem","last_name":"Melnikov"}'::jsonb,
    now(),
    now(),
    '', '', '', ''
  );

insert into auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '11000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '{"sub":"10000000-0000-4000-8000-000000000001","email":"admin@airdrums.demo"}'::jsonb,
    'email',
    'admin@airdrums.demo',
    now(), now(), now()
  ),
  (
    '11000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '{"sub":"10000000-0000-4000-8000-000000000002","email":"mona@airdrums.demo"}'::jsonb,
    'email',
    'mona@airdrums.demo',
    now(), now(), now()
  ),
  (
    '11000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    '{"sub":"10000000-0000-4000-8000-000000000003","email":"leo@airdrums.demo"}'::jsonb,
    'email',
    'leo@airdrums.demo',
    now(), now(), now()
  ),
  (
    '11000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000004',
    '{"sub":"10000000-0000-4000-8000-000000000004","email":"gina@airdrums.demo"}'::jsonb,
    'email',
    'gina@airdrums.demo',
    now(), now(), now()
  ),
  (
    '11000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000005',
    '{"sub":"10000000-0000-4000-8000-000000000005","email":"sam@airdrums.demo"}'::jsonb,
    'email',
    'sam@airdrums.demo',
    now(), now(), now()
  ),
  (
    '11000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000006',
    '{"sub":"10000000-0000-4000-8000-000000000006","email":"antox.qscwdv@gmail.com"}'::jsonb,
    'email',
    'antox.qscwdv@gmail.com',
    now(), now(), now()
  );

update public."user"
set
  account_status = 'ACTIVE'::public.account_status,
  id_verified_at = case
    when id in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004'
    ) then now() - interval '30 days'
    else null
  end,
  updated_at = now()
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006'
);

insert into public.user_roles (user_id, role)
values
  ('10000000-0000-4000-8000-000000000001', 'USER'::public.user_role),
  ('10000000-0000-4000-8000-000000000001', 'ADMIN'::public.user_role),
  ('10000000-0000-4000-8000-000000000002', 'USER'::public.user_role),
  ('10000000-0000-4000-8000-000000000003', 'USER'::public.user_role),
  ('10000000-0000-4000-8000-000000000004', 'USER'::public.user_role),
  ('10000000-0000-4000-8000-000000000005', 'USER'::public.user_role),
  ('10000000-0000-4000-8000-000000000006', 'USER'::public.user_role)
on conflict (user_id, role) do nothing;

-- ---------------------------------------------------------------------------
-- Listings: approved, instant-booking approved, pending moderation, rejected.
-- ---------------------------------------------------------------------------
insert into public.listings (
  id,
  owner_id,
  lat,
  lng,
  address,
  title,
  subtitle,
  category,
  price,
  images,
  description,
  equipment_desc,
  conveniences_desc,
  area_m2,
  cancellation_policy_hours,
  advance_notice_hours,
  timezone,
  host_confirmation_message,
  rules,
  instructions,
  moderation_status,
  moderation_message,
  status,
  submitted_at,
  reviewed_at,
  reviewed_by,
  created_at,
  updated_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    40.7306,
    -73.9866,
    '24 Bond Street, New York, NY',
    'Downtown Drum Loft',
    'Sunlit rehearsal room with treated walls',
    'REHEARSAL_SPACE',
    35,
    array[
      'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80'
    ],
    'A flexible downtown room for full-band rehearsals, drum lessons, and writing sessions.',
    'DW kit, bass amp, two guitar combos, vocal PA, four microphones.',
    'Wi-Fi, lounge area, tea station, keypad entry.',
    42,
    24,
    2,
    'America/New_York',
    'Thanks for booking. Message me if you need extra cymbal stands or a click setup.',
    'Respect the neighbors after 10pm and leave the room as you found it.',
    'Use the side entrance keypad. Code is shared once your stay is confirmed.',
    'APPROVED',
    null,
    'ACTIVE',
    now() - interval '21 days',
    now() - interval '20 days',
    '10000000-0000-4000-8000-000000000001',
    now() - interval '21 days',
    now() - interval '2 days'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    34.0522,
    -118.2437,
    '88 Spring Street, Los Angeles, CA',
    'Night Owl Studio',
    'Late-night recording room with isolated booth',
    'RECORDING_STUDIO',
    55,
    array[
      'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1461783436728-0a9217714694?auto=format&fit=crop&w=1200&q=80'
    ],
    'A compact studio with a vocal booth, desk space, and gear for high-focus writing sessions.',
    'Apollo interface, monitors, condenser microphones, MIDI keyboard, acoustic treatment.',
    'Street parking, cold brew fridge, fast Wi-Fi, air conditioning.',
    28,
    12,
    1,
    'America/Los_Angeles',
    'You are all set. Park behind the building and buzz Studio B when you arrive.',
    'No smoking, no food near the desk, and keep the vocal booth door closed while tracking.',
    'Please arrive 5 minutes early so I can help you get patched in.',
    'APPROVED',
    null,
    'ACTIVE',
    now() - interval '18 days',
    now() - interval '17 days',
    '10000000-0000-4000-8000-000000000001',
    now() - interval '18 days',
    now() - interval '1 day'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    41.8781,
    -87.6298,
    '15 Wacker Drive, Chicago, IL',
    'Riverside Practice Garage',
    'Budget-friendly DIY practice spot',
    'OTHER',
    22,
    array[
      'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&w=1200&q=80'
    ],
    'A simple garage rehearsal space for loud bands that want an affordable hourly room.',
    'Basic drum riser, PA, folding chairs, extension power strips.',
    'On-site parking, restroom access, fan ventilation.',
    36,
    6,
    2,
    'America/Chicago',
    'I will send directions after approval.',
    'Bring your own breakables and keep doors closed during rehearsals.',
    'Entrance is around the back of the building near the alley gate.',
    'PENDING_APPROVAL',
    null,
    'ACTIVE',
    now() - interval '2 days',
    null,
    null,
    now() - interval '2 days',
    now() - interval '2 days'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000003',
    29.7604,
    -95.3698,
    '11 Main Street, Houston, TX',
    'Basement Jam Den',
    'Raw basement room for loud sessions',
    'OTHER',
    18,
    array[
      'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?auto=format&fit=crop&w=1200&q=80'
    ],
    'A basement room with big volume and almost no natural light.',
    'Shared backline and spare instrument stands.',
    'Mini fridge and secure exterior door.',
    30,
    24,
    4,
    'America/Chicago',
    'Please wait for approval before inviting your full band.',
    'Keep amps off the floor and no unattended candles.',
    'Check in with the venue manager upstairs on arrival.',
    'REJECTED',
    'Please upload brighter photos and clarify parking/access details before resubmitting.',
    'ACTIVE',
    now() - interval '5 days',
    now() - interval '3 days',
    '10000000-0000-4000-8000-000000000001',
    now() - interval '5 days',
    now() - interval '3 days'
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000002',
    40.7228,
    -74.0007,
    '121 Wooster Street, New York, NY',
    'SoHo Session Suite',
    'Polished downtown studio for writing and overdubs',
    'RECORDING_STUDIO',
    48,
    array[
      'https://images.unsplash.com/photo-1516280030429-27679b3dc9cf?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80'
    ],
    'A warm SoHo writing room with enough isolation for tight overdubs, vocal takes, and late-afternoon production sessions.',
    'Maple kit, upright piano, stereo monitors, outboard preamps, ribbon mic, headphone mixer.',
    'Elevator access, espresso bar, lounge sofa, fast Wi-Fi, freight elevator for load-in.',
    38,
    12,
    1,
    'America/New_York',
    'I usually meet guests downstairs for the first visit and can help with load-in if you message ahead.',
    'No smoking, keep drinks off the desk, and use the rug under heavy stands to protect the floor.',
    'Use the Mercer entrance after 5pm and message when you arrive so I can buzz you up.',
    'APPROVED',
    null,
    'ACTIVE',
    now() - interval '16 days',
    now() - interval '15 days',
    '10000000-0000-4000-8000-000000000001',
    now() - interval '16 days',
    now() - interval '1 day'
  ),
  (
    '20000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000002',
    40.6782,
    -73.9442,
    '80 Atlantic Avenue, Brooklyn, NY',
    'Brooklyn Band House',
    'Big live room for rehearsals, showcases, and pre-tour run-throughs',
    'REHEARSAL_SPACE',
    42,
    array[
      'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80'
    ],
    'A roomy Brooklyn rehearsal spot with enough footprint for full bands, playback rehearsals, and production rehearsals.',
    'Five-piece house kit, bass stack, two guitar cabs, small mixer, vocal wedges, rolling risers.',
    'Street-level load-in, HVAC, water station, coat rack, private restroom.',
    55,
    24,
    2,
    'America/New_York',
    'Happy to leave extra mic stands out if you tell me your input list before arrival.',
    'Keep the front door closed during rehearsals and reset the room before leaving.',
    'Ring the gray side doorbell and take the hallway all the way to Studio 3.',
    'APPROVED',
    null,
    'ACTIVE',
    now() - interval '14 days',
    now() - interval '13 days',
    '10000000-0000-4000-8000-000000000001',
    now() - interval '14 days',
    now() - interval '12 hours'
  ),
  (
    '20000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000002',
    40.8116,
    -73.9465,
    '230 Lenox Avenue, New York, NY',
    'Harlem Creative Loft',
    'Airy uptown room for lessons, rehearsals, and content shoots',
    'OTHER',
    39,
    array[
      'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?auto=format&fit=crop&w=1200&q=80'
    ],
    'A bright Harlem loft that works for compact rehearsals, drum lessons, and music content sessions with natural light.',
    'Compact drum kit, keyboard stand, combo amp, ring lights, folding producer desk, PA speaker.',
    'Natural light, freight elevator, kitchenette, portable AC, nearby parking garage.',
    46,
    24,
    3,
    'America/New_York',
    'Please share your planned setup if you need the room staged differently before arrival.',
    'Shoes off on the rug, no glitter or smoke effects, and keep hallway noise low after 8pm.',
    'Take the elevator to floor 4 and use the call box marked Loft C if the door is locked.',
    'APPROVED',
    null,
    'ACTIVE',
    now() - interval '12 days',
    now() - interval '11 days',
    '10000000-0000-4000-8000-000000000001',
    now() - interval '12 days',
    now() - interval '6 hours'
  );

insert into public.listing_booking_policies (
  listing_id,
  instant_booking,
  min_past_bookings,
  min_reviews,
  require_id_verified,
  extra_rules,
  created_at,
  updated_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    false,
    null,
    null,
    false,
    '{"notes":"Host manually approves most bookings within a few hours."}'::jsonb,
    now() - interval '21 days',
    now() - interval '21 days'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    true,
    1,
    1,
    true,
    '{"preferred_genres":["rock","pop","indie"],"late_night_ok":true}'::jsonb,
    now() - interval '18 days',
    now() - interval '18 days'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    false,
    null,
    null,
    false,
    '{}'::jsonb,
    now() - interval '2 days',
    now() - interval '2 days'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    false,
    null,
    null,
    false,
    '{}'::jsonb,
    now() - interval '5 days',
    now() - interval '5 days'
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    true,
    1,
    1,
    true,
    '{"preferred_session_types":["writing","overdubs","vocals"]}'::jsonb,
    now() - interval '16 days',
    now() - interval '16 days'
  ),
  (
    '20000000-0000-4000-8000-000000000006',
    false,
    null,
    null,
    false,
    '{"notes":"Best for full-band rehearsals and playback sessions."}'::jsonb,
    now() - interval '14 days',
    now() - interval '14 days'
  ),
  (
    '20000000-0000-4000-8000-000000000007',
    false,
    null,
    null,
    false,
    '{"notes":"Natural-light setup works well for lessons and content days."}'::jsonb,
    now() - interval '12 days',
    now() - interval '12 days'
  );

insert into public.listing_weekly_slots (
  listing_id,
  weekday,
  hour,
  price,
  created_at,
  updated_at
)
select
  listing_data.listing_id,
  weekday_series.weekday,
  hour_series.hour,
  listing_data.price,
  now() - interval '21 days',
  now() - interval '21 days'
from (
  values
    ('20000000-0000-4000-8000-000000000001'::uuid, 35::double precision, 10, 22),
    ('20000000-0000-4000-8000-000000000002'::uuid, 55::double precision, 8, 22),
    ('20000000-0000-4000-8000-000000000003'::uuid, 22::double precision, 8, 22),
    ('20000000-0000-4000-8000-000000000004'::uuid, 18::double precision, 8, 22),
    ('20000000-0000-4000-8000-000000000005'::uuid, 48::double precision, 8, 22),
    ('20000000-0000-4000-8000-000000000006'::uuid, 42::double precision, 8, 22),
    ('20000000-0000-4000-8000-000000000007'::uuid, 39::double precision, 8, 22)
) as listing_data(listing_id, price, hour_start, hour_end)
cross join generate_series(0, 6) as weekday_series(weekday)
cross join lateral generate_series(listing_data.hour_start, listing_data.hour_end) as hour_series(hour);

-- ---------------------------------------------------------------------------
-- Reservations: completed, normal pending, awaiting late consent,
-- late terms accepted (still waiting on host), cancelled,
-- and completed-no-review to demonstrate review reminders.
-- ---------------------------------------------------------------------------
alter table public.reservations disable trigger validate_and_price_reservation;

with reservation_times as (
  select
    date_trunc('day', now()) as today_start,
    now() as current_ts,
    date_trunc('hour', now()) as current_hour,
    date_trunc('day', now() at time zone 'America/Los_Angeles') as la_today_start
)
insert into public.reservations (
  id,
  listing_id,
  renter_id,
  start_at,
  end_at,
  payment_deadline,
  host_preconfirmed_at,
  late_consent_given_at,
  status,
  total_price,
  guests,
  created_at,
  updated_at
)
select * from (
  select
    '40000000-0000-4000-8000-000000000001'::uuid as id,
    '20000000-0000-4000-8000-000000000001'::uuid as listing_id,
    '10000000-0000-4000-8000-000000000004'::uuid as renter_id,
    rt.today_start - interval '5 days' + interval '18 hours' as start_at,
    rt.today_start - interval '5 days' + interval '21 hours' as end_at,
    rt.today_start - interval '6 days' + interval '18 hours' as payment_deadline,
    null::timestamptz as host_preconfirmed_at,
    null::timestamptz as late_consent_given_at,
    'CONFIRMED'::public.reservation_status as status,
    105::double precision as total_price,
    4 as guests,
    rt.today_start - interval '8 days' as created_at,
    rt.today_start - interval '5 days' as updated_at
  from reservation_times rt

  union all

  select
    '40000000-0000-4000-8000-000000000002'::uuid,
    '20000000-0000-4000-8000-000000000001'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid,
    rt.today_start + interval '3 days' + interval '18 hours',
    rt.today_start + interval '3 days' + interval '21 hours',
    rt.today_start + interval '2 days' + interval '18 hours',
    null::timestamptz,
    null::timestamptz,
    'PENDING'::public.reservation_status,
    105::double precision,
    3,
    rt.today_start - interval '1 day',
    rt.today_start - interval '1 day'
  from reservation_times rt

  union all

  select
    '40000000-0000-4000-8000-000000000003'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000004'::uuid,
    rt.today_start + interval '4 days' + interval '19 hours',
    rt.today_start + interval '4 days' + interval '22 hours',
    rt.today_start + interval '3 days' + interval '19 hours',
    null::timestamptz,
    null::timestamptz,
    'CONFIRMED'::public.reservation_status,
    165::double precision,
    2,
    rt.today_start - interval '2 days',
    rt.today_start - interval '2 days'
  from reservation_times rt

  union all

  select
    '40000000-0000-4000-8000-000000000004'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid,
    make_timestamptz(
      extract(year from (rt.la_today_start + interval '1 day'))::int,
      extract(month from (rt.la_today_start + interval '1 day'))::int,
      extract(day from (rt.la_today_start + interval '1 day'))::int,
      10,
      0,
      0,
      'America/Los_Angeles'
    ),
    make_timestamptz(
      extract(year from (rt.la_today_start + interval '1 day'))::int,
      extract(month from (rt.la_today_start + interval '1 day'))::int,
      extract(day from (rt.la_today_start + interval '1 day'))::int,
      13,
      0,
      0,
      'America/Los_Angeles'
    ),
    make_timestamptz(
      extract(year from (rt.la_today_start + interval '1 day'))::int,
      extract(month from (rt.la_today_start + interval '1 day'))::int,
      extract(day from (rt.la_today_start + interval '1 day'))::int,
      9,
      0,
      0,
      'America/Los_Angeles'
    ),
    null::timestamptz,
    null::timestamptz,
    'PENDING_AWAITING_LATE_CONSENT'::public.reservation_status,
    165::double precision,
    1,
    rt.current_ts - interval '28 hours',
    rt.current_ts - interval '30 minutes'
  from reservation_times rt

  union all

  select
    '40000000-0000-4000-8000-000000000005'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid,
    make_timestamptz(
      extract(year from (rt.la_today_start + interval '1 day'))::int,
      extract(month from (rt.la_today_start + interval '1 day'))::int,
      extract(day from (rt.la_today_start + interval '1 day'))::int,
      14,
      0,
      0,
      'America/Los_Angeles'
    ),
    make_timestamptz(
      extract(year from (rt.la_today_start + interval '1 day'))::int,
      extract(month from (rt.la_today_start + interval '1 day'))::int,
      extract(day from (rt.la_today_start + interval '1 day'))::int,
      16,
      0,
      0,
      'America/Los_Angeles'
    ),
    make_timestamptz(
      extract(year from (rt.la_today_start + interval '1 day'))::int,
      extract(month from (rt.la_today_start + interval '1 day'))::int,
      extract(day from (rt.la_today_start + interval '1 day'))::int,
      13,
      0,
      0,
      'America/Los_Angeles'
    ),
    rt.current_ts - interval '20 minutes',
    rt.current_ts - interval '40 minutes',
    'PENDING'::public.reservation_status,
    110::double precision,
    1,
    rt.current_ts - interval '26 hours',
    rt.current_ts - interval '20 minutes'
  from reservation_times rt

  union all

  select
    '40000000-0000-4000-8000-000000000006'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid,
    rt.today_start + interval '6 days' + interval '16 hours',
    rt.today_start + interval '6 days' + interval '18 hours',
    rt.today_start + interval '5 days' + interval '16 hours',
    null::timestamptz,
    null::timestamptz,
    'CANCELLED'::public.reservation_status,
    110::double precision,
    2,
    rt.today_start - interval '4 days',
    rt.today_start - interval '3 days'
  from reservation_times rt

  union all

  select
    '40000000-0000-4000-8000-000000000007'::uuid,
    '20000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid,
    rt.today_start - interval '2 days' + interval '16 hours',
    rt.today_start - interval '2 days' + interval '18 hours',
    rt.today_start - interval '3 days' + interval '16 hours',
    null::timestamptz,
    null::timestamptz,
    'CONFIRMED'::public.reservation_status,
    110::double precision,
    1,
    rt.today_start - interval '4 days',
    rt.today_start - interval '2 days'
  from reservation_times rt
) seeded_reservations;

alter table public.reservations enable trigger validate_and_price_reservation;

insert into public.reservation_payments (
  id,
  reservation_id,
  renter_id,
  host_user_id,
  listing_id,
  stripe_checkout_session_id,
  stripe_payment_intent_id,
  stripe_charge_id,
  amount_subtotal,
  amount_platform_fee,
  amount_total,
  currency,
  status,
  authorized_at,
  authorization_expires_at,
  paid_at,
  captured_at,
  canceled_at,
  created_at,
  updated_at
)
values
  (
    '41000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'cs_test_seed_1',
    'pi_test_seed_1',
    'ch_test_seed_1',
    10500,
    788,
    11288,
    'cad',
    'PAID'::public.payment_status,
    now() - interval '8 days',
    null,
    now() - interval '8 days',
    now() - interval '8 days',
    null,
    now() - interval '8 days',
    now() - interval '8 days'
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'cs_test_seed_2',
    'pi_test_seed_2',
    null,
    10500,
    788,
    11288,
    'cad',
    'AUTH'::public.payment_status,
    now() - interval '1 day',
    now() + interval '5 days',
    null,
    null,
    null,
    now() - interval '1 day',
    now() - interval '1 day'
  ),
  (
    '41000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    'cs_test_seed_3',
    'pi_test_seed_3',
    null,
    16500,
    1238,
    17738,
    'cad',
    'AUTH'::public.payment_status,
    now() - interval '30 hours',
    now() + interval '4 days',
    null,
    null,
    null,
    now() - interval '30 hours',
    now() - interval '30 minutes'
  ),
  (
    '41000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    'cs_test_seed_4',
    'pi_test_seed_4',
    null,
    11000,
    825,
    11825,
    'cad',
    'AUTH'::public.payment_status,
    now() - interval '26 hours',
    now() + interval '4 days',
    null,
    null,
    null,
    now() - interval '26 hours',
    now() - interval '20 minutes'
  ),
  (
    '41000000-0000-4000-8000-000000000005',
    '40000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    'cs_test_seed_5',
    'pi_test_seed_5',
    null,
    11000,
    825,
    11825,
    'cad',
    'AUTH_CANCELED'::public.payment_status,
    now() - interval '4 days',
    null,
    null,
    null,
    now() - interval '3 days',
    now() - interval '4 days',
    now() - interval '3 days'
  ),
  (
    '41000000-0000-4000-8000-000000000006',
    '40000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000002',
    'cs_test_seed_6',
    'pi_test_seed_6',
    'ch_test_seed_6',
    11000,
    825,
    11825,
    'cad',
    'PAID'::public.payment_status,
    now() - interval '4 days',
    null,
    now() - interval '4 days',
    now() - interval '4 days',
    null,
    now() - interval '4 days',
    now() - interval '2 days'
  );

-- ---------------------------------------------------------------------------
-- Chats and messages tied to reservations/listings.
-- ---------------------------------------------------------------------------
insert into public.chats (id, chat_type, metadata, listing_id, status)
values
  (
    '50000000-0000-4000-8000-000000000001',
    'DIRECT',
    '{}'::jsonb,
    '20000000-0000-4000-8000-000000000001',
    'ACTIVE'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    'DIRECT',
    '{}'::jsonb,
    '20000000-0000-4000-8000-000000000002',
    'ACTIVE'
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    'DIRECT',
    '{}'::jsonb,
    '20000000-0000-4000-8000-000000000001',
    'ACTIVE'
  );

insert into public.chat_participants (chat_id, participant_id, metadata)
values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '{}'::jsonb),
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', '{}'::jsonb),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '{}'::jsonb),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', '{}'::jsonb),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '{}'::jsonb),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', '{}'::jsonb);

with message_times as (
  select date_trunc('day', now()) as today_start
)
insert into public.chat_messages (id, sender_id, chat_id, contents, created_at, metadata, status)
select * from (
  select
    '51000000-0000-4000-8000-000000000001'::uuid,
    '10000000-0000-4000-8000-000000000002'::uuid,
    '50000000-0000-4000-8000-000000000001'::uuid,
    'Thanks again for booking the loft. Let me know if you want me to leave the extra snare stand out.',
    mt.today_start - interval '6 days' + interval '11 hours',
    '{}'::jsonb,
    'ACTIVE'::public.record_status
  from message_times mt

  union all

  select
    '51000000-0000-4000-8000-000000000002'::uuid,
    '10000000-0000-4000-8000-000000000004'::uuid,
    '50000000-0000-4000-8000-000000000001'::uuid,
    'That would be perfect. The room sounded great for our drum takes.',
    mt.today_start - interval '5 days' + interval '22 hours',
    '{}'::jsonb,
    'ACTIVE'::public.record_status
  from message_times mt

  union all

  select
    '51000000-0000-4000-8000-000000000003'::uuid,
    '10000000-0000-4000-8000-000000000003'::uuid,
    '50000000-0000-4000-8000-000000000002'::uuid,
    'Your session is wrapped up. If you need stems exported, I can send them over tonight.',
    mt.today_start - interval '1 day' + interval '20 hours',
    '{}'::jsonb,
    'ACTIVE'::public.record_status
  from message_times mt

  union all

  select
    '51000000-0000-4000-8000-000000000004'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid,
    '50000000-0000-4000-8000-000000000002'::uuid,
    'Amazing, thanks. I still need to leave you a review too.',
    mt.today_start - interval '1 day' + interval '21 hours',
    '{}'::jsonb,
    'ACTIVE'::public.record_status
  from message_times mt

  union all

  select
    '51000000-0000-4000-8000-000000000005'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid,
    '50000000-0000-4000-8000-000000000003'::uuid,
    'Hey Mona, I just sent a reservation request for Friday evening.',
    mt.today_start + interval '1 hour',
    '{}'::jsonb,
    'ACTIVE'::public.record_status
  from message_times mt
) seeded_messages;

-- ---------------------------------------------------------------------------
-- Reservation-backed reviews for the completed Loft stay.
-- ---------------------------------------------------------------------------
insert into public.reservation_reviews (
  id,
  reservation_id,
  listing_id,
  reviewer_user_id,
  reviewee_user_id,
  reviewer_role,
  rating,
  text,
  status,
  created_at,
  updated_at
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    'BOOKER_TO_HOST',
    4.8,
    'Mona was responsive, the room was exactly as described, and the kit setup made load-in super easy.',
    'ACTIVE',
    now() - interval '4 days',
    now() - interval '4 days'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000004',
    'HOST_TO_BOOKER',
    5.0,
    'Gina and her band were punctual, respectful, and left the room in excellent shape.',
    'ACTIVE',
    now() - interval '4 days' + interval '30 minutes',
    now() - interval '4 days' + interval '30 minutes'
  );

-- ---------------------------------------------------------------------------
-- Notifications feed with examples of each major notification type.
-- Review reminders are only created for the completed stay with no review.
-- ---------------------------------------------------------------------------
insert into public.notifications (
  id,
  user_id,
  type,
  title,
  body,
  action_url,
  entity_type,
  entity_id,
  payload,
  is_read,
  read_at,
  status,
  created_at
)
values
  (
    '70000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'listing_approved',
    'Listing approved',
    'Downtown Drum Loft is now live on AirDrums.',
    '/host/dashboard',
    'listing',
    '20000000-0000-4000-8000-000000000001',
    jsonb_build_object('listing_id', '20000000-0000-4000-8000-000000000001', 'moderation_status', 'APPROVED'),
    true,
    now() - interval '19 days',
    'ACTIVE',
    now() - interval '19 days'
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    'listing_rejected',
    'Listing rejected',
    'Basement Jam Den needs brighter photos and better access details before it can go live.',
    '/host/edit-listing/20000000-0000-4000-8000-000000000004',
    'listing',
    '20000000-0000-4000-8000-000000000004',
    jsonb_build_object('listing_id', '20000000-0000-4000-8000-000000000004', 'moderation_status', 'REJECTED'),
    false,
    null,
    'ACTIVE',
    now() - interval '3 days'
  ),
  (
    '70000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'reservation_created',
    'New reservation request',
    'Downtown Drum Loft has a new reservation request.',
    '/reservation/40000000-0000-4000-8000-000000000002',
    'reservation',
    '40000000-0000-4000-8000-000000000002',
    jsonb_build_object('reservation_id', '40000000-0000-4000-8000-000000000002', 'listing_id', '20000000-0000-4000-8000-000000000001'),
    false,
    null,
    'ACTIVE',
    now() - interval '1 day'
  ),
  (
    '70000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000004',
    'reservation_confirmed',
    'Reservation confirmed',
    'Your reservation for Night Owl Studio has been confirmed.',
    '/reservation/40000000-0000-4000-8000-000000000003',
    'reservation',
    '40000000-0000-4000-8000-000000000003',
    jsonb_build_object('reservation_id', '40000000-0000-4000-8000-000000000003', 'listing_id', '20000000-0000-4000-8000-000000000002'),
    false,
    null,
    'ACTIVE',
    now() - interval '2 days'
  ),
  (
    '70000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000005',
    'reservation_cancelled',
    'Reservation cancelled',
    'Your reservation for Night Owl Studio was cancelled by the host.',
    '/reservation/40000000-0000-4000-8000-000000000004',
    'reservation',
    '40000000-0000-4000-8000-000000000004',
    jsonb_build_object('reservation_id', '40000000-0000-4000-8000-000000000004', 'listing_id', '20000000-0000-4000-8000-000000000002'),
    true,
    now() - interval '3 days',
    'ACTIVE',
    now() - interval '3 days'
  ),
  (
    '70000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000002',
    'chat_message',
    'New message about Downtown Drum Loft',
    'Sam Walker: Hey Mona, I just sent a reservation request for Friday evening.',
    '/chat',
    'chat',
    '50000000-0000-4000-8000-000000000003',
    jsonb_build_object('chat_id', '50000000-0000-4000-8000-000000000003', 'listing_id', '20000000-0000-4000-8000-000000000001', 'sender_id', '10000000-0000-4000-8000-000000000005'),
    false,
    null,
    'ACTIVE',
    now() - interval '2 hours'
  ),
  (
    '70000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000002',
    'review_received',
    'New review received',
    'A guest left you a review.',
    '/profile/10000000-0000-4000-8000-000000000002',
    'review',
    '60000000-0000-4000-8000-000000000001',
    jsonb_build_object('review_id', '60000000-0000-4000-8000-000000000001', 'reservation_id', '40000000-0000-4000-8000-000000000001'),
    false,
    null,
    'ACTIVE',
    now() - interval '4 days'
  ),
  (
    '70000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000004',
    'review_received',
    'New review received',
    'A host left you a review.',
    '/profile/10000000-0000-4000-8000-000000000004',
    'review',
    '60000000-0000-4000-8000-000000000002',
    jsonb_build_object('review_id', '60000000-0000-4000-8000-000000000002', 'reservation_id', '40000000-0000-4000-8000-000000000001'),
    false,
    null,
    'ACTIVE',
    now() - interval '4 days' + interval '30 minutes'
  ),
  (
    '70000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000003',
    'review_reminder',
    'Leave a review for your guest',
    'Your session for Night Owl Studio has ended. Share feedback for Sam Walker.',
    '/reservation/40000000-0000-4000-8000-000000000005?leaveReview=1',
    'reservation',
    '40000000-0000-4000-8000-000000000005',
    jsonb_build_object(
      'reservation_id', '40000000-0000-4000-8000-000000000005',
      'listing_id', '20000000-0000-4000-8000-000000000002',
      'reviewer_role', 'HOST_TO_BOOKER',
      'reviewee_user_id', '10000000-0000-4000-8000-000000000005',
      'reviewee_display_name', 'Sam Walker',
      'expires_at', now() + interval '12 days'
    ),
    false,
    null,
    'ACTIVE',
    now() - interval '1 day'
  ),
  (
    '70000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000005',
    'review_reminder',
    'Leave a review for your host',
    'Your reservation for Night Owl Studio has ended. Share feedback for Leo Park.',
    '/reservation/40000000-0000-4000-8000-000000000005?leaveReview=1',
    'reservation',
    '40000000-0000-4000-8000-000000000005',
    jsonb_build_object(
      'reservation_id', '40000000-0000-4000-8000-000000000005',
      'listing_id', '20000000-0000-4000-8000-000000000002',
      'reviewer_role', 'BOOKER_TO_HOST',
      'reviewee_user_id', '10000000-0000-4000-8000-000000000003',
      'reviewee_display_name', 'Leo Park',
      'expires_at', now() + interval '12 days'
    ),
    false,
    null,
    'ACTIVE',
    now() - interval '1 day'
  );

commit;
