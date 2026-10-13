import { afterAll } from "bun:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

// Every integration test runs against a real Postgres: `TEST_DATABASE_URL` when set
// (CI's service container), otherwise one started in Docker for this run.
let container: StartedPostgreSqlContainer | null = null;
if (!process.env.TEST_DATABASE_URL) {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  process.env.TEST_DATABASE_URL = container.getConnectionUri();
}

afterAll(async () => {
  await container?.stop();
});
