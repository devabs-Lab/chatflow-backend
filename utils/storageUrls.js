const supabase = require("../config/supabase");

const BUCKET_NAME = "chat-files";
const AVATAR_URL_EXPIRES_IN = 60 * 60 * 24 * 7;

const isUsableUrl = (value) =>
  typeof value === "string" &&
  (value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:"));

async function createSignedStorageUrl(path, expiresIn = AVATAR_URL_EXPIRES_IN) {
  if (!path || isUsableUrl(path)) return path || null;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error("Failed to create signed storage URL:", error);
    return null;
  }

  return data.signedUrl;
}

async function addSignedAvatarUrl(user) {
  if (!user) return user;

  return {
    ...user,
    avatar_url: await createSignedStorageUrl(user.avatar_url),
  };
}

async function addSignedAvatarUrls(users) {
  return Promise.all(users.map(addSignedAvatarUrl));
}

module.exports = {
  createSignedStorageUrl,
  addSignedAvatarUrl,
  addSignedAvatarUrls,
};
