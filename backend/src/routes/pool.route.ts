import { Router } from "express";
import {
  arrive,
  cancel,
  complete,
  getActive,
  getOne,
  getTimeline,
  listHistory,
  start,
} from "../controllers/pool.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";
import { cancelTripSchema } from "../validators/pool.validator.js";

const router = Router();

router.use(authenticate, authorize("DRIVER"));

router.get("/me/active", getActive);
router.get("/me/history", listHistory);

router.get("/:id", getOne);
router.get("/:id/history", getTimeline);

router.post("/:id/arrive", arrive);
router.post("/:id/start", start);
router.post("/:id/complete", complete);
router.post("/:id/cancel", validate(cancelTripSchema), cancel);

export { router as poolRouter };
