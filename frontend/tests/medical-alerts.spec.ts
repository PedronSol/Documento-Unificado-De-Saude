import { expect, test, type Route } from "@playwright/test";
import { fulfillPaged } from "./e2e-support/paged";


// Spec 046: the doctor sees the patient's medical alerts in the record.
const API_ORIGIN = "http://localhost:8000";

const doctorIdentity = {
  user: { user_id: 8, display_name: "Dra. Ana Lima", email: "ana@example.com", roles: ["doctor"] },
  patient_profile: null,
  dependents: [],
};

const record = {
  patient: {
    patient_id: 10, preferred_name: "Carlos", full_name: "Carlos Eduardo da Silva",
    avatar_url: null, health_status: "updated", age: 41, blood_type: "A+",
  },
  vaccines: [],
  markers: { active: [], removed: [] },
  alerts: [
    {
      alert_id: 5, type: "allergy", title: "Penicilina",
      description: "Reação anafilática registrada em atendimento anterior.", severity: "high",
    },
    {
      alert_id: 1, type: "condition", title: "Hipertensão",
      description: "Acompanhamento regular recomendado.", severity: "medium",
    },
  ],
};

async function fulfill(route: Route, body: unknown) {
  await fulfillPaged(route, {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

for (const viewport of [{ width: 320, height: 900 }, { width: 1280, height: 900 }]) {
  test(`médico vê alertas médicos no prontuário em ${viewport.width} px`, async ({ page }) => {
    await page.route(`${API_ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      const key = `${route.request().method()} ${url.pathname}`;
      if (key === "GET /me") return fulfill(route, doctorIdentity);
      if (key === "GET /medical/patients/10") return fulfill(route, record);
      return fulfill(route, []);
    });

    await page.setViewportSize(viewport);
    await page.goto("/medical/patients/10");

    const alerts = page.getByRole("region", { name: "Alertas médicos" });
    await expect(alerts.getByText("Penicilina")).toBeVisible();
    await expect(alerts.getByText("Alta")).toBeVisible();
    await expect(alerts.getByText("Hipertensão")).toBeVisible();
    const alertsBox = await alerts.boundingBox();
    const vaccinesBox = await page.getByRole("region", { name: "Vacinação" }).boundingBox();
    expect(alertsBox!.y).toBeLessThan(vaccinesBox!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(viewport.width);
  });
}
