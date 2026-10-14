import { afterAll } from "bun:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer } from "testcontainers";

// Every integration test runs against a real Postgres and a real S3 (MinIO):
// `TEST_DATABASE_URL` and `TEST_S3_ENDPOINT` when set (CI), else the ones
// `docker compose up` runs, else containers started for this run.
let postgres: StartedPostgreSqlContainer | null = null;
if (!process.env.TEST_DATABASE_URL) {
  postgres = await new PostgreSqlContainer("postgres:17-alpine").start();
  process.env.TEST_DATABASE_URL = postgres.getConnectionUri();
}

const MINIO =
  "cgr.dev/chainguard/minio@sha256:2136d593beacf4461187035eca949fe49abd589d5079735025c711ca58fee0c8";
let minio: StartedTestContainer | null = null;
const live = (endpoint: string) =>
  fetch(`${endpoint}/minio/health/live`)
    .then((r) => r.ok)
    .catch(() => false);
if (!process.env.TEST_S3_ENDPOINT && !(await live("http://127.0.0.1:9000"))) {
  minio = await new GenericContainer(MINIO)
    .withCommand(["server", "/data"])
    .withEnvironment({ MINIO_ROOT_USER: "nookly", MINIO_ROOT_PASSWORD: "nookly-dev-secret" })
    .withExposedPorts(9000)
    .start();
  process.env.TEST_S3_ENDPOINT = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
}

afterAll(async () => {
  await postgres?.stop();
  await minio?.stop();
});
