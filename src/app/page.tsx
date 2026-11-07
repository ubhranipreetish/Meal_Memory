import { redirect } from "next/navigation";

// Middleware sends unauthenticated users to /login; authenticated users land
// on /home (which routes to /onboarding if no profile exists yet).
// The design prototype lives at /preview — it must never sit on the app's
// front door, where its sample numbers read as the user's real day.
export default function RootPage() {
  redirect("/home");
}
