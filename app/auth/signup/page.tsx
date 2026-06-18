import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "@/components/signup-form";
import { authOptions } from "@/lib/auth";

export default async function SignupPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/profile");
  }

  return (
    <AuthShell mode="signup">
      <SignupForm />
    </AuthShell>
  );
}
