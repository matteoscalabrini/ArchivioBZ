-- The archive's database (Neon Postgres, resource archiviobz-db). Rebuilt from the records in
-- git by library/db/sync.mjs; the media themselves are in the private Blob store archiviobz-media.

create table if not exists media (
  path text primary key,           -- repository path, also the blob's pathname
  size bigint not null,
  sha256 text,                     -- null when the file is no longer on disk
  content_type text,
  blob_url text not null,
  uploaded_at timestamptz not null,
  on_disk boolean not null
);

create table if not exists entries (
  no text primary key,             -- the row number, permanent once given
  section integer not null,
  title text not null,
  type text not null,
  date text,
  year integer,
  keywords text[] not null,
  place text,
  confidence text,                 -- read, secondary or lead
  rights text,
  holder text,
  creator text,
  source_url text,
  file text,                       -- repository path of the file the row holds
  folder text not null,            -- repository folder of its entries.json
  record jsonb not null            -- the record as written in entries.json
);

create table if not exists entry_media (
  no text not null references entries (no) on delete cascade,
  path text not null references media (path) on delete cascade,
  role text not null check (role in ('file', 'image')),
  position integer not null,
  caption text,
  primary key (no, role, position)
);

create table if not exists keywords (id text primary key, label text not null, data jsonb not null);

create table if not exists places (id text primary key, name text not null, lat double precision, lon double precision, data jsonb not null);

create table if not exists kinds (id text primary key, label text not null, types text[] not null);
