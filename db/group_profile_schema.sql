-----------------------------------
-- Group profile + shareable invite links (session 11)
--
-- Purely additive and idempotent: one nullable column on `groups` and one
-- new table. Nothing is dropped, renamed, or rewritten, so it is safe to
-- run against the production database more than once.
-----------------------------------

-----------------------------------
-- Public @username for a group (Telegram-style handle).
-- Nullable: existing groups simply have none until one is set.
-- Case-insensitive uniqueness is enforced by the index below rather than a
-- UNIQUE constraint, so "MyGroup" and "mygroup" can't both exist.
-----------------------------------
ALTER TABLE groups ADD COLUMN IF NOT EXISTS username VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_username_lower
  ON groups (LOWER(username))
  WHERE username IS NOT NULL;

-----------------------------------
-- Invite links. A row per link, so a link can be revoked or expired
-- without touching the group itself, and several can coexist (Telegram
-- allows a primary link plus additional named ones).
--
-- expires_at NULL  = never expires
-- max_uses   NULL  = unlimited uses
-----------------------------------
CREATE TABLE IF NOT EXISTS group_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    created_by UUID REFERENCES users(userid) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    max_uses INTEGER,
    uses INTEGER NOT NULL DEFAULT 0,
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token);
CREATE INDEX IF NOT EXISTS idx_group_invites_group_id ON group_invites(group_id);
