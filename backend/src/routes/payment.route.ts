import { Router } from "express";
import { PaymentController } from "../controllers/payment.controller.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.js";
import {
  estimateFareSchema,
  topupSchema,
} from "../validators/payment.validator.js";

const router = Router();

router.use(authenticate);

router.get("/wallet", PaymentController.getWallet);
router.post(
  "/wallet/topup",
  validate(topupSchema),
  PaymentController.topupWallet,
);
router.post(
  "/fares/estimate",
  validate(estimateFareSchema),
  PaymentController.estimateFare,
);
router.post(
  "/payments/:paymentId/collect",
  authorize("DRIVER"),
  PaymentController.collectPayment,
);
router.get("/payments/ride/:rideRequestId", PaymentController.getPaymentByRide);

export default router;
