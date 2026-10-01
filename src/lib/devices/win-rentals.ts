import type { DeviceOs } from "@/generated/prisma/enums";

// The laptops Madarth rents from Win Technologies (one-off import, see
// scripts/import-win-rentals.ts). Invoice numbers and dates are left out on
// purpose for now.

export type RentalRow = {
  vendorRef: string;
  serial: string;
  name: string; // "HP Elitebook 840 G5" as on the vendor's list
  monthlyRent: string;
};

export const WIN_TECHNOLOGIES = "Win Technologies";

export const WIN_RENTALS: RentalRow[] = [
  { vendorRef: "Laptop1", serial: "5CD6416G9D", name: "HP Elitebook Folio 1040 G3", monthlyRent: "2000.00" },
  { vendorRef: "Laptop2", serial: "5CG8523SFJ", name: "HP Elitebook 840 G5", monthlyRent: "2400.00" },
  { vendorRef: "Laptop3", serial: "FVFH607WQ05H", name: "Apple MacBook Pro (A2338-2020) M1 13inch", monthlyRent: "7500.00" },
  { vendorRef: "Laptop4", serial: "5CG9152N19", name: "HP Elitebook 840 G5", monthlyRent: "2400.00" },
  { vendorRef: "Laptop5", serial: "5CG009024K", name: "HP Elitebook 840 G6", monthlyRent: "2400.00" },
  { vendorRef: "Laptop6", serial: "5CG043C9BR", name: "HP Elitebook 840 G6", monthlyRent: "2400.00" },
  { vendorRef: "Laptop7", serial: "5CG00400G7", name: "HP Elitebook 840 G6", monthlyRent: "2400.00" },
  { vendorRef: "Laptop8", serial: "5CG904693D", name: "HP Elitebook 840 G5", monthlyRent: "2400.00" },
];

/** Brand is the first word; OS follows the brand (Apple → Mac, else Windows). */
export function rentalDevice(row: RentalRow): {
  brand: string;
  model: string;
  os: DeviceOs;
  serialNumber: string;
  vendorRef: string;
  monthlyRent: string;
} {
  const [brand, ...rest] = row.name.trim().split(/\s+/);
  return {
    brand,
    model: rest.join(" "),
    os: brand.toLowerCase() === "apple" ? "MAC" : "WINDOWS",
    serialNumber: row.serial.trim().toUpperCase(),
    vendorRef: row.vendorRef,
    monthlyRent: row.monthlyRent,
  };
}
