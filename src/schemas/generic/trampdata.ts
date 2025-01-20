import { z } from "zod";

// Accept any JSON-serializable data without validation
export const genericTrampData = z.record(z.unknown()).optional();

export type GenericTrampData = z.infer<typeof genericTrampData>; 