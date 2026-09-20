import { prisma } from "../src/lib/prisma";
import { seedDemoData } from "../src/lib/seed-demo-data";

async function main() {
  console.log("Seeding demo data...");
  await seedDemoData();
  console.log("Seed complete. Login with admin@demo-realestate.sa / Passw0rd!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
