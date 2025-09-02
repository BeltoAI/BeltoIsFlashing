import { dbConnect } from "../src/lib/db";

async function main() {
  try {
    await dbConnect();
    console.log("✅ Connected to MongoDB Atlas");
    process.exit(0);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  }
}
main();
