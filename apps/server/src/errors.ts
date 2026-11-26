/// An error the API reports as is: an HTTP status, a stable code and a message for people.
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/// Tells an app its session is over, and the app clears the device, released versions
/// included. Only for a device signed out from the devices list. Anything else that is
/// refused for want of a session is `lockedOut`.
export const unauthorized = (message = "Sign in again.") =>
  new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have access to this.") =>
  new HttpError(403, "forbidden", message);
/// A session that no longer works and that nobody asked to clear: the app keeps its data.
export const lockedOut = () =>
  forbidden(
    "This device is signed out of sync. Sign out and keep a local copy, then sign in again.",
  );
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
