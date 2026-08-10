/**
 * Inline validation message shown under a form field.
 *
 * Extracted from DinerSignup, which defined it locally, once the same
 * affordance was needed by the venue, staff, diner and partner forms. Rendering
 * nothing for an absent message keeps call sites to a bare
 * `<FieldError message={errs.email} />` with no surrounding conditional.
 *
 * role="alert" + aria-live so a screen reader announces the message when it
 * appears on submit rather than leaving the failure silent.
 */
export const FieldError = ({ message }: { message?: string }) =>
  message ? (
    <p role="alert" aria-live="polite" className="text-destructive text-xs mt-1">
      {message}
    </p>
  ) : null;

export default FieldError;
