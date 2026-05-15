const fs = require('fs/promises');

const LOTTLOG_HISTORY_URL = 'https://lottolog.kr/history';
const LOTTO_API_BASE =
  'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';

const OUTPUT_FILE = 'lotto-history.json';
const RECENT_DRAW_COUNT = 120;

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; lotto-analysis-bot/1.0; +https://github.com/)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`요청 실패: ${url} / ${response.status}`);
  }

  return response.text();
}

function extractLatestDrawNoFromLottolog(html) {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const matches = [...text.matchAll(/(\d{1,4})\s*회/g)]
    .map((match) => Number(match[1]))
    .filter((num) => Number.isInteger(num) && num > 0);

  if (matches.length === 0) {
    throw new Error('LOTTO.LOG에서 최신 회차 번호를 찾지 못했습니다.');
  }

  return Math.max(...matches);
}

async function fetchDraw(drawNo) {
  const response = await fetch(`${LOTTO_API_BASE}${drawNo}`, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (compatible; lotto-analysis-bot/1.0; +https://github.com/)',
      accept: 'application/json,text/plain,*/*',
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (data.returnValue !== 'success') {
    return null;
  }

  return {
    drawNo: data.drwNo,
    date: data.drwNoDate,
    numbers: [
      data.drwtNo1,
      data.drwtNo2,
      data.drwtNo3,
      data.drwtNo4,
      data.drwtNo5,
      data.drwtNo6,
    ].sort((a, b) => a - b),
    bonus: data.bnusNo,
  };
}

async function main() {
  const html = await fetchText(LOTTLOG_HISTORY_URL);
  const latestDrawNo = extractLatestDrawNoFromLottolog(html);

  console.log(`Latest draw from LOTTO.LOG: ${latestDrawNo}`);

  const targetDrawNos = Array.from(
    { length: RECENT_DRAW_COUNT },
    (_, index) => latestDrawNo - index
  ).filter((drawNo) => drawNo > 0);

  const draws = [];

  for (const drawNo of targetDrawNos) {
    const draw = await fetchDraw(drawNo);

    if (draw) {
      draws.push(draw);
      console.log(`Fetched draw ${drawNo}`);
    } else {
      console.log(`Skipped draw ${drawNo}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  if (draws.length === 0) {
    throw new Error('회차별 당첨번호를 가져오지 못했습니다.');
  }

  const output = {
    updatedAt: new Date().toISOString(),
    source: {
      latestDrawNo: LOTTLOG_HISTORY_URL,
      drawNumbers: 'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={drawNo}',
    },
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
