/// Where better-auth really needs cookies: the browser round trip of a provider sign in.
const COOKIE_PATHS = ["/v1/auth/sign-in/social", "/v1/auth/callback/", "/v1/auth/link-social"];

/// The apps sign in with bearer tokens, but a phone's networking layer keeps the
/// cookie of an earlier response and sends it back with no Origin, which better-auth
/// refuses as a possible forgery ("Missing or null Origin"). Without the cookie the
/// request is judged on its token, as intended; provider sign in keeps its cookies.
export function withoutCookies(request: Request): Request {
  if (!request.headers.has("cookie")) return request;
  const path = new URL(request.url).pathname;
  if (COOKIE_PATHS.some((prefix) => path.startsWith(prefix))) return request;
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  return new Request(request, { headers });
}
