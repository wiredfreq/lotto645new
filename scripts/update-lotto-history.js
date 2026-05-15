const fs = require('fs/promises');

const DATA_URL = 'https://smok95.github.io/lotto/results/all.json';
const OUTPUT_FILE = 'lotto-history.json';
const RECENT_DRAW_COUNT = 120;

function normalizeDraw(item) {
  if (!item) return null;

  const drawNo = Number(item.draw_no || item.drawNo || item.no);
  const numbers = item.numbers || item.win_numbers || item.drwtNos;
  const bonus = Number(item.bonus_no || item.bonusNo || item.bonus);

  if (!drawNo || !Array.isArray(numbers) || numbers.length < 6) {
    return null;
  }

  const pickedNumbers = numbers
    .slice(0, 6)
    .map(Number)
    .filter((num) => num >= 1 && num <= 45)
    .sort((a, b) => a - b);

  if (pickedNumbers.length !== 6) {
    return null;
  }

  const firstDivision = Array.isArray(item.divisions) ? item.divisions[0] : null;

  return {
    drawNo,
    date: item.date || '',
    numbers: pickedNumbers,
    bonus: bonus || null,
    firstPrizeWinners: firstDivision?.winners || null,
    firstPrizeAmount: firstDivision?.prize || null,
  };
}

async function main() {
  const response = await fetch(DATA_URL, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent':
        'Mozilla/5.0 (compatible; lotto-analysis-bot/1.0; +https://github.com/)',
    },
  });

  if (!response.ok) {
    throw new Error(`로또 JSON 데이터 요청 실패: ${response.status}`);
  }

  const data = await response.json();

  const rawDraws = Array.isArray(data)
    ? data
    : Array.isArray(data.results)
      ? data.results
      : Array.isArray(data.draws)
        ? data.draws
        : [];

  const draws = rawDraws
    .map(normalizeDraw)
    .filter(Boolean)
    .sort((a, b) => b.drawNo - a.drawNo)
    .slice(0, RECENT_DRAW_COUNT);

  console.log(`Loaded raw draws: ${rawDraws.length}`);
  console.log(`Normalized draws: ${draws.length}`);

  if (draws[0]) {
    console.log(`Latest draw: ${draws[0].drawNo}`);
  }

  if (draws.length < 10) {
    throw new Error(`충분한 회차 데이터를 가져오지 못했습니다. 가져온 회차 수: ${draws.length}`);
  }

  const output = {
    updatedAt: new Date().toISOString(),
    source: DATA_URL,
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
