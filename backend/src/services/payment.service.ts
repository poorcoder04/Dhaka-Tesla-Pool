import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";

export class PaymentService {
  static async getWalletBalance(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, walletBalance: true },
    });
    if (!user) throw new AppError("User not found", 404);
    return user;
  }

  static async topupWallet(userId: string, amount: number) {
    if (amount <= 0) throw new AppError("Topup amount must be positive", 400);

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        walletBalance: {
          increment: amount,
        },
      },
      select: { id: true, walletBalance: true },
    });

    return updatedUser;
  }

  static async collectCashPayment(driverId: string, paymentId: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        rideRequest: {
          include: { pool: true },
        },
      },
    });

    if (!payment) throw new AppError("Payment record not found", 404);
    if (payment.rideRequest.pool?.driverId !== driverId) {
      throw new AppError(
        "Unauthorized: You are not the driver for this ride",
        403,
      );
    }
    if (payment.status === "PAID") {
      throw new AppError("Payment has already been collected", 400);
    }

    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        transactionId: `CASH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      },
    });

    return updatedPayment;
  }

  static async getPaymentByRideId(userId: string, rideRequestId: string) {
    const payment = await prisma.payment.findUnique({
      where: { rideRequestId },
      include: {
        rideRequest: {
          select: {
            id: true,
            status: true,
            originZone: true,
            destinationZone: true,
            seatsRequested: true,
            paymentMethod: true,
            passengerId: true,
            pool: { select: { driverId: true } },
          },
        },
      },
    });

    if (!payment) throw new AppError("Payment not found for this ride", 404);

    const isPassenger = payment.userId === userId;
    const isDriver = payment.rideRequest.pool?.driverId === userId;

    if (!isPassenger && !isDriver) {
      throw new AppError("Access denied", 403);
    }

    return payment;
  }
}
