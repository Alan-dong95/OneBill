-- 把历史「通讯/数码」迁到现行 12 类（可重复执行）
-- 用法：psql -U postgres -d onebill -f sql/migrate_categories.sql
-- 现行枚举：餐饮/交通/购物/居住/娱乐/医疗/教育/人情/旅行/投资/转账/其他

UPDATE bills SET category = '其他' WHERE category = '通讯';
UPDATE bills SET category = '购物' WHERE category = '数码';
