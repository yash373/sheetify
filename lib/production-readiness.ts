export type ProductionMode = "demo" | "live" | "degraded";

export type ConfigurationStatus = "ready" | "missing" | "invalid";

export type ConfigurationCheck = {
  status: ConfigurationStatus;
  variables: readonly string[];
};

export type ProductionReadiness = {
  status: "ok" | "degraded";
  mode: ProductionMode;
  checks: {
    jamendo: ConfigurationCheck;
    database: ConfigurationCheck;
    basicPitch: ConfigurationCheck;
  };
};

type Environment = Readonly<Record<string, string | undefined>>;

function configured(value: string | undefined) {
  return value !== undefined && value.trim().length > 0;
}

function checkRequiredVariable(environment: Environment, variable: string): ConfigurationCheck {
  const value = environment[variable];
  if (value === undefined) return { status: "missing", variables: [variable] };
  return { status: configured(value) ? "ready" : "invalid", variables: [variable] };
}

function checkDatabase(environment: Environment): ConfigurationCheck {
  const variable = environment.NEON_DATABASE_URL !== undefined ? "NEON_DATABASE_URL" : "DATABASE_URL";
  const value = environment[variable];
  if (value === undefined) return { status: "missing", variables: ["NEON_DATABASE_URL", "DATABASE_URL"] };

  try {
    const url = new URL(value);
    const validProtocol = url.protocol === "postgres:" || url.protocol === "postgresql:";
    return { status: validProtocol && Boolean(url.hostname) ? "ready" : "invalid", variables: [variable] };
  } catch {
    return { status: "invalid", variables: [variable] };
  }
}

function checkBasicPitch(environment: Environment): ConfigurationCheck {
  const endpoint = environment.BASIC_PITCH_ENDPOINT;
  if (endpoint === undefined) return { status: "missing", variables: ["BASIC_PITCH_ENDPOINT"] };

  try {
    const url = new URL(endpoint);
    const validEndpoint = url.protocol === "https:" && Boolean(url.hostname);
    const validApiName = environment.BASIC_PITCH_API_NAME === undefined || configured(environment.BASIC_PITCH_API_NAME);
    const variables = environment.BASIC_PITCH_API_NAME === undefined
      ? ["BASIC_PITCH_ENDPOINT"]
      : ["BASIC_PITCH_ENDPOINT", "BASIC_PITCH_API_NAME"];
    return { status: validEndpoint && validApiName ? "ready" : "invalid", variables };
  } catch {
    return { status: "invalid", variables: ["BASIC_PITCH_ENDPOINT"] };
  }
}

export function getProductionReadiness(environment: Environment = process.env): ProductionReadiness {
  const checks = {
    jamendo: checkRequiredVariable(environment, "JAMENDO_CLIENT_ID"),
    database: checkDatabase(environment),
    basicPitch: checkBasicPitch(environment),
  };
  const statuses = Object.values(checks).map((check) => check.status);
  const mode: ProductionMode = statuses.every((status) => status === "missing")
    ? "demo"
    : statuses.every((status) => status === "ready")
      ? "live"
      : "degraded";

  return {
    status: mode === "degraded" ? "degraded" : "ok",
    mode,
    checks,
  };
}
