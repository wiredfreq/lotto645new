const fs = require('fs/promises');

const HISTORY_URL = 'https://www.lottolog.kr/history.html';
const OUTPUT_FILE = 'lotto-history.json';
const RECENT_DRAW_COUNT = 120;

function cleanText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/&#47;/g, '/')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDrawsFromText(text) {
  const draws = [];

  const n = '([1-9]|[1-3][0-9]|4[0-5])';

  const rowRegex = new RegExp(
    [
      '\\\\b(\\\\d{1,4})\\\\s+',
      n, '\\\\s+',
      n, '\\\\s+',
      n, '\\\\s+',
      n, '\\\\s+',
      n, '\\\\s+',
      n, '\\\\s+',
      '\\\\+\\\\s+',
      n, '\\\\s+',
      '(\\\\d+)\\\\s*명'
    ].join(''),
    'g'
  );

  let match;

  while ((match = rowRegex.exec(text)) !== null) {
    const drawNo = Number(match[1]);

    const numbers = [
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
      Number(match[7]),
    ].sort((a, b) => a - b);

    const bonus = Number(match[8]);
    const firstPrizeWinners = Number(match[9]);

    if (!drawNo || numbers.length !== 6 || !bonus) continue;

    draws.push({
      drawNo,
      date: '',
      numbers,
      bonus,
      firstPrizeWinners,
    });
  }

  const unique = new Map();

  for (const draw of draws) {
    unique.set(draw.drawNo, draw);
  }

  return [...unique.values()]
    .sort((a, b) => b.drawNo - a.drawNo)
    .slice(0, RECENT_DRAW_COUNT);
}

async function main() {
  const response = await fetch(HISTORY_URL, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; lotto-analysis-bot/1.0; +https://github.com/)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`LOTTO.LOG 요청 실패: ${response.status}`);
  }

  const html = await response.text();
  const text = cleanText(html);
  const draws = extractDrawsFromText(text);

  console.log(`Fetched LOTTO.LOG HTML length: ${html.length}`);
  console.log(`Extracted draws: ${draws.length}`);

  if (draws[0]) {
    console.log(`Latest extracted draw: ${draws[0].drawNo}`);
  }

  if (draws.length < 10) {
    console.log('Text preview:');
    console.log(text.slice(0, 1500));

    throw new Error(
      `LOTTO.LOG에서 충분한 회차 데이터를 추출하지 못했습니다. 추출된 회차 수: ${draws.length}`
    );
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
