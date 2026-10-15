import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import LoginPage from "@/app/page";

vi.mock("@/components/auth/login-form", () => ({
  default: ({ googleClientId }) => <div data-testid="login-config" data-client-id={googleClientId || ""} />,
}));

afterEach(() => vi.unstubAllEnvs());

it("injeta no login o client ID público configurado", () => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
  render(<LoginPage />);
  expect(screen.getByTestId("login-config")).toHaveAttribute("data-client-id", "test-client.apps.googleusercontent.com");
});

it("mantém o link de cadastro quando Google não está configurado", () => {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
  render(<LoginPage />);
  expect(screen.getByTestId("login-config")).toHaveAttribute("data-client-id", "");
  expect(screen.getByRole("link", { name: "Criar conta de paciente" })).toHaveAttribute("href", "/register");
});
