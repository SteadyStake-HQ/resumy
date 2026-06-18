import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AdminDashboard } from "@/components/admin-dashboard";
import { PageHero } from "@/components/page-hero";
import { AdminHeroMascot } from "@/components/profile/admin-hero-mascot";
import { isAdminEmail } from "@/lib/admin";
import { listAllArticles } from "@/lib/articles";
import { authOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/profile");
  }

  await connectToDatabase();

  const [users, articles] = await Promise.all([
    User.find({ "membership.requestStatus": "pending" })
      .sort({ "membership.requestDate": 1, createdAt: 1 })
      .select("email nickname membership")
      .lean(),
    listAllArticles(),
  ]);

  return (
    <PageHero
      volumeLabel="Vol. 09 · admin"
      title="admin panel ⚙"
      subtitle="manage membership requests, content, and platform settings."
      mascot={<AdminHeroMascot />}
    >
      <AdminDashboard
        initialRequests={users.map((user) => ({
          id: user._id.toString(),
          email: user.email,
          nickname: user.nickname ?? "",
          requestDate: user.membership?.requestDate
            ? new Date(user.membership.requestDate).toISOString()
            : null,
          requestedTier: user.membership?.requestedTier ?? "premium",
          requestReason: user.membership?.requestReason ?? "",
        }))}
        initialArticles={articles}
      />
    </PageHero>
  );
}
