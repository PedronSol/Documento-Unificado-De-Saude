import { expect, test } from "@playwright/test";
import { mockGoogleSdk } from "./e2e-support/google";

const USER = { user_id: 7, display_name: "Ana", email: "ana@example.com", roles: ["patient"] };

test.describe("Login com Google", () => {
  let authenticated = false;
  test.beforeEach(async ({ page }) => {
    authenticated = false;
    await mockGoogleSdk(page);
    await page.route("**/me", (route) => route.fulfill({
      status: authenticated ? 200 : 401,
      json: authenticated ? {
        user: USER,
        patient_profile: { preferred_name: "Ana", is_adult: true, age: 30 },
      } : {},
    }));
    await page.route("**/auth/remembered", (route) => route.fulfill({ status: 204 }));
  });

  for (const width of [320, 1440]) {
    test(`entra com Google sem senha em ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/auth/google", (route) => {
        expect(route.request().method()).toBe("POST");
        expect(route.request().postDataJSON()).toEqual({ credential: "test-google-credential" });
        authenticated = true;
        return route.fulfill({ json: { user: USER } });
      });
      await page.goto("/");
      const google = page.getByRole("button", { name: "Continuar com Google" });
      await expect(google).toBeVisible();
      await expect(page.getByLabel("E-mail")).toHaveValue("");
      await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
      expect((await google.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.getByRole("link", { name: "Criar conta de paciente" })).toBeVisible();
      await page.screenshot({ path: `/tmp/dus-google-login-${width}.png`, fullPage: true });
      await google.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL("/home");
      expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
        .toEqual({ local: 0, session: 0 });
    });
  }

  test("usa Google também diante de uma conta lembrada", async ({ page }) => {
    await page.route("**/auth/remembered", (route) => {
      expect(route.request().method()).toBe("GET");
      return route.fulfill({ json: { first_name: "Carlos", masked_email: "c•••@email.com" } });
    });
    await page.route("**/auth/google", (route) => {
      authenticated = true;
      return route.fulfill({ json: { user: USER } });
    });
    await page.goto("/");
    await expect(page.getByText("Olá, Carlos")).toBeVisible();
    await page.getByRole("button", { name: "Continuar com Google" }).click();
    await expect(page).toHaveURL("/home");
  });

  test("orienta cadastro ou vínculo sem entrar quando precisa de onboarding", async ({ page }) => {
    await page.route("**/auth/google", (route) => route.fulfill({ json: { status: "onboarding_required" } }));
    await page.goto("/");
    await page.getByRole("button", { name: "Continuar com Google" }).click();
    await expect(page.locator(".access-form").getByRole("alert")).toContainText("configurações");
    await expect(page).toHaveURL("/");
    const register = page.getByRole("link", { name: "Criar conta de paciente" });
    await expect(register).toHaveAttribute("href", "/register");
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
      .toEqual({ local: 0, session: 0 });
    await register.click();
    await expect(page).toHaveURL("/register");
    await expect(page.getByLabel("E-mail")).toBeVisible();
  });

  test("libera nova tentativa e mantém senha após indisponibilidade Google", async ({ page }) => {
    let attempts = 0;
    await page.route("**/auth/google", (route) => {
      attempts += 1;
      authenticated = attempts > 1;
      return route.fulfill({ status: attempts === 1 ? 503 : 200, json: { user: USER } });
    });
    await page.goto("/");
    await page.getByLabel("E-mail").fill("ana@example.com");
    await page.getByLabel("Senha", { exact: true }).fill("senha-local");
    const google = page.getByRole("button", { name: "Continuar com Google" });
    await google.click();
    await expect(page.locator(".access-form").getByRole("alert")).toContainText("Não foi possível entrar com Google agora");
    await expect(page.getByLabel("E-mail")).toHaveValue("ana@example.com");
    await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("senha-local");
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
    await google.click();
    await expect(page).toHaveURL("/home");
    expect(attempts).toBe(2);
  });
});
