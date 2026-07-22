-- ============================================================================
-- Seed data — the demo-seed module row + a small, COHERENT opening snapshot of
-- the M6.5 Wellington earthquake so the dashboard/map/feed are never empty even
-- before the loader runs. The demo-seed loader (`… src.main seed`) is the full
-- story: it DELETES these rows and inserts the complete ~5,000-signal scenario.
-- Keep these few rows earthquake-themed so `cloud-wire.sh` alone still shows a
-- consistent picture. Runs as postgres (bypasses RLS) via `supabase db reset`
-- locally; cloud-wire.sh applies it to the live project with psql.
-- NOT real emergency information.
-- ============================================================================

insert into public.modules (id, name, icon, description, enabled, last_seen)
values (
  'demo-seed',
  'Demo · Wellington Quake',
  'siren',
  'Reference module: seeds the M6.5 Wellington earthquake scenario and documents how the plugin system works.',
  true,
  now()
)
on conflict (id) do update
  set name = excluded.name, icon = excluded.icon, description = excluded.description;

insert into public.signals
  (observed_at, reported_at, source, source_type, signal_type, title, description,
   lat, lng, place_name, severity, verification, confidence, link, module_id, raw)
values
  (now() - interval '6 hours', now() - interval '6 hours',
   'GeoNet seismograph', 'sensor', 'earthquake',
   'M6.5 earthquake, 15 km deep, Wellington Fault',
   'Major earthquake on the Wellington Fault. Epicentre near the CBD. Severe shaking felt across the region; damage reports incoming.',
   -41.2865, 174.7762, 'Wellington CBD', 'extreme', 'verified', 0.99,
   'https://www.geonet.org.nz/earthquake', 'demo-seed', '{"magnitude": 6.5, "depth_km": 15, "mmi": 8}'::jsonb),

  (now() - interval '5 hours 50 minutes', now() - interval '5 hours 48 minutes',
   'Wellington Electricity', 'official', 'power-outage',
   'Widespread power outages across central Wellington',
   'Unplanned outages affecting an estimated 40,000+ customers across the CBD, Te Aro and Newtown after the mainshock. Crews assessing network damage.',
   -41.2940, 174.7770, 'Te Aro', 'severe', 'verified', 0.95,
   null, 'demo-seed', '{"customers_affected": 40000}'::jsonb),

  (now() - interval '5 hours 45 minutes', now() - interval '5 hours 40 minutes',
   'community report', 'community', 'liquefaction',
   'Liquefaction and surface flooding on reclaimed land, Waterfront',
   'Sand boils and grey silt reported across the waterfront and around the stadium. Ground water pooling; several vehicles stuck.',
   -41.2790, 174.7830, 'Wellington Waterfront', 'severe', 'corroborated', 0.75,
   null, 'demo-seed', '{"reports": 6}'::jsonb),

  (now() - interval '5 hours 40 minutes', now() - interval '5 hours 35 minutes',
   'WCC', 'official', 'road-closure',
   'SH1 Terrace Tunnel closed for structural assessment',
   'Terrace Tunnel closed in both directions pending engineering inspection. Traffic diverting via the waterfront quays. Expect major delays.',
   -41.2810, 174.7710, 'The Terrace', 'severe', 'verified', 0.97,
   null, 'demo-seed', null),

  (now() - interval '5 hours 30 minutes', now() - interval '5 hours 28 minutes',
   'GeoNet seismograph', 'sensor', 'aftershock',
   'M5.1 aftershock, 12 km deep, near Wellington',
   'Strong aftershock felt across the region. Further aftershocks likely over coming hours; expect additional damage to weakened structures.',
   -41.3000, 174.7800, 'Wellington', 'moderate', 'verified', 0.98,
   'https://www.geonet.org.nz/earthquake', 'demo-seed', '{"magnitude": 5.1, "depth_km": 12}'::jsonb),

  (now() - interval '5 hours 20 minutes', now() - interval '5 hours 15 minutes',
   'Wellington Free Ambulance', 'official', 'building-damage',
   'Partial facade collapse on a Cuba Street heritage building',
   'Masonry down onto the footpath outside a Cuba Street building. Cordon in place; USAR assessing. No confirmed casualties at this stage.',
   -41.2945, 174.7720, 'Cuba Street', 'severe', 'corroborated', 0.8,
   null, 'demo-seed', null);
