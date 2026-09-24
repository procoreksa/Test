import { describe, it, expect } from "vitest";
import { extractTemplateVariables, assertTemplateVariablesAllowed, escapeHtml, renderTemplate } from "./render";

describe("extractTemplateVariables", () => {
  it("finds every distinct placeholder", () => {
    expect(extractTemplateVariables("Hello {{name}}, your total is {{amount}}.")).toEqual(["name", "amount"]);
  });

  it("de-duplicates repeated placeholders", () => {
    expect(extractTemplateVariables("{{name}} {{name}}")).toEqual(["name"]);
  });

  it("returns empty for plain text", () => {
    expect(extractTemplateVariables("no variables here")).toEqual([]);
  });

  it("tolerates internal whitespace", () => {
    expect(extractTemplateVariables("{{ name }}")).toEqual(["name"]);
  });
});

describe("assertTemplateVariablesAllowed", () => {
  it("passes when every placeholder is allow-listed", () => {
    expect(() => assertTemplateVariablesAllowed("Hi {{name}}", ["name", "amount"])).not.toThrow();
  });

  it("throws on a placeholder not in the allow-list", () => {
    expect(() => assertTemplateVariablesAllowed("Hi {{secretField}}", ["name"])).toThrow(/not allow-listed/);
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x")&'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;y&#39;&lt;/script&gt;"
    );
  });
});

describe("renderTemplate", () => {
  const allowedVariables = ["renterName", "invoiceNumber"];

  it("substitutes plain-text bodyText/subject verbatim", () => {
    const result = renderTemplate({
      subject: "Invoice {{invoiceNumber}}",
      bodyText: "Dear {{renterName}}, invoice {{invoiceNumber}} is ready.",
      variables: { renterName: "John & Co", invoiceNumber: "INV-2026-000123" },
      allowedVariables,
    });
    expect(result.subject).toBe("Invoice INV-2026-000123");
    expect(result.bodyText).toBe("Dear John & Co, invoice INV-2026-000123 is ready.");
    expect(result.bodyHtml).toBeUndefined();
  });

  it("HTML-escapes substituted values in bodyHtml only", () => {
    const result = renderTemplate({
      bodyText: "Dear {{renterName}}",
      bodyHtml: "<p>Dear {{renterName}}</p>",
      variables: { renterName: `<b>"John"</b>`, invoiceNumber: "x" },
      allowedVariables,
    });
    expect(result.bodyText).toBe(`Dear <b>"John"</b>`);
    expect(result.bodyHtml).toBe("<p>Dear &lt;b&gt;&quot;John&quot;&lt;/b&gt;</p>");
  });

  it("throws when a required variable value is missing", () => {
    expect(() =>
      renderTemplate({
        bodyText: "Dear {{renterName}}",
        variables: {},
        allowedVariables,
      })
    ).toThrow(/Missing value/);
  });

  it("throws when the template references a non-allow-listed variable", () => {
    expect(() =>
      renderTemplate({
        bodyText: "Your password is {{password}}",
        variables: { password: "hunter2" },
        allowedVariables,
      })
    ).toThrow(/not allow-listed/);
  });
});
