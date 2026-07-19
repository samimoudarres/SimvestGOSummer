-- Simvest: Supabase / Postgres schema
-- Source of truth for runtime: json_documents (1:1 with former server/data/*.json files)
-- Normalized tables: populated by migrate/sync for readable Table Editor views

create extension if not exists "pgcrypto";

-- ── Document store (Express services read/write these) ─────────────────────
create table if not exists json_documents (
  name text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists json_documents_updated_at_idx on json_documents (updated_at desc);

-- ── Normalized: accounts & profiles ────────────────────────────────────────
create table if not exists user_accounts (
  user_id text primary key,
  first_name text not null default '',
  last_name text not null default '',
  contact_kind text not null check (contact_kind in ('email', 'phone')),
  contact text not null default '',
  contact_lower text not null,
  password_hash text not null,
  display_name text not null default '',
  avatar_url text not null default '',
  created_at timestamptz,
  updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb
);
create unique index if not exists user_accounts_contact_lower_idx on user_accounts (contact_lower);

create table if not exists user_profiles (
  user_id text primary key,
  display_name text not null default '',
  avatar_url text not null default '',
  joined_at timestamptz,
  raw jsonb not null default '{}'::jsonb
);

create table if not exists user_setup_profiles (
  user_id text not null,
  game_slug text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_slug)
);

-- ── Normalized: games ──────────────────────────────────────────────────────
create table if not exists game_definitions (
  slug text primary key,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists game_runtime_rules (
  slug text primary key,
  host_user_id text,
  title text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists user_game_membership (
  user_id text not null,
  game_slug text not null,
  joined_at timestamptz,
  primary key (user_id, game_slug)
);
create index if not exists user_game_membership_game_idx on user_game_membership (game_slug);

create table if not exists game_join_requests (
  id text primary key,
  game_slug text not null,
  user_id text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz
);
create index if not exists game_join_requests_game_idx on game_join_requests (game_slug);

-- ── Normalized: portfolio / ledger ─────────────────────────────────────────
create table if not exists user_game_cash (
  user_id text not null,
  game_slug text not null,
  cash numeric not null default 0,
  primary key (user_id, game_slug)
);

create table if not exists user_game_holdings (
  user_id text not null,
  game_slug text not null,
  ticker text not null,
  shares numeric not null default 0,
  avg_cost numeric,
  payload jsonb not null default '{}'::jsonb,
  primary key (user_id, game_slug, ticker)
);

create table if not exists user_game_lots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  game_slug text not null,
  ticker text not null,
  shares numeric not null,
  cost_basis numeric,
  opened_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists user_game_lots_user_game_idx on user_game_lots (user_id, game_slug);

-- ── Normalized: feed / social ──────────────────────────────────────────────
create table if not exists game_feed_posts (
  id text primary key,
  user_id text,
  game_slug text,
  post_kind text,
  posted_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists game_feed_posts_game_idx on game_feed_posts (game_slug, posted_at desc);

create table if not exists feed_post_likes (
  post_id text not null,
  user_id text not null,
  primary key (post_id, user_id)
);

create table if not exists feed_comments (
  id text primary key,
  post_id text not null,
  user_id text,
  body text,
  created_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists feed_comments_post_idx on feed_comments (post_id);

create table if not exists feed_comment_likes (
  comment_id text not null,
  user_id text not null,
  primary key (comment_id, user_id)
);

create table if not exists feed_poll_votes (
  post_id text not null,
  user_id text not null,
  option_id text not null,
  primary key (post_id, user_id)
);

create table if not exists follows (
  user_id text not null,
  game_slug text not null,
  ticker text not null,
  primary key (user_id, game_slug, ticker)
);

create table if not exists activity_author_notify_preferences (
  viewer_id text not null,
  author_id text not null,
  primary key (viewer_id, author_id)
);

-- ── Normalized: performance / caches / push ────────────────────────────────
create table if not exists game_networth_points (
  game_slug text not null,
  user_id text not null,
  captured_at timestamptz not null,
  net_worth numeric,
  payload jsonb not null default '{}'::jsonb,
  primary key (game_slug, user_id, captured_at)
);

create table if not exists game_final_snapshots (
  game_slug text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists perform_rank_streaks (
  game_slug text not null,
  user_id text not null,
  last_rank int,
  streak_days int,
  payload jsonb not null default '{}'::jsonb,
  primary key (game_slug, user_id)
);

create table if not exists leaderboard_rank_cache (
  game_slug text not null,
  user_id text not null,
  rank int,
  updated_at timestamptz,
  primary key (game_slug, user_id)
);

create table if not exists push_alert_dedup (
  dedup_key text primary key,
  sent_at timestamptz not null
);

create table if not exists finished_game_home_views (
  user_id text not null,
  game_slug text not null,
  view_count int not null default 0,
  primary key (user_id, game_slug)
);

create table if not exists web_push_subscriptions (
  user_id text not null,
  endpoint text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

create table if not exists native_push_tokens (
  user_id text primary key,
  token text not null,
  platform text,
  updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists app_secrets (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── RLS: deny anon/authenticated; service_role bypasses RLS ────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'json_documents',
    'user_accounts',
    'user_profiles',
    'user_setup_profiles',
    'game_definitions',
    'game_runtime_rules',
    'user_game_membership',
    'game_join_requests',
    'user_game_cash',
    'user_game_holdings',
    'user_game_lots',
    'game_feed_posts',
    'feed_post_likes',
    'feed_comments',
    'feed_comment_likes',
    'feed_poll_votes',
    'follows',
    'activity_author_notify_preferences',
    'game_networth_points',
    'game_final_snapshots',
    'perform_rank_streaks',
    'leaderboard_rank_cache',
    'push_alert_dedup',
    'finished_game_home_views',
    'web_push_subscriptions',
    'native_push_tokens',
    'app_secrets'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists deny_all_select on %I', t);
    execute format('create policy deny_all_select on %I for select using (false)', t);
    execute format('drop policy if exists deny_all_mod on %I', t);
    execute format(
      'create policy deny_all_mod on %I for all using (false) with check (false)',
      t
    );
  end loop;
end $$;
