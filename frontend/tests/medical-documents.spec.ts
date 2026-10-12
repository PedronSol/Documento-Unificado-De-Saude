import { expect, test, type Page, type Route } from "@playwright/test";
import { fulfillPaged } from "./e2e-support/paged";


const API_ORIGIN = "http://localhost:8000";
const PDF = Buffer.from("%PDF-1.4\n%%EOF");

const doctorIdentity = {
  user: { user_id: 8, display_name: "Dra. Ana Lima", email: "ana@example.com", roles: ["doctor"] },
  patient_profile: null,
  dependents: [],
};

const patientIdentity = {
  user: { user_id: 1, display_name: "Carlos da Silva", email: "c@example.com", roles: ["patient"] },
  patient_profile: {
    preferred_name: "Carlos",
    full_name: "Carlos Eduardo da Silva",
    avatar_url: null,
    health_status: "updated",
    blood_type: "A+",
    is_adult: true,
    age: 41,
  },
  dependents: [],
};

const doctorUploader = { display_name: "Dra. Ana Lima", crm_number: "123456", crm_state: "SP" };

function document(overrides: Record<string, unknown>) {
  return {
    document_id: 42,
    title: "Hemograma",
    type: "exam",
    original_filename: "hemograma.pdf",
    media_type: "application/pdf",
    size_bytes: PDF.length,
    status: "uploaded",
    created_at: "2026-10-11T12:00:00",
    uploaded_by_doctor: null,
    ...overrides,
  };
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await fulfillPaged(route, {
    status,
    contentType: "application/json",
    body: body === null ? "" : JSON.stringify(body),
  });
}

async function mockApi(page: Page, handler: (key: string, route: Route) => Promise<boolean>) {
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    if (!(await handler(key, route))) {
      await fulfill(route, []);
    }
  });
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(width);
}


for (const viewport of [{ width: 320, height: 900 }, { width: 1280, height: 900 }]) {
  test(`médico envia documento e remove só os próprios em ${viewport.width} px`, async ({ page }) => {
    const deleted: string[] = [];
    let documents = [document({ can_remove: false })];
    await mockApi(page, async (key, route) => {
      if (key === "GET /me") return fulfill(route, doctorIdentity).then(() => true);
      if (key === "GET /medical/patients/10") {
        await fulfill(route, {
          patient: {
            patient_id: 10, preferred_name: "Carlos", full_name: "Carlos Eduardo da Silva",
            avatar_url: null, health_status: "updated", age: 41, blood_type: "A+",
          },
          vaccines: [],
          markers: { active: [], removed: [] },
        });
        return true;
      }
      if (key === "GET /medical/patients/10/documents") {
        await fulfill(route, documents);
        return true;
      }
      if (key === "POST /medical/patients/10/documents") {
        const created = document({
          document_id: 43,
          title: "Laudo do eco",
          original_filename: "laudo.pdf",
          uploaded_by_doctor: doctorUploader,
          can_remove: true,
        });
        documents = [created, ...documents];
        await fulfill(route, created, 201);
        return true;
      }
      if (key.startsWith("DELETE /medical/patients/10/documents/")) {
        deleted.push(key);
        const removedId = Number(key.split("/").at(-1));
        documents = documents.filter((item) => item.document_id !== removedId);
        await fulfillPaged(route, { status: 204 });
        return true;
      }
      return false;
    });

    await page.setViewportSize(viewport);
    await page.goto("/medical/patients/10");
    await expect(page.getByText("Hemograma", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover Hemograma" })).toHaveCount(0);

    await page.getByRole("button", { name: "Adicionar documento" }).click();
    await page.getByLabel("Título do documento").fill("Laudo do eco");
    await page.getByLabel("Escolher arquivo").setInputFiles({
      name: "laudo.pdf", mimeType: "application/pdf", buffer: PDF,
    });
    await page.getByRole("button", { name: "Enviar documento" }).click();

    await expect(page.getByText("Enviado por Dra. Ana Lima · CRM 123456/SP")).toBeVisible();
    const remove = page.getByRole("button", { name: "Remover Laudo do eco" });
    expect((await remove.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page, viewport.width);
    await remove.click();
    const dialog = page.getByRole("alertdialog", { name: "Remover documento" });
    await expect(dialog).toContainText("prontuário do paciente");
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await dialog.getByRole("button", { name: "Remover documento" }).click();
    await expect(page.getByText("Laudo do eco")).toHaveCount(0);
    expect(deleted).toEqual(["DELETE /medical/patients/10/documents/43"]);
  });

  test(`paciente confirma explicitamente a remoção de documento médico em ${viewport.width} px`, async ({ page }) => {
    const deleted: string[] = [];
    let documents = [document({ title: "Laudo do eco", uploaded_by_doctor: doctorUploader })];
    await mockApi(page, async (key, route) => {
      if (key === "GET /me") return fulfill(route, patientIdentity).then(() => true);
      if (key === "GET /me/shares/active") return fulfill(route, null).then(() => true);
      if (key === "GET /me/documents") {
        await fulfill(route, documents);
        return true;
      }
      if (key.startsWith("DELETE /me/documents/")) {
        deleted.push(key);
        documents = [];
        await fulfillPaged(route, { status: 204 });
        return true;
      }
      return false;
    });

    await page.setViewportSize(viewport);
    await page.goto("/patient");
    await expect(page.getByText("Enviado por Dra. Ana Lima · CRM 123456/SP")).toBeVisible();
    await page.getByRole("button", { name: "Remover Laudo do eco" }).click();

    const dialog = page.getByRole("alertdialog", { name: "Remover documento enviado por médico" });
    await expect(dialog).toContainText("equipes que acompanham seu prontuário");
    const confirm = dialog.getByRole("button", { name: "Remover documento" });
    await expect(confirm).toBeDisabled();
    const acknowledgement = dialog.getByRole("checkbox", {
      name: "Entendo que este documento foi enviado por Dra. Ana Lima",
    });
    const box = await dialog.locator(".confirm-acknowledgement").boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page, viewport.width);

    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: "Remover Laudo do eco" }).click();
    await expect(acknowledgement).not.toBeChecked();
    await acknowledgement.check();
    await confirm.click();

    await expect(page.getByText("Laudo do eco")).toHaveCount(0);
    expect(deleted).toEqual(["DELETE /me/documents/42"]);
  });
}
