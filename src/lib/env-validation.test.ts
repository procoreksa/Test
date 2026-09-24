import { describe, it, expect } from "vitest";
import { validateProductionEnvironment, assertValidProductionEnvironment, ProductionEnvironmentError } from "./env-validation";

const VALID_ENV: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@host:5432/db",
  DIRECT_URL: "postgresql://user:pass@host:5432/db",
  AUTH_SECRET: "a-real-32-byte-random-secret-value",
  AUTOMATION_WORKER_SECRET: "another-real-random-secret-value",
  DOCUMENT_S3_ENDPOINT: "https://s3.example.com",
  DOCUMENT_S3_REGION: "us-east-1",
  DOCUMENT_S3_BUCKET: "my-bucket",
  DOCUMENT_S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
  DOCUMENT_S3_SECRET_ACCESS_KEY: "secret-access-key-value",
};

describe("validateProductionEnvironment", () => {
  it("passes with a fully valid production configuration", () => {
    const result = validateProductionEnvironment(VALID_ENV);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("fails when DATABASE_URL is missing", () => {
    const env: Record<string, string | undefined> = { ...VALID_ENV };
    delete env.DATABASE_URL;
    const result = validateProductionEnvironment(env);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.variable === "DATABASE_URL")).toBe(true);
  });

  it("fails closed when AUTH_SECRET is the .env.example placeholder", () => {
    const result = validateProductionEnvironment({ ...VALID_ENV, AUTH_SECRET: "replace-with-a-random-32-byte-secret" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.variable === "AUTH_SECRET")).toBe(true);
  });

  it("fails closed when AUTH_SECRET is too short", () => {
    const result = validateProductionEnvironment({ ...VALID_ENV, AUTH_SECRET: "short" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.variable === "AUTH_SECRET")).toBe(true);
  });

  it("fails closed when AUTOMATION_WORKER_SECRET is missing", () => {
    const env: Record<string, string | undefined> = { ...VALID_ENV };
    delete env.AUTOMATION_WORKER_SECRET;
    const result = validateProductionEnvironment(env);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.variable === "AUTOMATION_WORKER_SECRET")).toBe(true);
  });

  it("fails closed (rejects LOCAL_DEV) when no DOCUMENT_S3_* variables are set at all", () => {
    const env = { ...VALID_ENV };
    for (const key of ["DOCUMENT_S3_ENDPOINT", "DOCUMENT_S3_REGION", "DOCUMENT_S3_BUCKET", "DOCUMENT_S3_ACCESS_KEY_ID", "DOCUMENT_S3_SECRET_ACCESS_KEY"]) {
      delete (env as Record<string, string | undefined>)[key];
    }
    const result = validateProductionEnvironment(env);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.variable === "DOCUMENT_S3_*")).toBe(true);
  });

  it("fails on a partially-configured S3 storage block", () => {
    const env: Record<string, string | undefined> = { ...VALID_ENV };
    delete env.DOCUMENT_S3_SECRET_ACCESS_KEY;
    const result = validateProductionEnvironment(env);
    expect(result.ok).toBe(false);
    const issue = result.issues.find((i) => i.variable === "DOCUMENT_S3_*");
    expect(issue?.message).toContain("DOCUMENT_S3_SECRET_ACCESS_KEY");
  });

  it("does not require COMMUNICATIONS_WORKER_SECRET or ADMIN_SEED_SECRET", () => {
    const result = validateProductionEnvironment(VALID_ENV);
    expect(result.ok).toBe(true);
  });
});

describe("assertValidProductionEnvironment", () => {
  it("is a no-op outside production even with a completely empty environment", () => {
    expect(() => assertValidProductionEnvironment({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertValidProductionEnvironment({ NODE_ENV: "test" })).not.toThrow();
    expect(() => assertValidProductionEnvironment({})).not.toThrow();
  });

  it("throws ProductionEnvironmentError in production with an invalid configuration", () => {
    expect(() => assertValidProductionEnvironment({ NODE_ENV: "production" })).toThrow(ProductionEnvironmentError);
  });

  it("does not throw in production with a fully valid configuration", () => {
    expect(() => assertValidProductionEnvironment(VALID_ENV)).not.toThrow();
  });
});
