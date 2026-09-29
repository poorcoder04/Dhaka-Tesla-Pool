import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { PaymentService } from "../services/payment.service.js";
import { AppError } from "../utils/AppError.js";
import { calculateFare } from "../utils/estimateFare.js";

export class PaymentController {
  static async getWallet(req: Request, res: Response) {
    const userWallet = await PaymentService.getWalletBalance(req.user!.id);
    res.json({ success: true, data: userWallet });
  }

  static async topupWallet(req: Request, res: Response) {
    const { amount } = req.body;
    const updatedUser = await PaymentService.topupWallet(
      req.user!.id,
      Number(amount),
    );
    res.json({
      success: true,
      message: `Successfully added ${amount} BDT to wallet`,
      data: updatedUser,
    });
  }

  static async estimateFare(req: Request, res: Response) {
    const { originZoneId, destinationZoneId, seatsRequested = 1 } = req.body;

    const [originZone, destZone] = await Promise.all([
      prisma.zone.findUnique({ where: { id: originZoneId } }),
      prisma.zone.findUnique({ where: { id: destinationZoneId } }),
    ]);

    if (!originZone || !destZone) {
      throw new AppError("Invalid origin or destination zone", 400);
    }

    const soloFare = calculateFare(
      originZone.name,
      destZone.name,
      Number(seatsRequested),
      1,
    );
    const pool2SeatsFare = calculateFare(
      originZone.name,
      destZone.name,
      Number(seatsRequested),
      2,
    );
    const pool3SeatsFare = calculateFare(
      originZone.name,
      destZone.name,
      Number(seatsRequested),
      3,
    );

    res.json({
      success: true,
      data: {
        soloFare,
        estimatedPoolFares: {
          twoPasssengers: pool2SeatsFare,
          threePassengers: pool3SeatsFare,
        },
      },
    });
  }

  static async collectPayment(req: Request, res: Response) {
    const paymentId = req.params.paymentId as string;
    const payment = await PaymentService.collectCashPayment(
      req.user!.id,
      paymentId,
    );
    res.json({
      success: true,
      message: "Payment successfully marked as collected",
      data: payment,
    });
  }

  static async getPaymentByRide(req: Request, res: Response) {
    const rideRequestId = req.params.rideRequestId as string;
    const payment = await PaymentService.getPaymentByRideId(
      req.user!.id,
      rideRequestId,
    );
    res.json({ success: true, data: payment });
  }
}
