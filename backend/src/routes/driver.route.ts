import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { setDriverStatusSchema } from "../validators/driver.validator.js";
import { setStatus } from "../controllers/driver.controller.js";

const router = Router();

router.patch(
  "/me/status",
  authenticate,
  authorize("DRIVER"),
  validate(setDriverStatusSchema),
  setStatus
);

export { router as driverRouter };
