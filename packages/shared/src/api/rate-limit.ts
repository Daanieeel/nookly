/// What the server answers once there have been too many requests. The apps read from it
/// how long to wait.
export const tooManyRequests = (seconds: number) =>
  `Too many requests. Try again in ${seconds} seconds.`;

const WAIT = /^Too many requests\. Try again in (\d+) seconds\.$/;

/// The seconds a failure says to wait, or null when it is about something else.
export function retryAfterSeconds(message: string): number | null {
  const found = WAIT.exec(message);
  return found ? Number(found[1]) : null;
}
