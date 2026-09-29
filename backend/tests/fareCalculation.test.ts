import { describe, expect, test } from "vitest";
import { calculateFare } from "../src/utils/estimateFare.js";

describe("Fare Calculation Unit Tests (PRD Verification)", () => {
  test("Nusrat: Solo ride from Banani to Mohakhali (2 km)", () => {
    const result = calculateFare("Banani", "Mohakhali", 1, 1);
    expect(result.subtotal).toBe(60);
    expect(result.poolDiscountAmount).toBe(0);
    expect(result.finalFare).toBe(60);
  });

  test("Rafiq: Solo ride from Banani to Gulshan 1 (3 km)", () => {
    const result = calculateFare("Banani", "Gulshan 1", 1, 1);
    expect(result.subtotal).toBe(75);
    expect(result.poolDiscountAmount).toBe(0);
    expect(result.finalFare).toBe(75);
  });

  test("Nusrat & Rafiq pooled (2 occupied seats -> 20% discount)", () => {
    const nusrat = calculateFare("Banani", "Mohakhali", 1, 2);
    expect(nusrat.subtotal).toBe(60);
    expect(nusrat.poolDiscountAmount).toBe(12);
    expect(nusrat.finalFare).toBe(48);

    const rafiq = calculateFare("Banani", "Gulshan 1", 1, 2);
    expect(rafiq.subtotal).toBe(75);
    expect(rafiq.poolDiscountAmount).toBe(15);
    expect(rafiq.finalFare).toBe(60);
  });

  test("Nusrat, Rafiq & Shirin pooled (3 occupied seats -> 30% discount)", () => {
    const nusrat = calculateFare("Banani", "Mohakhali", 1, 3);
    expect(nusrat.subtotal).toBe(60);
    expect(nusrat.poolDiscountAmount).toBe(18);
    expect(nusrat.finalFare).toBe(42);

    const rafiq = calculateFare("Banani", "Gulshan 1", 1, 3);
    expect(rafiq.subtotal).toBe(75);
    expect(rafiq.poolDiscountAmount).toBe(22.5);
    expect(rafiq.finalFare).toBe(52.5);
  });
});
