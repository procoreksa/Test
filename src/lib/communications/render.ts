/**
 * Template variable parsing/validation/escaping/rendering. Pure functions
 * only - no DB/env access, so a template's rendering behavior is fully unit
 * testable without a database. See docs/NOTIFICATIONS-COMMUNICATIONS.md,
 * "Template rendering" for the allow-list rationale (Step 21: rendering
 * must never accept free-form interpolation).
 */

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/** Every distinct `{{variableName}}` placeholder referenced in `source`. */
export function extractTemplateVariables(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(VARIABLE_PATTERN)) {
    found.add(match[1]);
  }
  return Array.from(found);
}

/**
 * Throws if `source` references any placeholder not present in
 * `allowedVariables` - the allow-list check run both when a template
 * version is saved and again defensively at render time.
 */
export function assertTemplateVariablesAllowed(source: string, allowedVariables: readonly string[]): void {
  const allowed = new Set(allowedVariables);
  for (const name of extractTemplateVariables(source)) {
    if (!allowed.has(name)) {
      throw new Error(`Template references a variable that is not allow-listed for this event: ${name}`);
    }
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function substitute(source: string, variables: Record<string, string>, escape: boolean): string {
  return source.replace(VARIABLE_PATTERN, (_match, name: string) => {
    if (!(name in variables)) {
      throw new Error(`Missing value for required template variable: ${name}`);
    }
    const value = variables[name];
    return escape ? escapeHtml(value) : value;
  });
}

export interface RenderTemplateInput {
  subject?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
  variables: Record<string, string>;
  allowedVariables: readonly string[];
}

export interface RenderedTemplate {
  subject?: string;
  bodyText: string;
  bodyHtml?: string;
}

/**
 * Renders one template version against a concrete variable payload.
 * `bodyHtml` values are HTML-escaped on substitution (an email body is
 * genuinely rendered as HTML); `bodyText`/`subject` are substituted
 * verbatim since they are plain text end to end (WhatsApp body, email
 * subject line, and the plain-text fallback body).
 */
export function renderTemplate(input: RenderTemplateInput): RenderedTemplate {
  assertTemplateVariablesAllowed(input.bodyText, input.allowedVariables);
  if (input.bodyHtml) assertTemplateVariablesAllowed(input.bodyHtml, input.allowedVariables);
  if (input.subject) assertTemplateVariablesAllowed(input.subject, input.allowedVariables);

  return {
    subject: input.subject ? substitute(input.subject, input.variables, false) : undefined,
    bodyText: substitute(input.bodyText, input.variables, false),
    bodyHtml: input.bodyHtml ? substitute(input.bodyHtml, input.variables, true) : undefined,
  };
}
