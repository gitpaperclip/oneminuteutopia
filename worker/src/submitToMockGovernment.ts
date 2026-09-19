import { chromium } from 'playwright';
import type { MockGovernmentPayload } from './types.ts';

const MOCK_GOVERNMENT_URL =
  process.env.MOCK_GOVERNMENT_URL?.trim() ||
  'https://mock-government-page-without-api.vercel.app/';

export async function submitToMockGovernment(
  payload: MockGovernmentPayload,
): Promise<string> {
  const headless = process.env.MOCK_GOVERNMENT_HEADLESS === 'true';
  const browser = await chromium.launch({
    headless,
    slowMo: headless ? 0 : 250,
  });

  try {
    const page = await browser.newPage();

    console.log('Opening mock government website...');
    await page.goto(MOCK_GOVERNMENT_URL);

    console.log('Opening report form...');
    await page.getByRole('button', { name: 'Report an Issue' }).click();
    await page.locator('#issue-report-form').waitFor();

    console.log('Filling issue type...');
    // The mock form has no issue-type field, so include it in the description.

    console.log('Filling location...');
    await page.locator('#latitude').fill(payload.latitude);
    await page.locator('#longitude').fill(payload.longitude);

    console.log('Filling description...');
    await page.locator('#description').fill(payload.description);
    await page.locator('#photo-url').fill(payload.photoUrl);

    console.log('Submitting report...');
    await page.locator('#submit-report').click();
    await page.locator('#confirmation-message').waitFor({ timeout: 15_000 });

    const referenceId = (await page.locator('#reference-id').innerText()).trim();

    if (!referenceId) {
      throw new Error('Submission appeared to succeed but no Reference ID was found.');
    }

    console.log('Submission successful.');
    console.log(`Reference ID: ${referenceId}`);
    if (!headless) await page.waitForTimeout(2000);
    return referenceId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Mock government submission failed: ${message}`);
  } finally {
    await browser.close();
  }
}
