import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { GoogleAccountLink } from "@/components/auth/google-account-link";
import { apiFetch } from "@/lib/api";


vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: ({ onCredential }) => (
    <button type="button" onClick={() => onCredential("google-id-token") }>
      Vincular conta Google
    </button>
  ),
}));


beforeEach(() => {
  apiFetch.mockReset();
});


it("vincula Google somente após autenticação explícita do paciente", async () => {
  apiFetch.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(
    <GoogleAccountLink googleClientId="client-id.apps.googleusercontent.com" />,
  );

  await user.click(screen.getByRole("button", { name: "Vincular conta Google" }));

  expect(apiFetch).toHaveBeenCalledWith("/me/external-identities/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: "google-id-token" }),
  });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Conta Google vinculada.",
  );
  expect(window.localStorage).toHaveLength(0);
  expect(window.sessionStorage).toHaveLength(0);
});
