import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatDateTime(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "-";
  try {
    const d = dateValue instanceof Date ? dateValue : parseISO(String(dateValue));
    return format(d, "MMM d, yyyy h:mm a");
  } catch (e) {
    return String(dateValue);
  }
}

export function formatTimeOnly(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "-";
  try {
    const d = dateValue instanceof Date ? dateValue : parseISO(String(dateValue));
    return format(d, "h:mm a");
  } catch (e) {
    return String(dateValue);
  }
}

// Ensure Zod errors are logged properly
export function logZodError(error: any, label: string) {
  console.error(`[Validation Error] ${label}:`, error);
}
