import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Workspace scripts execute from packages/core, so resolve the repository root
// relative to this module instead of relying on the process working directory.
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
