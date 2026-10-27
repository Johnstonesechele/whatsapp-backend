/**
 * The app's background, in one place.
 *
 * WHY THIS EXISTS
 *
 * The dashboard layout and the setup wizard both declared
 * `from-[#F7F9F8] via-white to-[#F7F9F8]`, but 50 page files underneath them
 * declared `from-[#F7F9F8] via-white to-gray-100` and painted their own
 * full-screen background. The layout's gradient was therefore invisible on
 * most pages: a child with `min-h-screen` and its own gradient covers it.
 *
 * That is why "the wizard background should match the dashboard" was not
 * answerable by editing two files - there were already at least five different
 * gradients in the tree, including slate, purple and cyan.
 *
 * A page does not declare a background. It inherits the one its layout paints.
 * The value lives here so a future palette change is one edit, and so the
 * wizard and the dashboard cannot drift apart.
 */

/** Full-screen app background. The single source of truth. */
export const APP_BACKGROUND = "bg-[#F7F9F8] dark:bg-[#0B0C0F] text-gray-900 dark:text-white"

/** Panel surface used inside the app, on top of the background. */
export const APP_PANEL = "bg-white dark:bg-[#16181D] border-gray-200 dark:border-[#2D3139]/80 shadow-sm"

/** Page-level wrapper for a full-screen view outside the dashboard shell. */
export function appBackground(extra = "") {
  return `${APP_BACKGROUND}${extra ? " " + extra : ""}`
}
