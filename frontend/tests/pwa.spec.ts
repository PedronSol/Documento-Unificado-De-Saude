import { expect, test } from '@playwright/test';

test('mantém o dock em tablet touch mesmo com viewport CSS acima do breakpoint desktop', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 1024 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.route('**/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      user: {
        user_id: 1,
        display_name: 'Pessoa de teste',
        email: 'teste@example.com',
        roles: ['patient', 'doctor'],
      },
      patient_profile: {
        preferred_name: 'Pessoa de teste',
        full_name: 'Pessoa de teste',
        avatar_url: null,
        health_status: 'updated',
        blood_type: 'O+',
        is_adult: true,
        age: 30,
      },
    }),
  }));

  try {
    await page.goto('/home');
    const contextNav = page.getByRole('navigation', { name: 'Contexto de acesso' });
    await expect(contextNav).toBeVisible();
    expect(await page.evaluate(() => window.innerWidth)).toBeGreaterThanOrEqual(1200);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom)).toBeLessThan(100);
  } finally {
    await context.close();
  }
});

test('instala como PWA e oferece fallback offline sem armazenar dados privados', async ({ page, context }) => {
  await page.goto('/');

  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    return response.json();
  });

  expect(manifest.name).toBe('Documento Unificado de Saúde');
  expect(manifest.short_name).toBe('DUS');
  expect(manifest.start_url).toBe('/');
  expect(manifest.scope).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation).toBeUndefined();
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
    ]),
  );

  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain(icon.type);
  }

  await expect.poll(() => page.evaluate(async () => {
    const registrations = await navigator.serviceWorker?.getRegistrations();
    return registrations?.some((registration) => registration.scope === `${location.origin}/`) ?? false;
  })).toBe(true);

  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true);
  await page.evaluate(() => fetch('/api/private-health-data').catch(() => undefined));

  const cachedUrls = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const responses = await Promise.all(cacheNames.map(async (cacheName) =>
      (await caches.open(cacheName)).keys()
    ));
    return responses.flat().map((request) => new URL(request.url).pathname);
  });
  expect(cachedUrls).toEqual(['/offline.html']);

  await context.setOffline(true);
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Sem conexão' })).toBeVisible();
  await expect(page.getByText(/dados de saúde não ficam disponíveis offline/i)).toBeVisible();
  await expect(page.getByText(/Carlos|Helena|prontuário|marcador/i)).toHaveCount(0);
  await context.setOffline(false);
});
