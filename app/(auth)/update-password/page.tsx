import { AuthForm } from "@/components/auth-form";
import { requireUser } from "@/lib/auth/session";

export default async function Page() {
  await requireUser();
  return <AuthForm mode="update-password" />;
}
