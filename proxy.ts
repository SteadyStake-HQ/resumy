import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PROTECTED_PATHS = [
  "/profile",
  "/retail",
  "/history",
  "/design",
  "/membership",
  "/admin",
  "/compare",
] as const;

const SESSION_COOKIE_BASE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some(
    (protectedPath) =>
      pathname === protectedPath || pathname.startsWith(`${protectedPath}/`),
  );
}

function isSessionCookie(name: string) {
  return SESSION_COOKIE_BASE_NAMES.some(
    (cookieName) => name === cookieName || name.startsWith(`${cookieName}.`),
  );
}

function matchesCookieBase(name: string, cookieBaseName: string) {
  return name === cookieBaseName || name.startsWith(`${cookieBaseName}.`);
}

function stripSessionCookies(
  request: NextRequest,
  cookieBaseNames: readonly string[] = SESSION_COOKIE_BASE_NAMES,
) {
  const requestHeaders = new Headers(request.headers);
  const cookieHeader = requestHeaders.get("cookie");

  if (!cookieHeader) {
    return requestHeaders;
  }

  const filteredCookies = cookieHeader
    .split(/;\s*/)
    .filter(Boolean)
    .filter((cookie) => {
      const [name = ""] = cookie.split("=", 1);
      return !cookieBaseNames.some((cookieBaseName) =>
        matchesCookieBase(name, cookieBaseName),
      );
    })
    .join("; ");

  if (filteredCookies) {
    requestHeaders.set("cookie", filteredCookies);
  } else {
    requestHeaders.delete("cookie");
  }

  return requestHeaders;
}

function expireSessionCookies(
  request: NextRequest,
  response: NextResponse,
  cookieBaseNames: readonly string[] = SESSION_COOKIE_BASE_NAMES,
) {
  for (const { name } of request.cookies.getAll()) {
    if (
      !cookieBaseNames.some((cookieBaseName) =>
        matchesCookieBase(name, cookieBaseName),
      )
    ) {
      continue;
    }

    response.cookies.set({
      name,
      value: "",
      maxAge: 0,
      path: "/",
    });
  }
}

async function getJwtToken(request: NextRequest, secret: string) {
  const invalidCookieBaseNames = new Set<string>();

  for (const cookieName of SESSION_COOKIE_BASE_NAMES) {
    const hasCookie = request.cookies
      .getAll()
      .some((cookie) => matchesCookieBase(cookie.name, cookieName));

    if (!hasCookie) {
      continue;
    }

    try {
      const token = await getToken({
        req: request,
        secret,
        cookieName,
      });

      if (token) {
        return {
          token,
          invalidCookieBaseNames: Array.from(invalidCookieBaseNames),
        };
      }
    } catch (error) {
      invalidCookieBaseNames.add(cookieName);
      console.warn(`Failed to decode session cookie ${cookieName}.`, error);
    }
  }

  return {
    token: null,
    invalidCookieBaseNames: Array.from(invalidCookieBaseNames),
  };
}

function buildSignInUrl(request: NextRequest) {
  const signInUrl = new URL("/auth/login", request.url);
  const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  signInUrl.searchParams.set("callbackUrl", callbackUrl);
  return signInUrl;
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies
    .getAll()
    .some((cookie) => isSessionCookie(cookie.name));
  const secret = process.env.NEXTAUTH_SECRET?.trim();

  let token = null;
  const invalidCookieBaseNames = new Set<string>();

  if (hasSessionCookie && secret) {
    const sessionState = await getJwtToken(request, secret);
    token = sessionState.token;

    for (const cookieBaseName of sessionState.invalidCookieBaseNames) {
      invalidCookieBaseNames.add(cookieBaseName);
    }

    if (!sessionState.token && !invalidCookieBaseNames.size) {
      for (const cookieBaseName of SESSION_COOKIE_BASE_NAMES) {
        invalidCookieBaseNames.add(cookieBaseName);
      }
    }
  }

  if (invalidCookieBaseNames.size) {
    const cookieBasesToStrip = Array.from(invalidCookieBaseNames);

    if (isProtectedPath(pathname) && !token) {
      const response = NextResponse.redirect(buildSignInUrl(request));
      expireSessionCookies(request, response, cookieBasesToStrip);
      return response;
    }

    const response = NextResponse.next({
      request: {
        headers: stripSessionCookies(request, cookieBasesToStrip),
      },
    });

    expireSessionCookies(request, response, cookieBasesToStrip);
    return response;
  }

  if (!pathname.startsWith("/api") && isProtectedPath(pathname) && !token) {
    return NextResponse.redirect(buildSignInUrl(request));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)",
  ],
};
