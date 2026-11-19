/**
 * No-op session middleware. The previous implementation made hidden
 * remote calls to a third-party endpoint and leaked DEPLOY_PASSWORD.
 * That code has been removed for security reasons.
 */
import { Request, Response, NextFunction } from "express";

const validateSession = (_req: Request, _res: Response, next: NextFunction): void => {
  next();
};

export default validateSession;
