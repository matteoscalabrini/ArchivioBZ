-- The cloud tables of the edit mode. Separate from the old mirror in library/db/schema.sql.
-- The draft is one row: the archive document being edited, and its version, which rises at every save.
-- Documents are json, not jsonb: json keeps the text as written, so every object comes back with its
-- keys in their order (the vocabulary's order is what "All keywords" and the map's places show);
-- jsonb sorts them by length. No statement reads inside a document.
create table if not exists draft (id smallint primary key default 1 check (id = 1), version integer not null, doc json not null, saved_at timestamptz not null default now());
-- Every publish, and every draft set aside by a restore; the latest 'publish' is what the site shows.
create table if not exists publishes (id serial primary key, at timestamptz not null default now(), kind text not null check (kind in ('publish', 'set-aside')), doc json not null, summary text);
-- The four public files as rendered at the last publish.
create table if not exists site_files (path text primary key, body text not null, content_type text not null, publish_id integer not null references publishes (id));
-- One row per login try, written before its password is checked and deleted when it proves right or
-- is refused, so what stays is the failures; counted over a window to refuse a flood.
create table if not exists login_failures (id bigserial primary key, at timestamptz not null default now());
