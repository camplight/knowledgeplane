import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const repoRoot = resolve(pkgRoot, "../..");

// Match `dotenv-cli -e ../../.env -e .env.dev` so `npm start` (no CLI) still loads the same files.
config({ path: resolve(repoRoot, ".env") });
config({ path: resolve(pkgRoot, ".env.dev") });
