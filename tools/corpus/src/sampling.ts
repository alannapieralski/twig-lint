export function evenlySpaced<Item>(items: readonly Item[], count: number): Item[] {
  if (items.length <= count) {
    return [...items];
  }
  const step = items.length / count;
  return Array.from({ length: count }, (_, index) => items[Math.floor(index * step)] as Item);
}
