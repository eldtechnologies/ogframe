/**
 * Screenshot Service
 * Headless browser screenshot generation using Playwright
 */

import { chromium, type Browser, type Page } from 'playwright';
import { OGFrameError } from '../types.js';
import { logger } from '../utils/logger.js';
import config from '../config.js';

// Semaphore for limiting concurrent screenshots
class Semaphore {
  private count: number;
  private max: number;
  private queue: Array<() => void> = [];

  constructor(max: number) {
    this.count = 0;
    this.max = max;
  }

  async acquire(): Promise<void> {
    if (this.count < this.max) {
      this.count++;
      return;
    }

    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.count--;
    const next = this.queue.shift();
    if (next) {
      this.count++;
      next();
    }
  }

  async use<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const screenshotSemaphore = new Semaphore(config.maxConcurrentScreenshots);

/**
 * Generate screenshot of URL
 */
export async function generateScreenshot(url: string): Promise<Buffer> {
  const startTime = Date.now();

  return await screenshotSemaphore.use(async () => {
    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      logger.debug('Starting screenshot generation', { url });

      // Launch browser (fresh instance for each screenshot)
      // Use system Chromium in Docker, fall back to Playwright's bundled browser locally
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || undefined,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-gl-drawing-for-tests',
          '--no-first-run',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-domain-reliability',
          '--disable-features=AudioServiceOutOfProcess',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-notifications',
          '--disable-offer-store-unmasked-wallet-cards',
          '--disable-popup-blocking',
          '--disable-print-preview',
          '--disable-prompt-on-repost',
          '--disable-renderer-backgrounding',
          '--disable-speech-api',
          '--disable-sync',
          '--hide-scrollbars',
          '--ignore-gpu-blacklist',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-pings',
          '--password-store=basic',
          '--use-mock-keychain',
          '--autoplay-policy=no-user-gesture-required'  // Critical for video autoplay
        ],
        timeout: 30000
      });

      // Create context with security restrictions
      const context = await browser.newContext({
        viewport: {
          width: config.screenshotWidth,
          height: config.screenshotHeight
        },
        deviceScaleFactor: 1,
        hasTouch: false,
        javaScriptEnabled: true, // Need JS for SPAs
        bypassCSP: false,
        ignoreHTTPSErrors: false,
        userAgent: 'OGFrame/2.0 (Screenshot Bot; +https://github.com/eldtechnologies/ogframe)'
      });

      page = await context.newPage();

      // Set timeout
      page.setDefaultTimeout(config.screenshotTimeout);
      page.setDefaultNavigationTimeout(config.screenshotTimeout);

      // Navigate to URL
      logger.debug('Navigating to URL', { url });
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: config.screenshotTimeout
      });

      // Wait for initial render - videos with poster images will show the poster
      await page.waitForTimeout(1500);

      // Take screenshot
      logger.debug('Taking screenshot', { url });
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false, // Just viewport
        clip: {
          x: 0,
          y: 0,
          width: config.screenshotWidth,
          height: config.screenshotHeight
        }
      });

      const duration = Date.now() - startTime;
      logger.info('Screenshot generated successfully', {
        url,
        duration,
        size: screenshot.length
      });

      return screenshot;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Screenshot generation failed', {
        url,
        duration,
        error: error instanceof Error ? error.message : String(error)
      });

      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new OGFrameError(
            'SCREENSHOT_TIMEOUT',
            `Screenshot timed out after ${config.screenshotTimeout}ms`,
            500
          );
        }

        if (error.message.includes('net::ERR')) {
          throw new OGFrameError(
            'SCREENSHOT_FAILED',
            `Failed to load URL: ${error.message}`,
            500
          );
        }
      }

      throw new OGFrameError(
        'SCREENSHOT_FAILED',
        'Screenshot generation failed',
        500,
        { originalError: error instanceof Error ? error.message : String(error) }
      );

    } finally {
      // Always clean up
      try {
        if (page) await page.close();
        if (browser) await browser.close();
      } catch (cleanupError) {
        logger.warn('Error during browser cleanup', { error: cleanupError });
      }
    }
  });
}

/**
 * Check if Playwright browsers are installed
 */
export async function checkBrowserInstalled(): Promise<boolean> {
  try {
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      headless: true
    });
    await browser.close();
    return true;
  } catch (error) {
    logger.error('Playwright browser not installed', { error });
    return false;
  }
}
