import { Request, Response } from "express";
import { randomBytes } from "crypto";
import {
  buildGoogleAuthUrl,
  handleGoogleCallback
} from "../services/GoogleAuthService/GoogleAuthFlow";
import { SendRefreshToken } from "../helpers/SendRefreshToken";
import logger from "../utils/logger";

// In-memory short-lived store for one-time codes returned to the frontend.
// Map<oneTimeCode, { payload, expiresAt }>
const handoff = new Map<string, { payload: any; expiresAt: number }>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes (signup needs time to complete form)

const cleanup = () => {
  const now = Date.now();
  for (const [k, v] of handoff.entries()) {
    if (v.expiresAt < now) handoff.delete(k);
  }
};

/**
 * Validates that a google one-time code was issued for `email` with
 * action "needs_signup" and consumes it. Used by UserController.store
 * to bypass the e-mail verification step when the user came from Google.
 */
export const consumeGoogleSignupCode = (
  code: string,
  email: string
): boolean => {
  cleanup();
  const entry = handoff.get(String(code));
  if (!entry) return false;
  const { payload } = entry;
  if (payload?.action !== "needs_signup") return false;
  if (
    String(payload.email || "").toLowerCase().trim() !==
    String(email || "").toLowerCase().trim()
  ) {
    return false;
  }
  handoff.delete(String(code));
  return true;
};

// =========================================================
// GET /auth/google  -> redirect to Google's consent screen
// =========================================================
export const start = async (req: Request, res: Response): Promise<void> => {
  try {
    const mode =
      String(req.query.mode || "login") === "signup" ? "signup" : "login";
    const url = await buildGoogleAuthUrl(mode);
    res.redirect(url);
  } catch (err: any) {
    logger.error(`[GoogleLogin] start error: ${err.message}`);
    const frontend = (process.env.FRONTEND_URL || "/").replace(/\/$/, "");
    res.redirect(
      `${frontend}/login?googleError=${encodeURIComponent(err.message)}`
    );
  }
};

// =========================================================
// GET /auth/google/callback
//   - Google redirects here with ?code & ?state
//   - We exchange the code, look up the user, and stash the result
//     in a one-time handoff code, then redirect to frontend.
// =========================================================
export const callback = async (req: Request, res: Response): Promise<void> => {
  const frontend = (process.env.FRONTEND_URL || "/").replace(/\/$/, "");
  const { code, error } = req.query as Record<string, string>;

  if (error) {
    return void res.redirect(
      `${frontend}/login?googleError=${encodeURIComponent(error)}`
    );
  }
  if (!code) {
    return void res.redirect(
      `${frontend}/login?googleError=missing_code`
    );
  }

  try {
    cleanup();
    const result = await handleGoogleCallback(code);
    const oneTime = randomBytes(16).toString("hex");
    handoff.set(oneTime, {
      payload: result,
      expiresAt: Date.now() + TTL_MS
    });

    return void res.redirect(
      `${frontend}/login?googleCode=${oneTime}`
    );
  } catch (err: any) {
    logger.error(`[GoogleLogin] callback error: ${err.message}`);
    return void res.redirect(
      `${frontend}/login?googleError=${encodeURIComponent(err.message)}`
    );
  }
};

// =========================================================
// POST /auth/google/exchange  body: { code }
//   - Frontend exchanges the one-time code for the actual JWT + user
//   - Sets the refresh-token cookie (same as classic /auth/login)
// =========================================================
export const exchange = async (
  req: Request,
  res: Response
): Promise<Response> => {
  cleanup();
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "missing_code" });

  const entry = handoff.get(String(code));
  if (!entry) return res.status(400).json({ error: "invalid_or_expired_code" });
  handoff.delete(String(code));

  const { payload } = entry;


  // login
  if (payload.refreshToken) {
    SendRefreshToken(res, payload.refreshToken);
  }
  return res.json({
    action: "login",
    token: payload.token,
    user: payload.serializedUser
  });
};
