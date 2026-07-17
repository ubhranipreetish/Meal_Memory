import { redirect } from "next/navigation";

// Middleware sends unauthenticated users to /login; authenticated users land
// on /home (which routes to /onboarding if no profile exists yet).
export default function RootPage() {
  redirect("/home");
}
