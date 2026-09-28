/**
 * 固定分类枚举（图标在前端；名称顺序须与 server app/constants 一致）。
 * 校验: cd server && pytest tests/test_category_parity.py
 * 也可拉 GET /api/v1/meta/categories 做运行时对照。
 */
export interface CategoryItem {
  name: string;
  icon: string;
}

export const CATEGORIES: CategoryItem[] = [
  { name: '餐饮', icon: '🍜' },
  { name: '交通', icon: '🚌' },
  { name: '购物', icon: '🛍️' },
  { name: '居住', icon: '🏠' },
  { name: '娱乐', icon: '🎮' },
  { name: '医疗', icon: '💊' },
  { name: '教育', icon: '📚' },
  { name: '人情', icon: '🎁' },
  { name: '旅行', icon: '✈️' },
  { name: '投资', icon: '📈' },
  { name: '转账', icon: '💸' },
  { name: '其他', icon: '📦' },
];

/** 历史后端分类 → 现行展示名（图标跟映射后的类） */
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  通讯: '其他',
  数码: '购物',
};

function resolveCategoryName(name: string): string {
  const n = (name || '').trim();
  return LEGACY_CATEGORY_MAP[n] || n;
}

export function categoryIcon(name: string): string {
  const found = CATEGORIES.find((c) => c.name === resolveCategoryName(name));
  return found?.icon || '📦';
}

/** 按名称取完整分类项（最近使用行展示用） */
export function categoryItem(name: string): CategoryItem | undefined {
  return CATEGORIES.find((c) => c.name === resolveCategoryName(name));
}

/** 从账单列表抽出最近用过的分类（最多 max 个，新的在前） */
export function recentCategoriesFromBills(
  bills: { category?: string }[],
  max = 3,
): CategoryItem[] {
  const seen: Record<string, boolean> = {};
  const result: CategoryItem[] = [];
  for (let i = 0; i < bills.length; i++) {
    const name = (bills[i].category || '').trim();
    if (!name || seen[name]) continue;
    const item = categoryItem(name);
    if (!item) continue;
    seen[name] = true;
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

/**
 * 把某分类顶到「最近使用」最前；超过 max 丢掉最早的。
 * 本地缓存作兜底，进页仍以账单历史为准。
 */
export function pushRecentCategoryName(name: string, max = 3): string[] {
  const key = 'recent_categories';
  let list: string[] = [];
  try {
    const raw = wx.getStorageSync(key);
    if (Array.isArray(raw)) {
      list = raw.filter((x): x is string => typeof x === 'string');
    }
  } catch (e) {
    // ignore
  }
  const next: string[] = [name];
  for (let i = 0; i < list.length; i++) {
    if (list[i] !== name) next.push(list[i]);
    if (next.length >= max) break;
  }
  try {
    wx.setStorageSync(key, next);
  } catch (e) {
    // ignore
  }
  return next;
}

/** 读本地最近分类缓存（账单为空时兜底） */
export function loadRecentCategoryNames(): string[] {
  try {
    const raw = wx.getStorageSync('recent_categories');
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === 'string').slice(0, 3);
  } catch (e) {
    return [];
  }
}
