import { expect, test } from '@playwright/test';
import { fulfillPaged } from "./e2e-support/paged";

test('edita os dados próprios em configurações no mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/me' && request.method() === 'GET') {
      await fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            user_id: 1,
            display_name: 'Ana da Silva',
            email: 'ana@example.com',
            roles: ['patient'],
          },
          patient_profile: {
            preferred_name: 'Ana',
            full_name: 'Ana da Silva',
            avatar_url: null,
            health_status: 'updated',
            blood_type: 'O+',
            is_adult: true,
            age: 36,
          },
        }),
      });
      return;
    }

    if (url.pathname === '/me/profile' && request.method() === 'PATCH') {
      await fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            user_id: 1,
            display_name: 'Ana Costa',
            email: 'ana@example.com',
            roles: ['patient'],
          },
          patient_profile: {
            preferred_name: 'Aninha',
            full_name: 'Ana da Silva',
            avatar_url: null,
            health_status: 'updated',
            blood_type: 'O+',
            is_adult: true,
            age: 36,
          },
        }),
      });
      return;
    }

    if (url.pathname === '/me/shares/active' && request.method() === 'GET') {
      await fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null),
      });
      return;
    }

    if (url.pathname.startsWith('/me/')) {
      await fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    await route.continue();
  });

  await page.goto('/home');
  await page.getByRole('heading', { name: 'Ana' }).waitFor();
  await page.getByRole('button', { name: 'Conta de Ana' }).focus();
  await page.keyboard.press('Enter');
  const accountMenu = page.getByRole('menu', { name: 'Conta de Ana' });
  await expect(accountMenu).toBeVisible();
  const menuBounds = await accountMenu.boundingBox();
  expect(menuBounds?.x).toBeGreaterThanOrEqual(0);
  expect((menuBounds?.x ?? 0) + (menuBounds?.width ?? 0)).toBeLessThanOrEqual(320);
  await page.getByRole('menuitem', { name: 'Configurações' }).click();

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  const backLink = page.getByRole('link', { name: 'Voltar ao início' });
  await expect(backLink.locator('svg')).toHaveCount(1);
  await expect(backLink).toHaveClass(/medical-back/);
  await expect(page.getByLabel('E-mail')).toHaveValue('ana@example.com');
  await expect(page.getByLabel('E-mail')).toBeDisabled();
  await page.getByLabel('Nome de exibição').fill('Ana Costa');
  await page.getByLabel('Nome preferido').fill('Aninha');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();

  await expect(page.getByRole('status')).toContainText('Dados atualizados');
  await expect(page).toHaveURL(/\/settings$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
