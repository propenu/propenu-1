const path = require("path");
require("dotenv").config({
  path: path.resolve(process.cwd(), process.env.ENV_FILE || ".env"),
});
const mongoose = require("mongoose");

const main = async () => {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) {
    throw new Error("MONGO_URI and MONGO_DB_NAME must be configured in the environment");
  }

  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
  const users = mongoose.connection.db.collection("users");
  const missing = { whatsappMarketingOptIn: { $exists: false } };
  const matchedCount = await users.countDocuments(missing);

  if (process.argv.includes("--apply")) {
    const result = await users.updateMany(missing, {
      $set: { whatsappMarketingOptIn: false },
    });
    console.log(
      JSON.stringify({
        database: dbName,
        mode: "applied",
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        fieldValue: false,
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        database: dbName,
        mode: "preview",
        documentsMissingField: matchedCount,
        nextStep: "Run with --apply to add the field as false to missing records",
      }),
    );
  }

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error.message || error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
