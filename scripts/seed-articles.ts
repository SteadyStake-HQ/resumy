import { getDb } from "@/lib/db";
import { syncDefaultArticles } from "@/lib/articles";

async function main() {
  const articles = await syncDefaultArticles();
  process.stdout.write(`Seeded ${articles.length} default articles.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`Failed to seed articles. ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDb().$disconnect();
  });
