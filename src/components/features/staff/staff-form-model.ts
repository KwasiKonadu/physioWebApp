// Staff form: target shape, validation schema and form values.
import { z } from "zod";
import { STAFF_ROLES, EMPLOYMENT_STATUSES, REMUNERATION_METHODS } from "@/lib/constants";

export interface StaffFormTarget {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string;
  department: string | null;
  staffRole: string;
  employmentDate: string | null;
  employmentStatus: string;
  branchId?: string | null;
  professionalDesignation: string | null;
  specialization: string | null;
  qualifications: string[];
  availability: { day: string; start?: string; end?: string }[];
  remunerationMethod: string;
  remunerationRateCents: number | null;
}

export const schema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.union([z.string().email("Invalid email"), z.literal("")]),
    phone: z.string(),
    jobTitle: z.string().min(1, "Job title is required"),
    department: z.string(),
    staffRole: z.enum(STAFF_ROLES),
    employmentDate: z.string(),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES),
    branchId: z.string(),
    professionalDesignation: z.string(),
    specialization: z.string(),
    qualifications: z.array(z.object({ value: z.string().min(1, "Empty qualification") })),
    availability: z.array(
      z.object({
        day: z.string().min(1),
        start: z.string(),
        end: z.string(),
      })
    ),
    remunerationMethod: z.enum(REMUNERATION_METHODS),
    remunerationRate: z.string(),
    createUser: z.boolean(),
    createPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.createUser && (!v.createPassword || v.createPassword.length < 8)) {
      ctx.addIssue({ code: "custom", path: ["createPassword"], message: "Password must be at least 8 characters" });
    }
    if (v.staffRole === "PHYSIOTHERAPIST" && v.remunerationMethod !== "FIXED") {
      const rate = parseFloat(v.remunerationRate);
      if (!rate || rate <= 0) {
        ctx.addIssue({ code: "custom", path: ["remunerationRate"], message: "Rate is required for this method" });
      }
    }
  });

export type FormValues = z.infer<typeof schema>;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
