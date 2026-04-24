import { createCookieSessionStorage } from "react-router";

export const { getSession, commitSession, destroySession } =
  createCookieSessionStorage({
    cookie: {
      name: "__cv_telemetry_session",
      httpOnly: true,
      maxAge: 86400, // 24 jam
      path: "/",
      sameSite: "lax",
      secrets: [process.env.SESSION_SECRET || "default_secret_key"],
      secure: process.env.NODE_ENV === "production",
    },
  });