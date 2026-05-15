const fs = require('fs/promises');

const LOTTLOG_HISTORY_URL = 'https://www.lottolog.kr/history';
const LOTTO_API_BASE =
  'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=';

const OUTPUT_FILE = 'lotto-history.json';
const RECENT_DRAW_COUNT = 120;

async function fetchLottologLatestDrawNo() {
  const response = await fetch(LOTTLOG_HISTORY_URL, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`LOTTO.LOG 요청 실패: ${response.status}`);
  }

  const html = await response.text();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const matches = [...text.matchAll(/(\d{1,4})\s*회/g)]
    .map((match) => Number(match[1]))
    .filter((num) => Number.isInteger(num) && num > 0);

  if (matches.length === 0) {
    throw new Error('LOTTO.LOG에서 최신 회차 번호를 찾지 못했습니다.');
  }

  return Math.max(...matches);
}

async function fetchDraw(drawNo) {
  const url = `${LOTTO_API_BASE}${drawNo}`;

  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      accept: 'application/json, text/javascript, */*; q=0.01',
      referer: 'https://www.dhlottery.co.kr/gameResult.do?method=byWin',
      origin: 'https://www.dhlottery.co.kr',
      'x-requested-with': 'XMLHttpRequest',
    },
  });

  if (!response.ok) {
    console.log(`Draw ${drawNo}: HTTP ${response.status}`);
    return null;
  }

  const raw = await response.text();
  const trimmed = raw.trim();

  if (trimmed.startsWith('<')) {
    console.log(`Draw ${drawNo}: received HTML instead of JSON`);
    console.log(trimmed.slice(0, 200));
    return null;
  }

  let data;

  try {
    data = JSON.parse(trimmed);
  } catch (error) {
    console.log(`Draw ${drawNo}: JSON parse failed`);
    console.log(trimmed.slice(0, 200));
    return null;
  }

  if (data.returnValue !== 'success') {
    console.log(`Draw ${drawNo}: returnValue=${data.returnValue}`);
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
  const latestDrawNo = await fetchLottologLatestDrawNo();
  console.log(`Latest draw from LOTTO.LOG: ${latestDrawNo}`);

  const draws = [];

  for (let drawNo = latestDrawNo; drawNo > latestDrawNo - RECENT_DRAW_COUNT; drawNo -= 1) {
    const draw = await fetchDraw(drawNo);

    if (draw) {
      draws.push(draw);
      console.log(`Fetched draw ${drawNo}`);
    } else {
      console.log(`Skipped draw ${drawNo}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (draws.length < 10) {
    throw new Error(`회차별 당첨번호를 충분히 가져오지 못했습니다. 가져온 회차 수: ${draws.length}`);
  }

  const output = {
    updatedAt: new Date().toISOString(),
    source: {
      latestDrawNo: LOTTLOG_HISTORY_URL,
      drawNumbers:
        'https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={drawNo}',
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
