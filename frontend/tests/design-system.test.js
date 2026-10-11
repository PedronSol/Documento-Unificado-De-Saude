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
const vaccineDialog = read("../components/vaccines/vaccine-dialog.jsx");
const healthMarkers = read("../components/markers/marker-dialogs.jsx");
const digitalDocuments = read("../components/documents/document-upload-dialog.jsx");
const nextConfig = read("../next.config.mjs");
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
const shellStyles = globals.slice(
  globals.indexOf(".context-switcher {"),
  globals.indexOf(".identity-actions,"),
);
const dependentStyles = globals.includes("/* Dependentes")
  ? globals.slice(
    globals.indexOf("/* Dependentes"),
    globals.indexOf("/* Fim dependentes */"),
  )
  : "";

function tokenBlocks() {
  const darkStart = tokens.search(/\.dark\s*{/);
  return { light: tokens.slice(0, darkStart), dark: tokens.slice(darkStart) };
}

function tokenValue(block, name) {
  return block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
}

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map((value) => (
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

const markerEmptyStyles = globals.slice(
  globals.indexOf(".marker-empty,"),
  globals.indexOf(".marker-empty p,"),
);


describe("contrato do design system", () => {
  it("constrói governança e equipes de cuidado somente com tokens mobile-first", () => {
    expect(adminStyles).toContain(".admin-main");
    expect(adminStyles).toContain(".care-card");
    expect(adminStyles).toContain(".patient-link-item");
    expect(adminStyles).toContain(".claim-link-card");
    expect(adminStyles).toContain(".provisional-actions");
    expect(adminStyles).toContain(".patient-link-guardian");
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
    expect(vaccineDialog).toContain("<ClinicalSelect");
    expect(healthMarkers).toContain("<ClinicalSelect");
    expect(vaccineDialog).not.toContain("<select");
    expect(healthMarkers).not.toContain("<select");
  });

  it("governa o digitalizador com componentes e política de câmera seguros", () => {
    expect(digitalDocuments).toContain("<ClinicalSelect");
    expect(digitalDocuments).not.toContain("<select");
    expect(digitalDocuments).toContain("audio: false");
    expect(nextConfig).toContain('value: "camera=(self)"');
    expect(guide).toContain("**Digitalizador de documento**");
  });

  it("publica tokens de menor com contraste AA nos dois temas", () => {
    for (const block of Object.values(tokenBlocks())) {
      const minor = tokenValue(block, "--ds-color-minor");
      const soft = tokenValue(block, "--ds-color-minor-soft");
      const border = tokenValue(block, "--ds-color-minor-border");
      const surface = tokenValue(block, "--ds-color-surface");
      expect(minor).toBeDefined();
      expect(soft).toBeDefined();
      expect(border).toBeDefined();
      expect(contrast(minor, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(minor, soft)).toBeGreaterThanOrEqual(4.5);
    }
    expect(guide).toContain("`minor`");
    expect(guide).toContain("Menor de idade");
  });

  it("estiliza o seletor de contexto como navegação por links", () => {
    expect(shellStyles).toContain(".context-switcher a {");
    expect(shellStyles).toContain('.context-switcher a[aria-current="page"]');
    expect(shellStyles).toContain(
      '.context-switcher a[data-tone="minor"][aria-current="page"]',
    );
    expect(globals).not.toContain(".context-switcher button");
    expect(globals).not.toContain('.context-switcher button[aria-pressed="true"]');
  });

  it("aplica o tom de menor somente por tokens e atributo de contexto", () => {
    expect(dependentStyles).toContain('[data-patient-tone="minor"]');
    expect(dependentStyles).toContain("var(--ds-color-minor)");
    expect(dependentStyles).toContain("var(--ds-color-minor-soft)");
    expect(dependentStyles).toContain(".dependents-list");
    expect(dependentStyles).toContain(".dependent-context-banner");
    expect(dependentStyles).toContain(".minor-badge");
    expect(dependentStyles).toContain("var(--ds-layout-content)");
    expect(dependentStyles).toContain("var(--ds-control-min-height)");
    expect(dependentStyles).toContain("@media (min-width:");
    expect(dependentStyles).not.toMatch(/@media \(max-width/);
    expect(dependentStyles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(dependentStyles).not.toMatch(/rgb\(/);
  });
});
