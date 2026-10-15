import type { Page } from "@playwright/test";

// Keep authentication tests independent of the Google service and real accounts.
export async function mockGoogleSdk(page: Page) {
  await page.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `window.google = { accounts: { id: {
      initialize(options) { this.callback = options.callback; },
      renderButton(container, options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Continuar com Google';
        button.style.minHeight = '44px';
        button.style.width = options.width + 'px';
        button.style.maxWidth = '100%';
        button.style.font = 'inherit';
        button.addEventListener('click', () => this.callback({ credential: 'test-google-credential' }));
        container.replaceChildren(button);
      }
    } } };`,
  }));
}
