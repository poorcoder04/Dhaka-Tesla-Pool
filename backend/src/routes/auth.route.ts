import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { loginLimiter, signupLimiter } from "../middleware/rateLimit.middleware.js";
import { loginSchema, signupSchema } from "../validators/auth.validator.js";
import { login, me, signup } from "../controllers/auth.controller.js";

const router = Router();

router.post("/signup", signupLimiter, validate(signupSchema), signup);
router.post("/login", loginLimiter, validate(loginSchema), login);
router.get("/me", authenticate, me); //give the profile

export { router as authRouter };