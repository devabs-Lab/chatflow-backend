-----------------------------------
-- Group photo, pinned message, and per-admin delete rights (session 12)
--
-- Three nullable/defaulted columns. Additive and idempotent — nothing is
-- dropped, renamed or rewritten, so this is safe to run more than once.
--
-- Deliberately NOT here, because the schema already supports them:
--   * message edit/delete  -> messages.edited_at + messages.is_deleted
--   * replies              -> messages.parent_message_id
--   * reactions            -> the message_reactions table already exists
--     (id, message_id, user_id, emoji, created_at) and was simply unused.
-----------------------------------

-- Group photo. Stores the storage path; the API signs it on the way out,
-- the same way user avatars work.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- The group's pinned message. One at a time, like the pinned bar in
-- Telegram. ON DELETE SET NULL so deleting the message just unpins it.
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Per-admin moderation right. The owner always has it implicitly; this is
-- how the owner grants it to an individual admin, which is what "the owner
-- or the admin if the owner gives him access" requires — being an admin is
-- not by itself permission to delete other people's messages.
ALTER TABLE group_members
  ADD COLUMN IF NOT EXISTS can_delete_messages BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id
  ON message_reactions(message_id);
