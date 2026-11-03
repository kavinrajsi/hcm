// CSV download of every employee, HR only. Columns match the import
// template so the file can be edited and imported back.
import { db } from "@/lib/db";
import { AuthorizationError, requireRole } from "@/lib/rbac";
import { decryptField } from "@/lib/crypto";
import { PII_SELECT, readPii } from "@/lib/employee-pii";
import { EMPLOYEE_IMPORT_COLUMNS } from "@/lib/import-columns";
import { istDayKey } from "@/lib/format-date";
import { toCsv } from "@/lib/csv-export";

export const dynamic = "force-dynamic";

function decrypted(stored: string | null): string {
  return stored ? decryptField(stored) : "";
}

export async function GET() {
  try {
    await requireRole("HR_ADMIN");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return new Response("Not authorized", { status: 403 });
    }
    throw error;
  }

  const employees = await db.employee.findMany({
    orderBy: { empId: "asc" },
    select: {
      ...PII_SELECT,
      empId: true,
      name: true,
      gender: true,
      bloodGroup: true,
      tshirtSize: true,
      workEmail: true,
      fatherName: true,
      linkedinId: true,
      city: true,
      state: true,
      pincode: true,
      department: true,
      designation: true,
      dateOfJoining: true,
      empType: true,
      isFresher: true,
      panEnc: true,
      aadhaarEnc: true,
      bankAccountEnc: true,
      ifscEnc: true,
      manager: { select: { empId: true } },
    },
  });

  const rows = employees.map((employee) => {
    const pii = readPii(employee);
    return {
      empId: employee.empId,
      name: employee.name,
      gender: employee.gender ?? "",
      dateOfBirth: pii.dateOfBirth ?? "",
      bloodGroup: employee.bloodGroup ?? "",
      tshirtSize: employee.tshirtSize ?? "",
      phone: pii.phone ?? "",
      personalEmail: pii.personalEmail ?? "",
      workEmail: employee.workEmail,
      emergencyContact: pii.emergencyContact ?? "",
      fatherName: employee.fatherName ?? "",
      address: pii.address ?? "",
      city: employee.city ?? "",
      state: employee.state ?? "",
      pincode: employee.pincode ?? "",
      department: employee.department,
      designation: employee.designation,
      dateOfJoining: employee.dateOfJoining.toISOString().slice(0, 10),
      empType: employee.empType,
      isFresher: employee.isFresher ? "true" : "false",
      pfNumber: pii.pfNumber ?? "",
      uanNumber: pii.uanNumber ?? "",
      linkedinId: employee.linkedinId ?? "",
      managerEmpId: employee.manager?.empId ?? "",
      pan: decrypted(employee.panEnc),
      aadhaar: decrypted(employee.aadhaarEnc),
      bankAccount: decrypted(employee.bankAccountEnc),
      ifsc: decrypted(employee.ifscEnc),
    } satisfies Record<(typeof EMPLOYEE_IMPORT_COLUMNS)[number], string>;
  });

  const csv = "﻿" + toCsv(EMPLOYEE_IMPORT_COLUMNS, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="employees-${istDayKey(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
