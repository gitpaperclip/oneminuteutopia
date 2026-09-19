import { chromium, type Page } from 'playwright';
import type { MockAgencyRoute } from './agency-route.ts';
import type { MockGovernmentPayload } from './types.ts';

async function confirmationId(page: Page): Promise<string | null> {
  const confirmation = page.locator('#confirmation-message');
  const reference = page.locator('#reference-id');
  try {
    await confirmation.waitFor({ timeout: 15_000 });
  } catch {
    // Some mock pages confirm without this node; continue and read whatever is present.
  }

  if ((await reference.count()) > 0) {
    const value = (await reference.innerText()).trim();
    if (value) return value;
  }
  return null;
}

export async function submitToMockGovernment(
  payload: MockGovernmentPayload,
  route: MockAgencyRoute,
): Promise<string> {
  const headless = process.env.MOCK_GOVERNMENT_HEADLESS === 'true';
  const clickSubmit = process.env.MOCK_GOVERNMENT_CLICK_SUBMIT !== 'false';
  const browser = await chromium.launch({
    headless,
    slowMo: headless ? 0 : 250,
  });

  try {
    const page = await browser.newPage();

    console.log(`Opening ${route.label}...`);
    console.log(route.url);
    await page.goto(route.url);

    console.log(`Opening report form (${route.openButtonName})...`);
    await page.getByRole('button', { name: route.openButtonName }).click();
    await page.locator('#issue-report-form').waitFor();

    console.log('Filling location...');
    await page.locator('#latitude').fill(payload.latitude);
    await page.locator('#longitude').fill(payload.longitude);

    console.log('Filling description...');
    await page.locator('#description').fill(payload.description);
    await page.locator('#photo-url').fill(payload.photoUrl);

    if (!clickSubmit) {
      console.log(`Filled ${route.label}. Not clicking Submit (MOCK_GOVERNMENT_CLICK_SUBMIT=false).`);
      if (!headless) await page.waitForTimeout(8000);
      return `${route.agency}:DEMO-PREVIEW`;
    }

    console.log('Submitting report...');
    await page.locator('#submit-report').click();
    const pageReference = await confirmationId(page);
    const referenceId = pageReference || `MOCK-${route.agency}-${Date.now()}`;
    if (!pageReference) {
      console.warn(
        `No confirmation id on ${route.label}; stored ${referenceId} so this incident is not refiled.`,
      );
    }

    console.log(`Submission recorded for ${route.label}.`);
    console.log(`Reference ID: ${referenceId}`);
    if (!headless) await page.waitForTimeout(2000);
    return `${route.agency}:${referenceId}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Mock government submission failed (${route.agency}): ${message}`);
  } finally {
    await browser.close();
  }
}
