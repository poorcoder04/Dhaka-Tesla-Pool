import { Router } from "express";
import { getOne, list } from "../controllers/zone.controller.js";

const router = Router();

router.get("/", list);
router.get("/:id", getOne);

export { router as zoneRouter };