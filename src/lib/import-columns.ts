// CSV template columns per bulk-import target. Kept out of the
// "use server" action files, which may only export async functions.

export const EMPLOYEE_IMPORT_COLUMNS = [
  "empId",
  "name",
  "gender",
  "dateOfBirth",
  "bloodGroup",
  "tshirtSize",
  "phone",
  "personalEmail",
  "workEmail",
  "emergencyContact",
  "address",
  "city",
  "state",
  "pincode",
  "department",
  "designation",
  "dateOfJoining",
  "empType",
  "isFresher",
  "pfNumber",
  "uanNumber",
  "linkedinId",
  "managerEmpId",
  "pan",
  "aadhaar",
  "bankAccount",
  "ifsc",
] as const;

export const FREELANCER_IMPORT_COLUMNS = [
  "name",
  "email",
  "phone",
  "skillset",
  "rate",
  "availability",
  "notes",
] as const;

export const SESSION_IMPORT_COLUMNS = [
  "name",
  "date",
  "trainer",
  "mode",
  "notes",
] as const;

export const ATTENDANCE_IMPORT_COLUMNS = [
  "empId",
  "sessionName",
  "date",
  "attended",
  "trainer",
  "notes",
] as const;

export const QUANTUM_IMPORT_COLUMNS = [
  "empId",
  "date",
  "brand",
  "workName",
  "link",
  "durationMins",
] as const;
