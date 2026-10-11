import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";


function read(relativePath) {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}


const tokens = read("../styles/design-tokens.css");
const globals = read("../app/globals.css");
const guide = read("../../docs/design-system.md");
const agentRules = read("../../AGENTS.md");
const clinicalSelect = read("../components/ui/clinical-select.jsx");
const patientDashboard = read("../components/patient/patient-dashboard.jsx");
const healthMarkers = read("../components/patient/health-markers.jsx");
const medicalStyles = globals.slice(globals.indexOf("/* Área médica"));
const dialogStyles = globals.slice(
  globals.indexOf(".modal-backdrop"),
  globals.indexOf(".home-state"),
);
const adminStyles = globals.includes("/* Área administrativa")
  ? globals.slice(globals.indexOf("/* Área administrativa"))
  : "";
const confirmDialog = read("../components/ui/confirm-dialog.jsx");
const markerSwitchStyles = globals.slice(
  globals.indexOf(".marker-view-switch {"),
  globals.indexOf(".marker-groups,"),
);
const markerEmptyStyles = globals.slice(
  globals.indexOf(".marker-empty,"),
  globals.indexOf(".marker-empty p,"),
);


describe("contrato do design system", () => {
  it("constrói governança e equipes de cuidado somente com tokens mobile-first", () => {
    expect(adminStyles).toContain(".admin-main");
    expect(adminStyles).toContain(".care-card");
    expect(adminStyles).toContain("var(--ds-layout-content)");
    expect(adminStyles).toContain("var(--ds-control-min-height)");
    expect(adminStyles).toContain("@media (min-width:");
    expect(adminStyles).not.toMatch(/@media \(max-width/);
    expect(adminStyles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(adminStyles).not.toMatch(/rgb\(/);
    expect(confirmDialog).toContain("clinical-confirm-dialog");
    expect(guide).toContain("ConfirmDialog");
  });

  it("publica tokens semânticos claros e escuros para todas as fundações", () => {
    expect(tokens).toContain("--ds-color-canvas");
    expect(tokens).toContain("--ds-color-primary");
    expect(tokens).toContain("--ds-font-interface");
    expect(tokens).toContain("--ds-space-4");
    expect(tokens).toContain("--ds-radius-card");
    expect(tokens).toContain("--ds-shadow-card");
    expect(tokens).toContain("--ds-motion-fast");
    expect(tokens).toContain("--ds-layout-content");
    expect(tokens).toMatch(/\.dark\s*{/);
  });

  it("importa a fonte de verdade e mantém aliases legados sobre os tokens", () => {
    expect(globals).toContain("@import '../styles/design-tokens.css';");
    expect(globals).toContain("--app-canvas: var(--ds-color-canvas)");
    expect(globals).toContain("--ui-surface: var(--ds-color-surface)");
    expect(globals).toContain("--ui-blue: var(--ds-color-primary)");
    expect(globals).toContain("--sans: var(--ds-font-interface)");
  });

  it("alinha a área médica e remove sua linguagem editorial isolada", () => {
    expect(medicalStyles).toContain("var(--ds-color-canvas)");
    expect(medicalStyles).toContain("var(--ds-color-primary)");
    expect(medicalStyles).toContain("var(--ds-radius-card)");
    expect(medicalStyles).not.toMatch(/#102f34|#8cd2b8|#eef1ed/);
    expect(medicalStyles).not.toContain("font-family: var(--serif)");
    expect(medicalStyles).not.toMatch(
      /border-radius:\s*(?:[\d.]+rem\s+){3}[\d.]+rem/,
    );
  });

  it("documenta componentes e governa uma implementação mobile-first", () => {
    expect(guide).toContain("## Componentes");
    expect(guide).toContain("## Mobile-first e responsividade");
    expect(agentRules).toContain("## Design system do frontend");
    expect(medicalStyles).toContain("@media (min-width:");
    expect(medicalStyles).not.toContain("@media (max-width: 720px)");
  });

  it("mantém diálogos clínicos no mesmo sistema e mobile-first", () => {
    expect(dialogStyles).toContain("var(--ds-color-primary)");
    expect(dialogStyles).toContain("var(--ds-font-interface)");
    expect(dialogStyles).toContain("var(--ds-radius-dialog)");
    expect(dialogStyles).toContain("@media (min-width:");
    expect(dialogStyles).not.toContain("var(--green-dark)");
    expect(dialogStyles).not.toContain("font-family: var(--serif)");
    expect(dialogStyles).not.toContain("#fbfbf7");
  });

  it("usa azul e neutros nos controles e estado vazio dos marcadores", () => {
    expect(markerSwitchStyles).toContain("var(--ds-color-primary)");
    expect(markerSwitchStyles).toContain("var(--ds-color-primary-soft)");
    expect(markerSwitchStyles).not.toContain("var(--green-dark)");
    expect(markerSwitchStyles).not.toContain("var(--green-wash)");
    expect(markerEmptyStyles).toContain("var(--ds-color-border-strong)");
    expect(markerEmptyStyles).toContain("var(--ds-color-primary)");
    expect(markerEmptyStyles).not.toContain("var(--green-dark)");
  });

  it("substitui selects nativos pelo dropdown compartilhado", () => {
    expect(clinicalSelect).toContain('@radix-ui/react-select');
    expect(clinicalSelect).toContain('data-slot="clinical-select-trigger"');
    expect(clinicalSelect).toContain('data-slot="clinical-select-item"');
    expect(clinicalSelect).toContain("SelectItemIndicator");
    expect(patientDashboard).toContain("<ClinicalSelect");
    expect(healthMarkers).toContain("<ClinicalSelect");
    expect(patientDashboard).not.toContain("<select");
    expect(healthMarkers).not.toContain("<select");
  });
});
