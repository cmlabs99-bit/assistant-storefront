import type { ZodTypeAny, z } from 'zod';
import { ValidationError } from './errors.js';

/** Parse or throw a ValidationError with the zod issues attached as details. */
export function parse<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
