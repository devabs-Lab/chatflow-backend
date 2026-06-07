-----------------------------------
-- Group Member Last Read table
-----------------------------------
CREATE TABLE IF NOT EXISTS group_member_last_read (
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
);

-----------------------------------
-- Channel Member Last Read table
-----------------------------------
CREATE TABLE IF NOT EXISTS channel_member_last_read (
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
);

-----------------------------------
-- Indexes
-----------------------------------
CREATE INDEX IF NOT EXISTS idx_gmlr_group_user ON group_member_last_read(group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cmlr_channel_user ON channel_member_last_read(channel_id, user_id);
