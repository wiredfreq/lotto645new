const fs = require('fs/promises');

const HISTORY_URL = 'https://www.lottolog.kr/history';
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
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDrawsFromText(text) {
  const draws = [];

  /*
    LOTTO.LOG 페이지 텍스트에서 이런 패턴을 찾습니다.
    예: 1223회 2026-05-09 6 14 20 23 31 37 9 ...
    날짜가 없더라도 회차 뒤의 1~45 숫자 6~7개를 회차 번호로 묶습니다.
  */
  const drawBlocks = text.split(/(?=\b\d{1,4}\s*회\b)/g);

  for (const block of drawBlocks) {
    const drawNoMatch = block.match(/\b(\d{1,4})\s*회\b/);
    if (!drawNoMatch) continue;

    const drawNo = Number(drawNoMatch[1]);

    if (!Number.isInteger(drawNo) || drawNo < 1) continue;

    // “1회 ~ 1223회 · 전체 데이터” 같은 소개 문구 제외
    if (/전체\s*데이터|검색|이전|다음|역대|내역|가이드/.test(block)) {
      continue;
    }

    const dateMatch = block.match(/(20\d{2}[./-]\d{1,2}[./-]\d{1,2})/);
    const date = dateMatch
      ? dateMatch[1].replaceAll('.', '-').replaceAll('/', '-')
      : '';

    const afterDrawNo = block.slice(drawNoMatch.index + drawNoMatch[0].length);

    const numbers = [...afterDrawNo.matchAll(/\b([1-9]|[1-3][0-9]|4[0-5])\b/g)]
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

  console.log(`Fetched LOTTO.LOG HTML length: ${html.length}`);
  console.log(`Cleaned text length: ${text.length}`);
  console.log(`Text preview: ${text.slice(0, 500)}`);

  const draws = extractDrawsFromText(text);

  console.log(`Extracted draws: ${draws.length}`);
  if (draws[0]) {
    console.log(`Latest extracted draw: ${draws[0].drawNo}`);
  }

  if (draws.length < 10) {
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
