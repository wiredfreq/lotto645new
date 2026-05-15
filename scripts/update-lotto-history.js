const fs = require('fs/promises');
const { chromium } = require('playwright');

const HISTORY_URL = 'https://lottolog.kr/history';
const OUTPUT_FILE = 'lotto-history.json';
const RECENT_DRAW_COUNT = 120;
const MAX_PAGES = 20;

function normalizeText(text) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDrawFromText(rawText) {
  const text = normalizeText(rawText);
  const drawNoMatch = text.match(/(\d{1,4})\s*회/);

  if (!drawNoMatch) return null;

  const drawNo = Number(drawNoMatch[1]);

  const afterDrawNo = text.slice(drawNoMatch.index + drawNoMatch[0].length);

  const dateMatch = text.match(/(20\d{2}[./-]\d{1,2}[./-]\d{1,2})/);
  const date = dateMatch
    ? dateMatch[1].replaceAll('.', '-').replaceAll('/', '-')
    : '';

  const numberMatches = [...afterDrawNo.matchAll(/\b([1-9]|[1-3][0-9]|4[0-5])\b/g)]
    .map((match) => Number(match[1]));

  const uniqueNumbers = [];

  for (const num of numberMatches) {
    if (!uniqueNumbers.includes(num)) {
      uniqueNumbers.push(num);
    }
  }

  if (uniqueNumbers.length < 6) return null;

  return {
    drawNo,
    date,
    numbers: uniqueNumbers.slice(0, 6).sort((a, b) => a - b),
    bonus: uniqueNumbers[6] || null,
  };
}

async function extractVisibleCandidates(page) {
  return page.evaluate(() => {
    const selectors = [
      'tr',
      '[role="row"]',
      'li',
      'article',
      'section',
      '.row',
      '.card',
      'div',
    ];

    const elements = Array.from(document.querySelectorAll(selectors.join(',')));

    return elements
      .map((element) => element.innerText || element.textContent || '')
      .map((text) => text.replace(/\s+/g, ' ').trim())
      .filter((text) => {
        if (!text) return false;
        if (!/\d{1,4}\s*회/.test(text)) return false;

        const numberCount = (text.match(/\b([1-9]|[1-3][0-9]|4[0-5])\b/g) || []).length;
        return numberCount >= 6;
      });
  });
}

async function clickNextPage(page) {
  const nextCandidates = [
    'text=다음',
    'button:has-text("다음")',
    'a:has-text("다음")',
    '[aria-label*="다음"]',
    '[aria-label*="Next"]',
  ];

  for (const selector of nextCandidates) {
    const locator = page.locator(selector).first();

    try {
      const count = await locator.count();

      if (count === 0) continue;

      const isVisible = await locator.isVisible().catch(() => false);
      const isDisabled = await locator.isDisabled().catch(() => false);

      if (!isVisible || isDisabled) continue;

      await locator.click();
      await page.waitForTimeout(1000);
      return true;
    } catch (_) {
      // 다음 후보 선택자로 계속 시도
    }
  }

  return false;
}

function dedupeAndSort(draws) {
  const unique = new Map();

  for (const draw of draws) {
    if (!draw) continue;
    if (!draw.drawNo) continue;
    if (!Array.isArray(draw.numbers)) continue;
    if (draw.numbers.length !== 6) continue;

    unique.set(draw.drawNo, draw);
  }

  return [...unique.values()]
    .sort((a, b) => b.drawNo - a.drawNo)
    .slice(0, RECENT_DRAW_COUNT);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
  });

  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  });

  const collected = [];

  try {
    await page.goto(HISTORY_URL, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      await page.waitForTimeout(1000);

      const candidates = await extractVisibleCandidates(page);

      for (const candidate of candidates) {
        const draw = parseDrawFromText(candidate);

        if (draw) {
          collected.push(draw);
        }
      }

      const normalized = dedupeAndSort(collected);

      if (normalized.length >= RECENT_DRAW_COUNT) {
        break;
      }

      const moved = await clickNextPage(page);

      if (!moved) {
        break;
      }
    }
  } finally {
    await browser.close();
  }

  const draws = dedupeAndSort(collected);

  if (draws.length === 0) {
    throw new Error('LOTTO.LOG 페이지에서 당첨번호를 추출하지 못했습니다.');
  }

  const output = {
    updatedAt: new Date().toISOString(),
    source: HISTORY_URL,
    count: draws.length,
    latestDrawNo: draws[0].drawNo,
    draws,
  };

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`Saved ${draws.length} draws to ${OUTPUT_FILE}`);
  console.log(`Latest draw: ${draws[0].drawNo}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
