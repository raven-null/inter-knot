-- 论坛核心表结构（Netlify Database / Postgres）
-- 说明：document_id 为对外暴露的稳定 ID（base62），id 为内部自增主键。

CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  document_id     TEXT NOT NULL UNIQUE,
  username        TEXT NOT NULL UNIQUE,
  email           TEXT UNIQUE,
  password_hash   TEXT,
  name            TEXT NOT NULL DEFAULT '',
  bio             TEXT NOT NULL DEFAULT '',
  avatar_url      TEXT NOT NULL DEFAULT '',
  level           INT  NOT NULL DEFAULT 1,
  exp             INT  NOT NULL DEFAULT 0,
  role            TEXT NOT NULL DEFAULT 'user',        -- user / moderator / admin
  status          TEXT NOT NULL DEFAULT 'active',      -- active / banned
  profile_hidden  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id            BIGSERIAL PRIMARY KEY,
  document_id   TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL UNIQUE,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL DEFAULT '',
  icon          TEXT NOT NULL DEFAULT '',
  sort_order    INT  NOT NULL DEFAULT 0,
  is_hidden     BOOLEAN NOT NULL DEFAULT false,
  is_admin_only BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posts (
  id               BIGSERIAL PRIMARY KEY,
  document_id      TEXT NOT NULL UNIQUE,
  category_id      BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  author_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  text             TEXT NOT NULL DEFAULT '',
  body             TEXT NOT NULL DEFAULT '',           -- 渲染后的 HTML（可选）
  covers           TEXT[] NOT NULL DEFAULT '{}',       -- 封面 URL 数组
  cover_width      INT,
  cover_height     INT,
  external_videos  JSONB,
  editor_state     JSONB,
  status           TEXT NOT NULL DEFAULT 'published',  -- published / pending / draft / deleted
  is_pinned        BOOLEAN NOT NULL DEFAULT false,
  is_anonymous     BOOLEAN NOT NULL DEFAULT false,
  is_hidden        BOOLEAN NOT NULL DEFAULT false,
  views            INT NOT NULL DEFAULT 0,
  likes_count      INT NOT NULL DEFAULT 0,
  comments_count   INT NOT NULL DEFAULT 0,
  favorites_count  INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_posts_feed       ON posts(status, is_hidden, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category   ON posts(category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author     ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_search     ON posts USING gin (to_tsvector('simple', title || ' ' || text));

CREATE TABLE IF NOT EXISTS comments (
  id           BIGSERIAL PRIMARY KEY,
  document_id  TEXT NOT NULL UNIQUE,
  post_id      BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  parent_id    BIGINT REFERENCES comments(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  images       TEXT[] NOT NULL DEFAULT '{}',
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  likes_count  INT NOT NULL DEFAULT 0,
  floor        INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS likes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT   NOT NULL,                        -- article / comment
  target_id   BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_type, target_id);

CREATE TABLE IF NOT EXISTS favorites (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS follows (
  id           BIGSERIAL PRIMARY KEY,
  follower_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS user_blocks (
  id         BIGSERIAL PRIMARY KEY,
  blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id          BIGSERIAL PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE,
  reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,                          -- article / comment / user
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  detail      TEXT,
  status      TEXT NOT NULL DEFAULT 'open',           -- open / resolved / dismissed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uploads (
  id          BIGSERIAL PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE,
  owner_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  object_key  TEXT NOT NULL UNIQUE,                   -- Blobs key，WebP
  name        TEXT NOT NULL DEFAULT '',
  mime        TEXT NOT NULL DEFAULT 'image/webp',
  size        INT NOT NULL DEFAULT 0,
  width       INT,
  height      INT,
  url         TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS read_records (
  id      BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL,                           -- register / reset / bind
  code       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_verification_email ON verification_codes(email, purpose);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
