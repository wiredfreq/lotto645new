const fs = require('fs/promises');

const HISTORY_URL = 'https://lottolog.kr/history';
const OUTPUT_FILE = 'lotto-history.json';
const RECENT_DRAW_COUNT = 120;

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/&#47;/g, '/');
}

function extractDrawsFromHtml(html) {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const draws = [];

  for (const row of rows) {
    const text = decodeHtmlEntities(
      row
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );

    const drawNoMatch = text.match(/(\d{1,4})회/);
    if (!drawNoMatch) continue;

    const drawNo = Number(drawNoMatch[1]);

    const dateMatch = text.match(/(20\d{2}[./-]\d{1,2}[./-]\d{1,2})/);
    const date = dateMatch ? dateMatch[1].replaceAll('.', '-').replaceAll('/', '-') : '';

    const numbers = [...text.matchAll(/\b([1-9]|[1-3][0-9]|4[0-5])\b/g)]
      .map((match) => Number(match[1]));

    const uniqueNumbers = [];

    for (const num of numbers) {
      if (!uniqueNumbers.includes(num)) {
        uniqueNumbers.push(num);
      }
    }

    if (uniqueNumbers.length < 6) continue;

    draws.push({
      drawNo,
      date,
      numbers: uniqueNumbers.slice(0, 6).sort((a, b) => a - b),
      bonus: uniqueNumbers[6] || null,
    });
  }

  const uniqueDraws = new Map();

  for (const draw of draws) {
    uniqueDraws.set(draw.drawNo, draw);
  }

  return [...uniqueDraws.values()]
    .sort((a, b) => b.drawNo - a.drawNo)
    .slice(0, RECENT_DRAW_COUNT);
}

async function main() {
  const response = await fetch(HISTORY_URL, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; lotto-analysis-bot/1.0; +https://github.com/)',
    },
  });

  if (!response.ok) {
    throw new Error(`LOTTO.LOG 요청 실패: ${response.status}`);
  }

  const html = await response.text();
  const draws = extractDrawsFromHtml(html);

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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});