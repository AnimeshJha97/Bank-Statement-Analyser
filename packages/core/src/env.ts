import "./configure-env.js";

export type DeploymentMode = "self-hosted" | "hosted";

function readDeploymentMode(value: string | undefined): DeploymentMode {
  const mode = value ?? "self-hosted";
  if (mode !== "self-hosted" && mode !== "hosted") {
    throw new Error(`Invalid DEPLOYMENT_MODE: ${mode}`);
  }
  return mode;
}

export const env = Object.freeze({
  DEPLOYMENT_MODE: readDeploymentMode(process.env.DEPLOYMENT_MODE),
});
