import { expect, test, type Page, type Route } from "@playwright/test";


const API_ORIGIN = "http://localhost:8000";

const doctorEnvelope = {
  user: {
    user_id: 7,
    display_name: "Dr. Marcos Nunes",
    email: "marcos@example.com",
    roles: ["doctor"],
  },
  patient_profile: null,
};

const patientEnvelope = {
  user: {
    user_id: 9,
    display_name: "Carlos da Silva",
    email: "carlos@example.com",
    roles: ["patient"],
  },
  patient_profile: {
    preferred_name: "Carlos",
    full_name: "Carlos Eduardo da Silva",
    avatar_url: null,
    health_status: "updated",
    blood_type: "A+",
    is_adult: true,
    age: 41,
  },
};

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: body === null ? "" : JSON.stringify(body),
  });
}

async function mockApi(page: Page, handler: (key: string, route: Route) => Promise<boolean>) {
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}${url.search}`;
    if (!(await handler(key, route))) {
      await fulfill(route, [], 200);
    }
  });
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
}


test.describe("Vínculo direto médico–paciente", () => {
  test("médico solicita acesso pelo CPF em 320 px e viewport ampla", async ({ page }) => {
    let pending: unknown[] = [];
    let submitted: unknown = null;
    await mockApi(page, async (key, route) => {
      if (key === "GET /me") {
        await fulfill(route, doctorEnvelope);
        return true;
      }
      if (key === "GET /medical/patient-links?status=pending") {
        await fulfill(route, pending);
        return true;
      }
      if (key === "POST /medical/patient-links") {
        submitted = route.request().postDataJSON();
        pending = [{
          link_id: 8,
          patient_display_name: "Carlos Eduardo da Silva Albuquerque Figueiredo",
          masked_cpf: "***.982.247-**",
          expires_at: "2026-10-18T12:00:00",
        }];
        await fulfill(route, { result: "request_sent", link_id: 8 }, 202);
        return true;
      }
      return false;
    });

    for (const viewport of [{ width: 320, height: 800 }, { width: 1440, height: 900 }]) {
      pending = [];
      await page.setViewportSize(viewport);
      await page.goto("/home");
      const cpfField = page.getByLabel("CPF do paciente");
      await expect(cpfField).toBeVisible();
      await cpfField.fill("529.982.247-25");
      const submit = page.getByRole("button", { name: "Solicitar acesso" });
      expect((await submit.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await submit.click();
      await expect(
        page.getByText("Solicitação enviada. O acesso começa após o aceite do paciente."),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Cancelar solicitação para Carlos Eduardo da Silva Albuquerque Figueiredo",
        }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page, viewport.width);
    }
    expect(submitted).toEqual({ cpf: "529.982.247-25" });
  });

  test("paciente aceita solicitação de médico em 320 px", async ({ page }) => {
    let accepted = false;
    await mockApi(page, async (key, route) => {
      if (key === "GET /me") {
        await fulfill(route, patientEnvelope);
        return true;
      }
      if (key === "GET /me/shares/active") {
        await fulfill(route, null);
        return true;
      }
      if (key === "GET /me/care-requests") {
        await fulfill(route, accepted ? [] : [{
          link_id: 11,
          doctor_display_name: "Dr. Marcos Nunes",
          crm_number: "100002",
          crm_state: "RN",
          expires_at: "2026-10-18T12:00:00",
        }]);
        return true;
      }
      if (key === "POST /me/care-requests/11/accept") {
        accepted = true;
        await fulfill(route, null, 204);
        return true;
      }
      return false;
    });

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/home");
    const accept = page.getByRole("button", {
      name: "Aceitar solicitação de Dr. Marcos Nunes",
    });
    await expect(accept).toBeVisible();
    expect((await accept.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page, 320);
    await accept.click();
    await expect(
      page.getByText("Solicitação aceita. O médico passa a acessar seu prontuário."),
    ).toBeVisible();
    expect(accepted).toBe(true);
  });
});
