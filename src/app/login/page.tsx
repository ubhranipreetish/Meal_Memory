import { cookies } from "next/headers";
import { SignInScreen } from "./SignInScreen";

export default async function LoginPage() {
  const cookieStore = await cookies();
  return <SignInScreen showTour={cookieStore.get("mm-tour")?.value !== "seen"} />;
}
