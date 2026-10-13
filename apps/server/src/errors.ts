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

export const unauthorized = (message = "Sign in again.") =>
  new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have access to this.") =>
  new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
