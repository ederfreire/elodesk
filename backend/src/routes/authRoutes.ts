import express from "express";
import isAuth from "../middleware/isAuth";
import * as UserController from "../controllers/UserController";
import * as SessionController from "../controllers/SessionController";
import * as PasswordResetController from "../controllers/PasswordResetController";
import * as SignupVerificationController from "../controllers/SignupVerificationController";
import * as GoogleAuthController from "../controllers/GoogleAuthController";
import { passwordResetLimiter, validateCodeLimiter } from "../middleware/rateLimiter";

const authRoutes = express.Router();

authRoutes.post("/signup", UserController.store);
authRoutes.post("/login", SessionController.store);

// ============ Google OAuth Login / Signup ============
// This router is mounted at /auth, so these must resolve to:
// GET /auth/google, GET /auth/google/callback, POST /auth/google/exchange
authRoutes.get("/google", GoogleAuthController.start);
authRoutes.get("/google/callback", GoogleAuthController.callback);
authRoutes.post("/google/exchange", GoogleAuthController.exchange);
authRoutes.post("/refresh_token", SessionController.update);
authRoutes.delete("/logout", isAuth, SessionController.remove);
authRoutes.get("/me", isAuth, SessionController.me);
authRoutes.post("/validate-cnpj", UserController.validateCnpj);

// Signup email verification
authRoutes.post("/send-signup-code", passwordResetLimiter, SignupVerificationController.sendSignupCode);
authRoutes.post("/validate-signup-code", validateCodeLimiter, SignupVerificationController.validateSignupCode);

// Password Reset com Rate Limiting (3 tentativas por 15 min)
authRoutes.post("/forgot-password", passwordResetLimiter, PasswordResetController.forgotPassword);
authRoutes.post("/validate-code", validateCodeLimiter, PasswordResetController.validateCode);
authRoutes.post("/reset-password", PasswordResetController.resetPassword);

export default authRoutes;
