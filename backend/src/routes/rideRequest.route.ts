import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { createRideRequestSchema } from "../validators/rideRequest.validator.js";
import { cancel, create, getOne, listMine } from "../controllers/rideRequest.controller.js";

const router = Router();

// Order matters: "/me" must be registered before "/:id" or Express will try
// to treat "me" as an :id param (same convention as vehicle.route.ts).
router.get("/me", authenticate, authorize("PASSENGER"), listMine);
router.post("/", authenticate, authorize("PASSENGER"), validate(createRideRequestSchema), create);
router.patch("/:id/cancel", authenticate, authorize("PASSENGER"), cancel);
router.get("/:id", authenticate, authorize("PASSENGER"), getOne);

export { router as rideRequestRouter };