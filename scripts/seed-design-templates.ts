import { getDb } from "@/lib/db";
import { syncDesignTemplates } from "@/lib/templates";

async function main() {
  const templates = await syncDesignTemplates();
  process.stdout.write(`Seeded ${templates.length} design templates.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`Failed to seed design templates. ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDb().$disconnect();
  });
