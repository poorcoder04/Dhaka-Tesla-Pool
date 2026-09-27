import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { createVehicleSchema, updateVehicleSchema } from "../validators/vehicle.validator.js";
import { create, getOne, listMine, update } from "../controllers/vehicle.controller.js";

const router = Router();

// Order matters: "/me" must be registered before "/:id" or Express will try
// to treat "me" as an :id param.
router.get("/me", authenticate, authorize("DRIVER"), listMine); //shows the vechicle of me(driver)
router.post("/", authenticate, authorize("DRIVER"), validate(createVehicleSchema), create);
router.patch(
  "/:id",
  authenticate,
  authorize("DRIVER"),
  validate(updateVehicleSchema),
  update
);
// Any authenticated user (e.g. a passenger checking who's driving their pool)
router.get("/:id", authenticate, getOne);

export { router as vehicleRouter };