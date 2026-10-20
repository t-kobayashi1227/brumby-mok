import { getSql } from "../lib/db";
import { AGE_CLASSES, ageClassOf } from "../lib/scoring/constants";
import type { AgeClass } from "../lib/scoring/types";

// 相場表（market_reference）を取引データ（XIT001）から作る：npm run build:market-reference [-- --dry-run]
// 区×築年数の区分ごとに、価格・延床・土地・築年数の中央値と件数を出す
// 条件は Excel「採点ルール表」の相場シートの出典と同じ（2026-10-20 に 3区分の 24行が Excel と一致することを確かめた）：
//   新潟市8区、2021年以降、宅地(土地と建物)、用途が住宅（成約価格情報は用途の欄がないので空も含む）、木造・軽量鉄骨造、延床40〜300㎡
// 築年数は「取引の年 − 建築の年」。Excel の表を取り込み直したときは、この表もそれに合わせて上書きされる

const FROM_YEAR = 2021;
const STRUCTURES = ["木造", "軽量鉄骨造"];

/** percentile_cont(0.5) と同じ（真ん中の2つの平均） */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const sql = getSql();
  const trades = await sql<{ ward: string; age: number; price: number; floor: number; land: number | null }[]>`
    select replace(t.municipality, '新潟市', '') as ward, (t.year - t.building_year)::int as age,
           t.trade_price::float8 as price, t.total_floor_area_sqm::float8 as floor, t.area_sqm::float8 as land
    from transactions t join dataset_versions v on v.id = t.dataset_version_id
    where v.status = 'active' and v.source = 'reinfolib' and v.dataset = 'XIT001'
      and t.type = '宅地(土地と建物)' and t.municipality like '新潟市%' and t.year >= ${FROM_YEAR}
      and t.trade_price is not null and t.building_year is not null
      and coalesce(t.raw->>'Use', '') in ('住宅', '') and t.raw->>'Structure' in ${sql(STRUCTURES)}
      and t.total_floor_area_sqm between 40 and 300
  `;

  const groups = new Map<string, (typeof trades)[number][]>();
  for (const t of trades) {
    const key = `${t.ward}/${ageClassOf(Math.max(0, t.age))}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  const wards = [...new Set(trades.map((t) => t.ward))].sort();
  const rows = wards.flatMap((ward) =>
    AGE_CLASSES.flatMap((ageClass: AgeClass) => {
      const g = groups.get(`${ward}/${ageClass}`) ?? [];
      if (g.length === 0) return [];
      return [{
        ward,
        age_class: ageClass,
        price_man_yen: median(g.map((t) => t.price))! / 10000,
        building_sqm: median(g.map((t) => t.floor)),
        land_sqm: median(g.flatMap((t) => (t.land === null ? [] : [t.land]))),
        age_years: median(g.map((t) => Math.max(0, t.age))),
        n: g.length,
        updated_by: "build-market-reference",
      }];
    }),
  );

  console.log(`取引 ${trades.length}件 → ${rows.length}行（${wards.length}区×${AGE_CLASSES.length}区分）`);
  for (const r of rows) console.log(`${r.ward}\t${r.age_class}\t${r.price_man_yen}万円\t延床${r.building_sqm}\t土地${r.land_sqm}\t築${r.age_years}\t${r.n}件`);
  if (dryRun) {
    console.log("--dry-run のため、DB には書き込みません");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    await tx`select set_config('brumby.change_reason', '取引データから相場表を作成（build-market-reference）', true), set_config('brumby.changed_by', 'build-market-reference', true)`;
    for (const row of rows) {
      await tx`
        insert into market_reference ${tx(row)}
        on conflict (ward, age_class) do update set price_man_yen = excluded.price_man_yen, building_sqm = excluded.building_sqm, land_sqm = excluded.land_sqm,
          age_years = excluded.age_years, n = excluded.n, updated_by = excluded.updated_by
      `;
    }
  });
  console.log(`market_reference に ${rows.length}行を書き込みました`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
