/** A copy of `set` with `value` added (`present`) or removed. */
export const toggled = <T>(set: ReadonlySet<T>, value: T, present: boolean): Set<T> => {
  const next = new Set(set);
  if (present) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return next;
};

/** Appends `value` to the list under `key`, creating it on first use. */
export const appendTo = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
};

/** `items` grouped by `keyOf`, each group in input order. */
export const groupBy = <K, V>(items: readonly V[], keyOf: (item: V) => K): Map<K, V[]> => {
  const groups = new Map<K, V[]>();
  items.forEach((item) => appendTo(groups, keyOf(item), item));
  return groups;
};
