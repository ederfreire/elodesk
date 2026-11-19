// Per-user (per-browser) preference to disable system notifications & sounds.
// Stored in localStorage so each user controls their own browser.
export const NOTIF_DISABLED_KEY = "disableSystemNotifications";

export const areNotificationsDisabled = () => {
  try {
    return localStorage.getItem(NOTIF_DISABLED_KEY) === "true";
  } catch (_) {
    return false;
  }
};

export const setNotificationsDisabled = (disabled) => {
  try {
    localStorage.setItem(NOTIF_DISABLED_KEY, disabled ? "true" : "false");
    window.dispatchEvent(new Event("notificationPrefsChanged"));
  } catch (_) {}
};