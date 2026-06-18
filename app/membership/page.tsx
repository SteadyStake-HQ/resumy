import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { MembershipPanel } from "@/components/membership-panel";
import { PageHero } from "@/components/page-hero";
import { MembershipHeroMascot } from "@/components/profile/membership-hero-mascot";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { toSafeUser } from "@/lib/user";
import User from "@/models/User";

export default async function MembershipPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  await connectToDatabase();

  const user = await User.findById(session.user.id).lean();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <PageHero
      volumeLabel="Vol. 08 · membership"
      title="membership ★"
      subtitle="upgrade your plan and unlock the full toolkit."
      mascot={<MembershipHeroMascot />}
    >
      <MembershipPanel user={toSafeUser(user)} />
    </PageHero>
  );
}
