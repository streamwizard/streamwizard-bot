import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string(),
  SUPEBASE_PROJECT_ID: z.string(),
  SUPABASE_SECRET_KEY: z.string(),
});

export const env = envSchema.parse(process.env);