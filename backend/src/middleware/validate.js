/**
 * Zod request validation middleware
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'field'}: ${i.message}`);
      return res.status(400).json({
        error: issues[0] || 'Invalid request payload.',
        details: issues
      });
    }
    req.validatedBody = parsed.data;
    next();
  };
}
