import { test, expect } from '@playwright/test';
import { fulfillPaged } from "./e2e-support/paged";
import { mockGoogleSdk } from "./e2e-support/google";

test.beforeEach(async ({ page }) => mockGoogleSdk(page));

const MOCK_USER = {
  user_id: 1,
  display_name: 'Carlos Eduardo Silva',
  email: 'carlos.silva@email.com',
  roles: ['patient'],
};

const MOCK_LOGIN_RESPONSE = {
  user: MOCK_USER,
};

const MOCK_PROFILE_RESPONSE = {
  user: MOCK_USER,
  patient_profile: {
    preferred_name: 'Carlos Silva',
    full_name: 'Carlos Eduardo Silva',
    avatar_url: null,
    health_status: 'updated',
    blood_type: 'A+',
    is_adult: true,
    age: 41,
  },
};

const MOCK_VACCINES = [
  {
    vaccine_id: 1,
    name: 'COVID-19 (Pfizer)',
    dose: '3ª Dose - Reforço',
    administered_on: '2024-02-10',
    status: 'applied',
  },
];

const MOCK_ALERTS = [
  {
    alert_id: 1,
    type: 'condition',
    title: 'Hipertensão',
    description: 'Controlada.',
    severity: 'high',
  },
];

const MOCK_DOCUMENTS = [];

const MOCK_MARKERS = [
  {
    marker_id: 21,
    type: 'medication',
    name: 'Losartana',
    description: 'Uso contínuo',
    dosage: '50 mg',
    frequency: '1 vez ao dia',
    status: 'active',
    created_at: '2026-10-06T18:30:00.123456',
    updated_at: '2026-10-06T18:30:00.123456',
    removed_at: null,
  },
];


async function waitForHydration(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    const el = document.querySelector('button, input');
    return !!el && Object.getOwnPropertyNames(el).some(k => k.startsWith('__reactFiber'));
  });
}

test.describe('Página de Login', () => {
  test('mantém a moldura lateral alinhada ao dashboard em desktop e mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await waitForHydration(page);

    const desktopIntro = await page.locator('.login-intro').boundingBox();
    const desktopAccess = await page.locator('.login-access').boundingBox();
    expect(desktopIntro?.x).toBeGreaterThanOrEqual(24);
    expect(desktopIntro?.x).toBeLessThanOrEqual(36);
    expect((desktopAccess?.x ?? 0) + (desktopAccess?.width ?? 0)).toBeLessThanOrEqual(1896);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileIntro = await page.locator('.login-intro').boundingBox();
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(mobileIntro?.x).toBeGreaterThanOrEqual(8);
    expect(mobileIntro?.x).toBeLessThanOrEqual(12);
    expect(pageWidth).toBeLessThanOrEqual(390);
  });

  test('exibe os elementos da página corretamente', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);

    await expect(page.getByRole('heading', { name: 'Sua história de saúde, com você.' })).toBeVisible();
    await expect(page.getByText('Documento Unificado de Saúde')).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByPlaceholder('Digite sua senha')).toBeVisible();
    await expect(page.getByRole('button', { name: /Entrar/i })).toBeVisible();
  });

  test('alterna visibilidade da senha', async ({ page }) => {
    await page.goto('/');
    await waitForHydration(page);

    const senhaInput = page.getByRole('textbox', { name: 'Senha' });
    await expect(senhaInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Mostrar senha' }).click();
    await expect(senhaInput).toHaveAttribute('type', 'text');
  });

  test('exibe mensagem de erro com credenciais inválidas', async ({ page }) => {
    await page.route('**/login', (route) =>
      fulfillPaged(route, {
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'E-mail ou senha incorretos.' }),
      })
    );

    await page.goto('/');
    await waitForHydration(page);
    await page.getByLabel('E-mail').fill('errado@email.com');
    await page.getByRole('textbox', { name: 'Senha' }).fill('senhaerrada');
    await page.getByRole('button', { name: /Entrar/i }).click();

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible({ timeout: 10000 });
  });

  test('redireciona para /home após login com sucesso', async ({ page }) => {
    let authenticated = false;
    await page.route('**/login', (route) => {
      authenticated = true;
      return fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_LOGIN_RESPONSE),
      });
    });
    await page.route('**/me', (route) =>
      fulfillPaged(route, {
        status: authenticated ? 200 : 401,
        contentType: 'application/json',
        body: JSON.stringify(
          authenticated ? MOCK_PROFILE_RESPONSE : { detail: 'Autenticação necessária.' }
        ),
      })
    );
    await page.route('**/auth/remembered', (route) => fulfillPaged(route, { status: 204 }));

    await page.goto('/');
    await waitForHydration(page);
    await page.getByLabel('E-mail').fill('carlos.silva@email.com');
    await page.getByRole('textbox', { name: 'Senha' }).fill('senha123');
    await page.getByRole('button', { name: /Entrar/i }).click();

    await expect(page).toHaveURL('/home', { timeout: 10000 });
  });

  test('reabre o app em / com sessão válida e vai direto ao início', async ({ page }) => {
    await page.route('**/me', (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PROFILE_RESPONSE),
      })
    );

    await page.goto('/');

    await expect(page).toHaveURL('/home', { timeout: 10000 });
  });

  for (const width of [320, 1280]) {
    test(`pede somente a senha da conta lembrada em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 720 : 900 });
      let authenticated = false;
      let rememberedBody = '';
      await page.route('**/me', (route) =>
        fulfillPaged(route, {
          status: authenticated ? 200 : 401,
          contentType: 'application/json',
          body: JSON.stringify(
            authenticated ? MOCK_PROFILE_RESPONSE : { detail: 'Sessão inválida ou expirada.' }
          ),
        })
      );
      await page.route('**/auth/remembered', (route) =>
        fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ first_name: 'Carlos', masked_email: 'c•••@email.com' }),
        })
      );
      await page.route('**/login/remembered', (route) => {
        authenticated = true;
        rememberedBody = route.request().postData() ?? '';
        return fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_LOGIN_RESPONSE),
        });
      });

      await page.goto('/');
      await waitForHydration(page);

      await expect(page.getByText('Olá, Carlos')).toBeVisible();
      await expect(page.getByText('c•••@email.com')).toBeVisible();
      await expect(page.getByLabel('E-mail')).toHaveCount(0);
      const anotherAccount = page.getByRole('button', { name: 'Usar outra conta' });
      expect((await anotherAccount.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

      await page.getByRole('textbox', { name: 'Senha' }).fill('senha123');
      await page.getByRole('button', { name: /Entrar/i }).click();

      await expect(page).toHaveURL('/home', { timeout: 10000 });
      expect(rememberedBody).toContain('name="password"');
      expect(rememberedBody).not.toContain('name="username"');
    });
  }

  test('usar outra conta esquece o aparelho e volta ao login completo', async ({ page }) => {
    let forgotten = false;
    await page.route('**/me', (route) =>
      fulfillPaged(route, {
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Autenticação necessária.' }),
      })
    );
    await page.route('**/auth/remembered', (route) => {
      if (route.request().method() === 'DELETE') {
        forgotten = true;
        return fulfillPaged(route, { status: 204 });
      }
      return fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ first_name: 'Carlos', masked_email: 'c•••@email.com' }),
      });
    });

    await page.goto('/');
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Usar outra conta' }).click();

    await expect(page.getByLabel('E-mail')).toBeFocused();
    await expect(page.getByText('Olá, Carlos')).toHaveCount(0);
    expect(forgotten).toBe(true);
  });
});

test.describe('Página Home', () => {
  test.beforeEach(async ({ page }) => {
    let nextMarkerId = 22;
    let activeMarkers = MOCK_MARKERS.map((marker) => ({ ...marker }));
    let removedMarkers = [];
    let activeShare = null;

    await page.route('**/me', (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PROFILE_RESPONSE),
      })
    );
    await page.route(/\/me\/vaccines(\?.*)?$/, (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_VACCINES),
      })
    );
    await page.route(/\/me\/alerts(\?.*)?$/, (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ALERTS),
      })
    );
    let documents = [...MOCK_DOCUMENTS];
    await page.route(/\/me\/documents(\?.*)?$/, (route) => {
      if (route.request().method() === 'POST') {
        const created = {
          document_id: 42,
          title: 'Receita digitalizada',
          type: 'prescription',
          original_filename: 'documento-digitalizado.jpg',
          media_type: 'image/jpeg',
          size_bytes: 4096,
          status: 'uploaded',
          created_at: '2026-10-11T12:00:00',
          uploaded_by_doctor: null,
        };
        // The list reloads from the server after an upload (spec 038).
        documents = [created, ...documents];
        return fulfillPaged(route, {
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            document_id: 42,
            title: 'Receita digitalizada',
            type: 'prescription',
            original_filename: 'documento-digitalizado.jpg',
            media_type: 'image/jpeg',
            size_bytes: 4096,
            status: 'uploaded',
            created_at: '2026-10-11T12:00:00',
          }),
        });
      }
      return fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(documents),
      });
    });
    await page.route(/\/me\/(care-(invitations|groups|requests|doctors)|guardianships|guardians)(\?.*)?$/, (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    );
    await page.route('**/medical/patient-links**', (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    );
    await page.route('**/me/markers**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const markerId = Number(url.pathname.split('/').at(-1));

      if (request.method() === 'GET') {
        const body = url.searchParams.get('status') === 'removed'
          ? removedMarkers
          : activeMarkers;
        return fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      }

      if (request.method() === 'POST') {
        const payload = request.postDataJSON();
        const created = {
          marker_id: nextMarkerId++,
          ...payload,
          status: 'active',
          created_at: '2026-10-06T18:30:00.123456',
          updated_at: '2026-10-06T18:30:00.123456',
          removed_at: null,
        };
        activeMarkers = [...activeMarkers, created];
        return fulfillPaged(route, {
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
      }

      if (request.method() === 'PUT') {
        const payload = request.postDataJSON();
        const current = activeMarkers.find((marker) => marker.marker_id === markerId);
        const updated = {
          ...current,
          ...payload,
          updated_at: '2026-10-06T18:35:00.123456',
        };
        activeMarkers = activeMarkers.map((marker) =>
          marker.marker_id === markerId ? updated : marker
        );
        return fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updated),
        });
      }

      if (request.method() === 'DELETE') {
        const current = activeMarkers.find((marker) => marker.marker_id === markerId);
        activeMarkers = activeMarkers.filter((marker) => marker.marker_id !== markerId);
        removedMarkers = [
          {
            ...current,
            status: 'removed',
            updated_at: '2026-10-06T18:40:00.123456',
            removed_at: '2026-10-06T18:40:00.123456',
          },
          ...removedMarkers,
        ];
        return fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Marcador removido com sucesso!' }),
        });
      }

      return route.abort();
    });
    await page.route('**/me/shares**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === 'GET' && url.pathname === '/me/shares/active') {
        return fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(activeShare),
        });
      }

      if (request.method() === 'POST' && url.pathname === '/me/shares') {
        activeShare = {
          share_id: 42,
          share_url: `http://localhost:3000/share#${'v'.repeat(43)}`,
          created_at: '2099-10-09T12:00:00',
          expires_at: '2099-10-09T14:00:00',
        };
        return fulfillPaged(route, {
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(activeShare),
        });
      }

      if (request.method() === 'DELETE' && url.pathname === '/me/shares/42') {
        activeShare = null;
        return fulfillPaged(route, { status: 204 });
      }

      return route.abort();
    });
    await page.goto('/home');
    await waitForHydration(page);
  });

  test('exibe o nome do paciente logado', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Carlos Silva' })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('navigation', { name: 'Contexto de acesso' })).toHaveCount(0);
    await expect(page.locator('.authenticated-shell')).not.toHaveClass(/has-context-dock/);
  });

  for (const width of [320, 1280]) {
    test(`digitaliza uma página com consentimento em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 760 : 900 });
      const documentPage = await page.request.get('/home');
      expect(documentPage.headers()['permissions-policy']).toBe('camera=(self)');
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: {
            getUserMedia: async (constraints: MediaStreamConstraints) => {
              (window as typeof window & { __cameraConstraints?: MediaStreamConstraints })
                .__cameraConstraints = constraints;
              const canvas = document.createElement('canvas');
              canvas.width = 600;
              canvas.height = 800;
              const context = canvas.getContext('2d');
              context?.fillRect(0, 0, canvas.width, canvas.height);
              const stream = canvas.captureStream();
              (window as typeof window & { __cameraStream?: MediaStream })
                .__cameraStream = stream;
              return stream;
            },
          },
        });
      });

      await page.getByRole('button', { name: 'Adicionar documento' }).click();
      await expect(page.getByLabel('Título do documento')).toBeFocused();
      await page.getByLabel('Título do documento').fill('Receita digitalizada');
      await page.getByLabel('Tipo do documento').click();
      await page.getByRole('option', { name: 'Receita' }).click();
      await page.getByRole('button', { name: 'Digitalizar com a câmera' }).click();

      const livePreview = page.getByLabel('Prévia ao vivo do documento');
      await expect(livePreview).toBeVisible();
      await page.waitForFunction(() => {
        const video = document.querySelector('video[aria-label="Prévia ao vivo do documento"]');
        return video instanceof HTMLVideoElement && video.videoWidth > 0;
      });
      expect(await page.evaluate(() => (
        window as typeof window & { __cameraConstraints?: MediaStreamConstraints }
      ).__cameraConstraints)).toEqual({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });

      await page.getByRole('button', { name: 'Capturar página' }).click();
      await expect(page.getByAltText('Página digitalizada para revisão')).toBeVisible();
      expect(await page.evaluate(() => (
        window as typeof window & { __cameraStream?: MediaStream }
      ).__cameraStream?.getTracks().every((track) => track.readyState === 'ended'))).toBe(true);

      const uploadRequest = page.waitForRequest((request) =>
        request.url().endsWith('/me/documents') && request.method() === 'POST'
      );
      await page.getByRole('button', { name: 'Enviar documento' }).click();
      const request = await uploadRequest;
      expect(request.postData()).toContain('documento-digitalizado.jpg');
      expect(request.postData()).not.toContain('source');
      await expect(page.getByText('Receita digitalizada')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }

  test('gera QR temporário e revoga o acesso em 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });

    await page.getByRole('button', { name: 'Gerar acesso temporário' }).click();

    await expect(page.getByLabel('QR-Code do compartilhamento')).toBeVisible();
    await expect(page.getByText(/Tempo restante/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copiar link' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

    const cancelAccess = page.getByRole('button', { name: 'Cancelar acesso', exact: true });
    await expect(cancelAccess).toBeVisible();
    expect((await cancelAccess.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(cancelAccess).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
    await page.setViewportSize({ width: 320, height: 720 });
    await cancelAccess.click();
    const dialog = page.getByRole('alertdialog', { name: 'Revogar acesso temporário' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manter acesso' })).toBeFocused();
    await page.getByRole('button', { name: 'Confirmar revogação' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Gerar acesso temporário' })).toBeVisible();
  });

  test('abre resumo público sem login, preserva o fragmento e organiza em abas', async ({ page }) => {
    const token = 'v'.repeat(43);
    await page.route('**/public/shares/summary', async (route) => {
      expect(await route.request().headerValue('x-share-token')).toBe(token);
      return fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          expires_at: '2099-10-09T14:00:00',
          patient: { preferred_name: 'Carlos', blood_type: 'A+' },
          markers: {
            allergies: [{ name: 'Dipirona', description: 'Reação cutânea' }],
            medications: [{
              name: 'Losartana',
              description: 'Uso contínuo',
              dosage: '50 mg',
              frequency: '1 vez ao dia',
            }],
            conditions: [],
            diagnoses: [{ name: 'Hipertensão', description: null }],
          },
        }),
      });
    });

    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`/share#${token}`);

    await expect(page.getByRole('heading', { name: 'Resumo de Carlos' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#${token}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const tablist = page.getByRole('tablist', { name: 'Categorias clínicas' });
    await expect(tablist.getByRole('tab', { name: 'Alergias (1)' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText('Dipirona');
    const tab = tablist.getByRole('tab', { name: 'Medicações ativas (1)' });
    expect((await tab.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await tab.click();
    await expect(page.getByRole('tabpanel')).toContainText('Losartana');
    await tablist.getByRole('tab', { name: 'Condições (0)' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Nenhuma condição registrada.');

    await page.setViewportSize({ width: 1440, height: 900 });
    await tablist.getByRole('tab', { name: 'Diagnósticos (1)' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Hipertensão');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  for (const width of [320, 1440]) {
    test(`mantém QR público atualizado após alterar tipo sanguíneo e recarregar em ${width} px`, async ({ page, context }) => {
      const token = 'v'.repeat(43);
      const expiresAt = '2099-10-09T14:00:00';
      let profile = { ...MOCK_PROFILE_RESPONSE.patient_profile, blood_type: 'AB+', blood_type_source: 'patient' };
      let revoked = false;
      let temporaryFailure = false;
      await page.route('**/me', (route) => fulfillPaged(route, {
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_PROFILE_RESPONSE, patient_profile: profile }),
      }));
      await page.route('**/me/blood-type', (route) => {
        profile = { ...profile, ...route.request().postDataJSON() };
        return fulfillPaged(route, {
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ blood_type: profile.blood_type, blood_type_source: 'patient' }),
        });
      });
      await page.route('**/me/shares/42', (route) => {
        revoked = true;
        return route.fulfill({ status: 204 });
      });
      await context.route('**/public/shares/summary', async (route) => {
        expect(await route.request().headerValue('x-share-token')).toBe(token);
        expect(await route.request().headerValue('cookie')).toBeNull();
        return route.fulfill({
          status: revoked ? 404 : temporaryFailure ? 503 : 200,
          contentType: 'application/json',
          body: JSON.stringify(revoked || temporaryFailure ? { detail: 'Indisponível' } : {
            expires_at: expiresAt,
            patient: { preferred_name: 'Carlos', blood_type: profile.blood_type },
            markers: { allergies: [], medications: [], conditions: [], diagnoses: [] },
          }),
        });
      });
      await page.reload();
      await waitForHydration(page);
      await page.getByRole('button', { name: 'Gerar acesso temporário' }).click();
      await expect(page.getByLabel('QR-Code do compartilhamento')).toBeVisible();

      const recipient = await context.newPage();
      await recipient.setViewportSize({ width, height: 900 });
      await recipient.goto(`/share#${token}`);
      await expect(recipient.getByText('AB+', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Alterar', exact: true }).click();
      await page.getByLabel('Tipo sanguíneo', { exact: true }).click();
      await page.getByRole('option', { name: 'O-' }).click();
      await page.getByRole('button', { name: 'Confirmar alteração' }).click();
      await expect(page.getByRole('dialog', { name: 'Alterar tipo sanguíneo' })).toBeHidden();
      expect(profile.blood_type).toBe('O-');

      const refresh = recipient.getByRole('button', { name: 'Atualizar dados' });
      expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await refresh.focus();
      await recipient.keyboard.press('Enter');
      await expect(recipient.getByText('O-', { exact: true })).toBeVisible();
      await recipient.reload();
      await expect(recipient.getByText('O-', { exact: true })).toBeVisible();
      expect(new URL(recipient.url()).hash).toBe(`#${token}`);
      await expect(recipient.getByText('Disponível até').locator('..')).toContainText('09/10/2099');
      expect(await recipient.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await recipient.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
      await recipient.screenshot({ path: `/tmp/dus-qr-${width}.png`, fullPage: true });

      temporaryFailure = true;
      await refresh.click();
      await expect(recipient.getByRole('alert').filter({ hasText: 'Não foi possível consultar agora' })).toBeVisible();
      await expect(recipient.getByText('O-', { exact: true })).toHaveCount(0);
      temporaryFailure = false;
      await recipient.getByRole('button', { name: 'Tentar novamente' }).click();
      await expect(recipient.getByText('O-', { exact: true })).toBeVisible();

      await page.getByRole('button', { name: 'Cancelar acesso', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar revogação' }).click();
      await expect(page.getByRole('button', { name: 'Gerar acesso temporário' })).toBeVisible();
      await refresh.click();
      await expect(recipient.getByRole('heading', { name: 'Este acesso não está disponível' })).toBeVisible();
      await expect(recipient.getByText('O-', { exact: true })).toHaveCount(0);
      await recipient.reload();
      await expect(recipient.getByRole('heading', { name: 'Este acesso não está disponível' })).toBeVisible();
      await recipient.close();
    });
  }

  test('move o seletor de contexto para um dock em mobile e mantém o header no desktop', async ({ page }) => {
    await page.unroute('**/me');
    await page.route('**/me', (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            ...MOCK_USER,
            roles: ['patient', 'doctor'],
          },
          patient_profile: MOCK_PROFILE_RESPONSE.patient_profile,
        }),
      })
    );
    await page.route(/\/medical\/patients(\?.*)?$/, (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    );

    await page.setViewportSize({ width: 320, height: 720 });
    await page.reload();
    const contextNav = page.getByRole('navigation', { name: 'Contexto de acesso' });
    const mobileStyle = await contextNav.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        position: style.position,
        bottom: bounds.bottom,
        viewportHeight: window.innerHeight,
        shellPadding: getComputedStyle(document.querySelector('.authenticated-shell')).paddingBottom,
      };
    });

    expect(mobileStyle.position).toBe('fixed');
    expect(mobileStyle.bottom).toBeGreaterThan(mobileStyle.viewportHeight - 100);
    expect(parseFloat(mobileStyle.shellPadding)).toBeGreaterThan(0);
    expect(await contextNav.evaluate((element) => element.closest('.identity-bar'))).toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await expect(contextNav.getByRole('link', { name: 'Minha saúde' })).toBeVisible();
    expect((await contextNav.getByRole('link', { name: 'Minha saúde' }).boundingBox())?.height)
      .toBeGreaterThanOrEqual(44);
    await contextNav.getByRole('link', { name: 'Área profissional' }).click();
    await expect(page).toHaveURL('/medical');
    await expect(page.getByRole('heading', { name: 'Pacientes em acompanhamento' })).toBeVisible();
    await expect(contextNav.getByRole('link', { name: 'Área profissional' })).toHaveAttribute('aria-current', 'page');
    await contextNav.getByRole('link', { name: 'Minha saúde' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/patient');
    await expect(contextNav.getByRole('link', { name: 'Minha saúde' })).toHaveAttribute('aria-current', 'page');

    await page.setViewportSize({ width: 475, height: 900 });
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom)).toBeLessThan(100);

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom)).toBeLessThan(100);
    await expect.poll(() => page.locator('.authenticated-shell').evaluate((element) => getComputedStyle(element).paddingBottom)).not.toBe('0px');

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom)).toBeLessThan(100);

    await page.setViewportSize({ width: 1199, height: 800 });
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom)).toBeLessThan(100);

    await page.setViewportSize({ width: 1200, height: 900 });
    await expect.poll(() => contextNav.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
    await expect.poll(() => contextNav.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(24);
    await expect.poll(() => contextNav.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(72);
  });

  test('explica e informa o tipo sanguíneo em 320 px e desktop', async ({ page }) => {
    let profile = {
      ...MOCK_PROFILE_RESPONSE.patient_profile,
      blood_type: null,
      blood_type_source: null,
    };
    let submitted;
    await page.route('**/me', (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MOCK_PROFILE_RESPONSE, patient_profile: profile }),
      })
    );
    await page.route('**/me/blood-type', (route) => {
      submitted = route.request().postDataJSON();
      profile = { ...profile, blood_type: 'O+', blood_type_source: 'patient' };
      return fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ blood_type: 'O+', blood_type_source: 'patient' }),
      });
    });

    await page.setViewportSize({ width: 320, height: 780 });
    await page.reload();
    await waitForHydration(page);
    const info = page.getByRole('button', { name: 'Sobre o tipo sanguíneo' });
    const infoBox = await info.boundingBox();
    expect(infoBox?.width).toBeGreaterThanOrEqual(44);
    expect(infoBox?.height).toBeGreaterThanOrEqual(44);
    await info.click();
    const tooltip = page.locator('.blood-type-tooltip');
    await expect(tooltip).toContainText('Você pode informar o seu tipo sanguíneo');
    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
    expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(320);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Informar tipo sanguíneo' }).click();
    await page.getByLabel('Tipo sanguíneo', { exact: true }).click();
    await page.getByRole('option', { name: 'O+' }).click();
    await page.getByRole('button', { name: 'Salvar tipo sanguíneo' }).click();

    await expect(page.getByRole('button', { name: 'Alterar' })).toBeVisible();
    expect(submitted).toEqual({ blood_type: 'O+' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

    await page.setViewportSize({ width: 1440, height: 900 });
    await info.click();
    await expect(tooltip).toContainText('Informado por você.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  });

  test('preserva avatar e resumo do perfil sem expor CPF', async ({ page }) => {
    const avatar = page.getByRole('img', { name: 'Avatar de Carlos Silva' });
    await expect(avatar).toBeVisible();
    await expect(avatar).toContainText('CS');
    await expect(page.getByText('Meu perfil')).toBeVisible();
    await expect(page.getByText('Carlos Eduardo Silva')).toBeVisible();
    await expect(page.getByText('41 anos')).toBeVisible();
    await expect(page.getByText('A+')).toBeVisible();
    await expect(page.locator('.patient-main')).not.toContainText(/CPF/i);
  });

  test('exibe vacinas do paciente', async ({ page }) => {
    await expect(page.getByText('COVID-19 (Pfizer)')).toBeVisible({ timeout: 10000 });
  });

  test('usa diálogo responsivo para registrar vacina', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const trigger = page.getByRole('button', { name: 'Adicionar vacina' });

    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Registrar vacina' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Nome da vacina')).toBeFocused();

    const bounds = await dialog.boundingBox();
    const style = await dialog.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        radius: computed.borderRadius,
      };
    });
    expect(bounds?.x).toBe(0);
    expect(bounds?.width).toBeLessThanOrEqual(390);
    expect(style.background).toBe('rgb(255, 255, 255)');
    expect(style.radius).not.toBe('0px');
    await page.getByLabel('Nome da vacina').fill('Influenza tetravalente');
    await page.getByLabel('Dose').fill('Dose anual');
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Pendente' }).click();
    await expect(page.getByLabel('Data de aplicação')).toBeDisabled();
    await page.getByLabel('Status').click();
    await page.getByRole('option', { name: 'Aplicada' }).click();
    await expect(page.getByLabel('Data de aplicação')).toBeEnabled();
    await page.getByLabel('Data de aplicação').fill('2026-04-15');
    await page.getByRole('button', { name: 'Registrar vacina' }).click();

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  for (const width of [320, 1440]) {
    test.describe(`sugestões em ${width} px`, () => {
      test.use({ hasTouch: width === 320 });
      test(`sugere nomes de marcadores por categoria em ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 320 ? 720 : 900 });
        await page.getByRole('button', { name: 'Adicionar marcador' }).click();
        const dialog = page.getByRole('dialog', { name: 'Adicionar marcador' });
        const input = page.getByRole('combobox', { name: 'Nome do marcador' });
        await expect(input).toBeFocused();
        await dialog.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
        await expect(input).toHaveAttribute('aria-expanded', 'false');
        const typeBefore = await page.getByLabel('Tipo', { exact: true }).boundingBox();
        const dialogBefore = await dialog.boundingBox();
        await input.click();
        await expect(input).toHaveAttribute('aria-expanded', 'true');
        const typeAfter = await page.getByLabel('Tipo', { exact: true }).boundingBox();
        const dialogAfter = await dialog.boundingBox();
        expect(Math.abs(typeAfter!.y - typeBefore!.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(dialogAfter!.height - dialogBefore!.height)).toBeLessThanOrEqual(1);
        const menu = page.locator('.marker-name-suggestions');
        await menu.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
        await expect(menu).toHaveCSS('overflow-y', 'auto');
        const menuAppearance = await menu.evaluate((element) => {
          const style = getComputedStyle(element);
          return { background: style.backgroundColor, border: style.borderColor, radius: style.borderRadius, shadow: style.boxShadow };
        });
        const menuBounds = await menu.boundingBox();
        const inputBounds = await input.boundingBox();
        expect(Math.abs(menuBounds!.x - inputBounds!.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(menuBounds!.width - inputBounds!.width)).toBeLessThanOrEqual(1);
        expect(menuBounds!.y - (inputBounds!.y + inputBounds!.height)).toBeGreaterThanOrEqual(0);
        expect(menuBounds!.y - (inputBounds!.y + inputBounds!.height)).toBeLessThanOrEqual(8);
        expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
        await expect(page.getByRole('option')).toHaveCount(6);
        await expect(page.getByRole('group', { name: 'Cardiovascular' })).toBeVisible();
        await expect(page.getByRole('group', { name: 'Diabetes / Metabolismo' })).toHaveCount(1);
        await expect(page.getByRole('group', { name: 'Composição corporal' })).toHaveCount(1);
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        for (const option of await page.getByRole('option').all()) {
          expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({ path: `/tmp/dus-marker-select-${width}.png` });
        await input.fill('PRESSAO');
        await expect(page.getByRole('option')).toHaveCount(1);
        await page.screenshot({ path: `/tmp/dus-marker-search-${width}.png` });
        await input.press('ArrowDown');
        await input.press('Enter');
        await expect(input).toHaveValue('Pressão arterial (sistólica/diastólica)');
        await page.getByRole('button', { name: 'Abrir sugestões de marcadores' }).click();
        await expect(page.getByRole('option', { name: 'Pressão arterial (sistólica/diastólica)' })).toHaveAttribute('aria-selected', 'true');
        await menu.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
        await page.screenshot({ path: `/tmp/dus-marker-selected-${width}.png` });
        await page.getByRole('button', { name: 'Fechar sugestões de marcadores' }).click();
        await expect(dialog).toBeVisible();
        await input.press('ArrowDown');
        await input.press('Escape');
        await expect(dialog).toBeVisible();
        await expect(input).toHaveAttribute('aria-expanded', 'false');
        await input.fill('');
        const corporalOption = page.getByRole('option', { name: 'Circunferência abdominal' });
        if (width === 320) await corporalOption.tap();
        else await corporalOption.click();
        await expect(input).toHaveValue('Circunferência abdominal');
        await page.getByRole('button', { name: 'Abrir sugestões de marcadores' }).click();
        await expect(page.getByRole('option', { name: 'Circunferência abdominal' })).toHaveAttribute('data-state', 'checked');
        await page.getByRole('button', { name: 'Fechar sugestões de marcadores' }).click();
        const typeSelect = page.getByLabel('Tipo', { exact: true });
        await expect(typeSelect).toContainText('Condição');
        await typeSelect.click();
        const typeAppearance = await page.locator('.clinical-select-content').evaluate((element) => {
          const style = getComputedStyle(element);
          return { background: style.backgroundColor, border: style.borderColor, radius: style.borderRadius, shadow: style.boxShadow };
        });
        expect(menuAppearance).toEqual(typeAppearance);
        await page.getByRole('option', { name: 'Condição', exact: true }).click();
        const saved = page.waitForRequest((request) => request.url().endsWith('/me/markers') && request.method() === 'POST');
        await page.getByRole('button', { name: 'Adicionar marcador' }).click();
        expect((await saved).postDataJSON()).toMatchObject({ name: 'Circunferência abdominal', type: 'condition' });
        await expect(dialog).toBeHidden();
        await expect(page.getByRole('heading', { name: 'Circunferência abdominal' })).toBeVisible();
      });
    });
  }

  test('gerencia marcador em diálogos acessíveis e preserva o histórico', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const addTrigger = page.getByRole('button', { name: 'Adicionar marcador' });
    const activeTab = page.locator('.marker-view-switch button[aria-pressed="true"]');
    const activeTabStyles = await activeTab.evaluate((element) => ({
      color: getComputedStyle(element).color,
      badgeBackground: getComputedStyle(element.querySelector('span')).backgroundColor,
    }));
    expect(activeTabStyles.color).toBe('rgb(23, 79, 194)');
    expect(activeTabStyles.badgeBackground).toBe('rgb(239, 244, 255)');

    await addTrigger.click();

    const formDialog = page.getByRole('dialog', { name: 'Adicionar marcador' });
    await expect(formDialog).toBeVisible();
    await expect(page.getByLabel('Nome do marcador')).toBeFocused();
    const formBounds = await formDialog.boundingBox();
    expect(formBounds?.x).toBe(0);
    expect(formBounds?.width).toBeLessThanOrEqual(390);

    await page.getByLabel('Nome do marcador').fill('Metformina');
    await page.getByLabel('Tipo', { exact: true }).click();
    await page.getByRole('option', { name: 'Medicação' }).click();
    await page.getByLabel('Dosagem').fill('500 mg');
    await page.getByLabel('Frequência').fill('2 vezes ao dia');
    await page.getByRole('button', { name: 'Adicionar marcador' }).click();

    await expect(formDialog).toBeHidden();
    await expect(addTrigger).toBeFocused();
    await expect(page.getByText('Metformina')).toBeVisible();

    await page.getByRole('button', { name: 'Editar Metformina' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Editar marcador' });
    await expect(editDialog).toBeVisible();
    await page.getByLabel('Nome do marcador').fill('Metformina XR');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(editDialog).toBeHidden();
    await expect(page.getByText('Metformina XR')).toBeVisible();

    const removeTrigger = page.getByRole('button', { name: 'Remover Metformina XR' });
    await removeTrigger.click();
    const confirmation = page.getByRole('alertdialog', { name: 'Remover marcador' });
    await expect(confirmation).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar remoção' })).toBeFocused();
    await page.getByRole('button', { name: 'Cancelar remoção' }).click();
    await expect(confirmation).toBeHidden();
    await expect(removeTrigger).toBeFocused();

    await removeTrigger.click();
    await page.getByRole('button', { name: 'Remover do resumo' }).click();
    await expect(page.locator('.marker-card', { hasText: 'Metformina XR' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Remover Losartana' }).click();
    await page.getByRole('button', { name: 'Remover do resumo' }).click();
    await expect(page.locator('.marker-card', { hasText: 'Losartana' })).toHaveCount(0);

    const emptyState = page.locator('.marker-empty');
    const emptyStateStyles = await emptyState.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      border: getComputedStyle(element).borderTopColor,
      icon: getComputedStyle(element.querySelector('span')).color,
    }));
    expect(emptyStateStyles.background).toBe('rgb(247, 248, 250)');
    expect(emptyStateStyles.border).toBe('rgb(203, 214, 229)');
    expect(emptyStateStyles.icon).toBe('rgb(23, 79, 194)');

    await page.getByRole('button', { name: 'Histórico' }).click();
    await expect(page.getByText('Metformina XR')).toBeVisible();
    await expect(page.getByText('Removido em 06/10/2026').first()).toBeVisible();
  });

  test('mantém o dashboard amplo e os cards alinhados em desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.unroute(/\/me\/vaccines(\?.*)?$/);
    await page.route(/\/me\/vaccines(\?.*)?$/, (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          ...MOCK_VACCINES,
          {
            vaccine_id: 2,
            name: 'Influenza',
            dose: 'Dose Anual',
            administered_on: null,
            status: 'pending',
          },
          {
            vaccine_id: 3,
            name: 'Hepatite B',
            dose: '3ª Dose',
            administered_on: '2024-01-05',
            status: 'applied',
          },
        ]),
      })
    );
    await page.goto('/home');
    await waitForHydration(page);

    const dashboard = await page.locator('.patient-main').boundingBox();
    const contentWidth = await page.evaluate(() => {
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue('--ds-layout-content');
      return Number.parseFloat(token) * Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
    });
    expect(dashboard?.width).toBeCloseTo(contentWidth, 0);
    expect(dashboard?.x).toBeCloseTo((1920 - contentWidth) / 2, 0);

    const vaccineCards = await page.locator('.vaccine-entry').all();
    const cardBounds = await Promise.all(vaccineCards.map((card) => card.boundingBox()));
    expect(cardBounds).toHaveLength(3);
    expect(cardBounds[0]?.y).toBeCloseTo(cardBounds[1]?.y ?? 0, 0);
    expect(cardBounds[2]?.y).toBeGreaterThan(cardBounds[1]?.y ?? 0);
    expect(cardBounds.every((bounds) => (bounds?.width ?? 0) > 500)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileDashboard = await page.locator('.patient-main').boundingBox();
    const mobileCards = await Promise.all(
      vaccineCards.map((card) => card.boundingBox())
    );
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(mobileDashboard?.x).toBeGreaterThanOrEqual(8);
    expect(mobileDashboard?.x).toBeLessThanOrEqual(12);
    expect(mobileDashboard?.width).toBeLessThan(390);
    expect(pageWidth).toBeLessThanOrEqual(390);
    expect(mobileCards[1]?.y).toBeGreaterThan(mobileCards[0]?.y ?? 0);
    expect(mobileCards[2]?.y).toBeGreaterThan(mobileCards[1]?.y ?? 0);
  });

  test('oferece busca, prontuário e suspensão na área médica responsiva', async ({ page }) => {
    const medicalPatient = {
      patient_id: 10,
      preferred_name: 'Carlos Silva',
      full_name: 'Carlos Eduardo Silva',
      avatar_url: null,
      health_status: 'updated',
      age: 41,
    };
    let medicalActiveMarkers = MOCK_MARKERS.map((marker) => ({ ...marker }));
    let medicalRemovedMarkers = [];
    let denyMedicalRecord = false;

    await page.unroute('**/me');
    await page.route('**/me', (route) =>
      fulfillPaged(route, {
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            user_id: 7,
            display_name: 'Dr. Rui Lima',
            email: 'rui@example.com',
            roles: ['doctor'],
          },
          patient_profile: null,
        }),
      })
    );
    await page.route('**/medical/patients**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.pathname === '/medical/patients') {
        return fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([medicalPatient]),
        });
      }

      if (url.pathname === '/medical/patients/10') {
        if (denyMedicalRecord) {
          return fulfillPaged(route, {
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Paciente não autorizado.' }),
          });
        }
        return fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            patient: {
              ...medicalPatient,
              blood_type: 'A+',
              blood_type_source: 'patient',
            },
            vaccines: MOCK_VACCINES,
            markers: {
              active: medicalActiveMarkers,
              removed: medicalRemovedMarkers,
            },
          }),
        });
      }

      if (
        url.pathname === '/medical/patients/10/blood-type' &&
        request.method() === 'PUT'
      ) {
        return fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...request.postDataJSON(),
            blood_type_source: 'doctor',
          }),
        });
      }

      if (url.pathname === '/medical/patients/10/documents') {
        return fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      if (
        url.pathname === '/medical/patients/10/markers' &&
        request.method() === 'POST'
      ) {
        const created = {
          marker_id: 22,
          ...request.postDataJSON(),
          status: 'active',
          created_at: '2026-10-08T17:50:00',
          updated_at: '2026-10-08T17:50:00',
          removed_at: null,
        };
        medicalActiveMarkers = [...medicalActiveMarkers, created];
        return fulfillPaged(route, {
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
      }

      if (
        url.pathname === '/medical/patients/10/markers/21' &&
        request.method() === 'DELETE'
      ) {
        const removed = medicalActiveMarkers.find((item) => item.marker_id === 21);
        medicalActiveMarkers = medicalActiveMarkers.filter(
          (item) => item.marker_id !== 21,
        );
        medicalRemovedMarkers = [
          {
            ...removed,
            status: 'removed',
            removed_at: '2026-10-08T18:00:00',
          },
        ];
        return fulfillPaged(route, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Marcador removido com sucesso!' }),
        });
      }

      return route.abort();
    });
    await page.setViewportSize({ width: 320, height: 720 });
    await page.reload();

    await expect(
      page.getByRole('heading', { name: 'Pacientes em acompanhamento' }),
    ).toBeVisible();
    await expect(page.getByText('Carlos Eduardo Silva')).toBeVisible();
    await expect(page.locator('.doctor-main')).not.toContainText(/CPF:\s*\d/i);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);

    const searchRequest = page.waitForRequest((request) =>
      request.url().includes('/medical/patients?') && request.url().includes('query=Carlos')
    );
    await page.getByLabel('Buscar paciente').fill('Carlos');
    await searchRequest;

    await page.getByRole('link', {
      name: 'Abrir prontuário de Carlos Silva',
    }).click();
    await expect(page).toHaveURL(/\/medical\/patients\/\d+$/);
    const recordUrl = page.url();
    await expect(
      page.getByRole('heading', { name: 'Carlos Eduardo Silva' }),
    ).toBeVisible();
    await expect(page.getByText('COVID-19 (Pfizer)')).toBeVisible();
    await expect(page.getByText('Losartana')).toBeVisible();

    await expect(page.getByText('autodeclarado')).toBeVisible();
    await page.getByRole('button', { name: 'Corrigir' }).click();
    await page.getByLabel('Tipo sanguíneo', { exact: true }).click();
    await page.getByRole('option', { name: 'A-' }).click();
    await page.getByRole('button', { name: 'Confirmar alteração' }).click();
    await expect(page.getByText('registrado por profissional')).toBeVisible();
    await expect(page.locator('.medical-vitals')).toContainText('A-');

    await page.getByRole('button', { name: 'Adicionar marcador' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/dus-dialog-320.png' });
    await page.getByLabel('Nome do marcador').fill('Insuficiência renal leve');
    await page.getByLabel('Tipo', { exact: true }).click();
    await page.getByRole('option', { name: 'Diagnóstico' }).click();
    await page.getByRole('button', { name: 'Adicionar marcador' }).click();
    await expect(page.getByText('Insuficiência renal leve')).toBeVisible();

    const suspendTrigger = page.getByRole('button', { name: 'Suspender Losartana' });
    await suspendTrigger.click();
    const confirmation = page.getByRole('alertdialog', {
      name: 'Suspender medicação',
    });
    await expect(confirmation).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cancelar suspensão' }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Suspender medicação' }).click();
    await expect(confirmation).toBeHidden();

    await page.getByRole('button', { name: 'Histórico' }).click();
    await expect(page.getByText('Losartana')).toBeVisible();
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(320);

    await page.getByRole('link', { name: 'Voltar para pacientes' }).click();
    await expect(page).toHaveURL('/medical');
    await page.goBack();
    await expect(page).toHaveURL(recordUrl);
    await expect(
      page.getByRole('heading', { name: 'Carlos Eduardo Silva' }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Carlos Eduardo Silva' }),
    ).toBeVisible();

    denyMedicalRecord = true;
    await page.goto(recordUrl);
    await expect(page.getByText('Acesso ao prontuário negado.')).toBeVisible();
    await expect(page.getByText('Losartana')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Voltar para pacientes' }),
    ).toHaveAttribute('href', '/medical');
  });

  test('redireciona para login se não há sessão', async ({ page }) => {
    await page.unroute('**/me');
    await page.route('**/me', (route) =>
      fulfillPaged(route, {
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Autenticação necessária.' }),
      })
    );
    await page.reload({ waitUntil: 'commit' }).catch(() => undefined);
    await expect(page).toHaveURL('/', { timeout: 15000 });
  });
});
