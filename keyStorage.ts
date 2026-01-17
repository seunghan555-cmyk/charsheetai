
const STORAGE_KEY = "charsheet_ai_api_key";
const SALT = "CharSheet_AI_Secure_v1_";

// Simple obfuscation/encryption for local storage
// (Note: Client-side encryption without a user-provided password is never 100% secure against local attacks,
// but this prevents plain-text reading from localStorage inspector).
export const saveApiKey = (apiKey: string) => {
  if (!apiKey) return;
  try {
    const encrypted = btoa(SALT + apiKey);
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch (e) {
    console.error("Failed to save API key", e);
  }
};

export const getApiKey = (): string | null => {
  try {
    const encrypted = localStorage.getItem(STORAGE_KEY);
    if (!encrypted) return null;
    const decrypted = atob(encrypted);
    if (decrypted.startsWith(SALT)) {
      return decrypted.replace(SALT, "");
    }
    return null;
  } catch (e) {
    console.error("Failed to retrieve API key", e);
    return null;
  }
};

export const clearApiKey = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const hasApiKey = (): boolean => {
  return !!localStorage.getItem(STORAGE_KEY);
};
