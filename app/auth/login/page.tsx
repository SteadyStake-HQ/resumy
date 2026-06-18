import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { authOptions } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/profile");
  }

  return (
    <AuthShell mode="login">
      <LoginForm />
    </AuthShell>
  );
}
