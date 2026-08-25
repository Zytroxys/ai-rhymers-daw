/**
 * End-to-end smoke test: boots the built app in Chromium, toggles a step, runs
 * the transport, and checks the rhyme panel and verse analysis render.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npm i -D playwright && node scripts/smoke.mjs
 *
 * Playwright is deliberately not a dependency -- this is an occasional check,
 * not part of `npm test`. Set PW_CHROMIUM to use a Chromium you already have.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(process.env.PW_URL || 'http://localhost:4173/', { waitUntil: 'networkidle' });

const tracks = await page.locator('.track-row').count();
const steps = await page.locator('.track-row .step').count();
console.log('track rows:', tracks, '| step buttons:', steps);

// Toggle a step and confirm it sticks.
const cell = page.locator('.track-row .step').nth(40);
await cell.click();
console.log('step toggled on:', await cell.getAttribute('aria-pressed'));

// Start the transport and confirm the AudioContext actually runs.
await page.click('.play');
await page.waitForTimeout(1200);
const audio = await page.evaluate(() => ({
  playing: document.querySelector('.play')?.textContent,
  hasPlayhead: !!document.querySelector('.step.playing'),
}));
console.log('transport:', JSON.stringify(audio));

// Rhyme panel end-to-end.
await page.fill('.rhyme-query', 'night');
await page.waitForTimeout(300);
const rhymes = await page.locator('.rhyme-list .rhyme-word').allTextContents();
console.log('rhymes for night:', rhymes.slice(0, 6).join(', '));

const schemes = await page.locator('.line-analysis .scheme').allTextContents();
const counts = await page.locator('.line-analysis .count').allTextContents();
console.log('scheme:', schemes.join(''), '| syllables:', counts.join(','));

await page.click('.play');
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console/page errors');
await browser.close();
