-- The cloud tables of the edit mode. Separate from the old mirror in library/db/schema.sql.
-- The draft is one row: the archive document being edited, and its version, which rises at every save.
create table if not exists draft (id smallint primary key default 1 check (id = 1), version integer not null, doc jsonb not null, saved_at timestamptz not null default now());
-- Every publish, and every draft set aside by a restore; the latest 'publish' is what the site shows.
create table if not exists publishes (id serial primary key, at timestamptz not null default now(), kind text not null check (kind in ('publish', 'set-aside')), doc jsonb not null, summary text);
-- The four public files as rendered at the last publish.
create table if not exists site_files (path text primary key, body text not null, content_type text not null, publish_id integer not null references publishes (id));
-- One row per failed login, counted over a window to refuse a flood.
create table if not exists login_failures (at timestamptz not null default now());
