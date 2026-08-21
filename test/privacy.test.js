const test = require("node:test");
const assert = require("node:assert/strict");
const { OPERATOR_PLACEHOLDER, SECTIONS, renderPrivacyText } = require("../privacy");

test("privacy sections have a title and body", () => {
  assert.ok(SECTIONS.length > 0);
  for (const section of SECTIONS) {
    assert.equal(typeof section.title, "string");
    assert.ok(section.title.length > 0);
    assert.equal(typeof section.body, "string");
    assert.ok(section.body.length > 0);
  }
});

test("renderPrivacyText fills in the operator placeholders by default", () => {
  const rendered = renderPrivacyText();
  const operatorSection = rendered.find((section) => section.title === "Kdo appku provozuje");
  assert.ok(operatorSection.body.includes(OPERATOR_PLACEHOLDER.name));
  assert.ok(operatorSection.body.includes(OPERATOR_PLACEHOLDER.contactEmail));
});

test("renderPrivacyText substitutes a real operator across every section that references it", () => {
  const operator = { name: "Acme s.r.o.", contactEmail: "podpora@acme.cz", address: "Praha" };
  const rendered = renderPrivacyText(operator);
  const joined = rendered.map((section) => section.body).join(" ");
  assert.ok(joined.includes("Acme s.r.o."));
  assert.ok(joined.includes("podpora@acme.cz"));
  assert.ok(!joined.includes("{{"));
});
