export const accessCookiePrefix = "sheetify_job_";
export const accessCookieName = "sheetify_job_access";

export function accessTokenFromRequest(request: Request, jobId: string) {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  const direct = request.headers.get("x-job-access-token");
  if (direct) return direct;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieName = `${accessCookiePrefix}${jobId}=`;
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(cookieName));
  if (cookie) return cookie.slice(cookieName.length);
  return cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${accessCookieName}=`))?.slice(accessCookieName.length + 1) || undefined;
}

export function accessCookie(_jobId: string, token: string) {
  return `${accessCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800`;
}
