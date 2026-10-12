// Callback destinations are deliberately limited to known application routes.
export function callbackDestination(next: string | null) {
  return next === "/update-password" ? next : "/dashboard";
}
