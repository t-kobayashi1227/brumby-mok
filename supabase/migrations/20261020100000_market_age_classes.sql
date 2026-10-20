-- 相場の築年数の区分を3つ（新築／築2〜20年／築21年以上）から6つに細かくする
-- 新しい区分の値は npm run build:market-reference で取引データから作る（Excel「相場」「周辺の取引」と同じ条件）

select set_config('brumby.change_reason', '築年数の区分を6つに変更（古い区分の行を削除）', true),
       set_config('brumby.changed_by', 'migration', true);

alter table public.market_reference drop constraint market_reference_age_class_check;

delete from public.market_reference where age_class in ('築2〜20年', '築21年以上');

alter table public.market_reference add constraint market_reference_age_class_check
  check (age_class in ('新築', '築2〜10年', '築11〜20年', '築21〜30年', '築31〜40年', '築41年以上'));
