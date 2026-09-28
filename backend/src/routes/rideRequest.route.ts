import { Router } from "express";
import {
  accept,
  cancel,
  create,
  getHistory,
  getOne,
  listMine,
  openList,
} from "../controllers/rideRequest.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";
import { acceptRideRequestSchema } from "../validators/pool.validator.js";
import { createRideRequestSchema } from "../validators/rideRequest.validator.js";

const router = Router();

// Order matters: single-segment routes ("/me", "/open") must be registered
// before "/:id" or Express would try to treat them as an :id param.
router.get("/me", authenticate, authorize("PASSENGER"), listMine);
router.get("/open", authenticate, authorize("DRIVER"), openList);

router.post(
  "/",
  authenticate,
  authorize("PASSENGER"),
  validate(createRideRequestSchema),
  create,
);

router.post(
  "/:id/accept",
  authenticate,
  authorize("DRIVER"),
  validate(acceptRideRequestSchema),
  accept,
);
router.patch("/:id/cancel", authenticate, authorize("PASSENGER"), cancel);

router.get("/:id/history", authenticate, authorize("PASSENGER"), getHistory);
router.get("/:id", authenticate, authorize("PASSENGER"), getOne);

export { router as rideRequestRouter };
