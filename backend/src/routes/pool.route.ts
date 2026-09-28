import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { getActive } from "../controllers/pool.controller.js";

const router = Router();

router.get("/me/active", authenticate, authorize("DRIVER"), getActive);

export { router as poolRouter };
