import { TextDecoder, TextEncoder } from "node:util";

/// What jsdom leaves out and the database driver needs; imported first by jsdom tests.
Object.assign(globalThis, { TextEncoder, TextDecoder });
