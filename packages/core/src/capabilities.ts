import { env } from "./env.js";

const isHosted = env.DEPLOYMENT_MODE === "hosted";

export const capabilities = Object.freeze({
  bankSync: isHosted,
  multiAccount: isHosted,
  cloudSync: isHosted,
  billing: isHosted,
});
