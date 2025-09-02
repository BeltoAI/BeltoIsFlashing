export function nextIntervalDays(box: number) {
  const table = [0, 1, 2, 4, 7, 15]; // 1..5
  return table[Math.max(1, Math.min(5, box))];
}
export function scheduleNext(box: number, ease: "again"|"good"|"easy") {
  let newBox = box;
  if (ease === "again") newBox = Math.max(1, box - 1);
  if (ease === "good")  newBox = Math.min(5, box + 1);
  if (ease === "easy")  newBox = Math.min(5, box + 2);
  const d = new Date();
  d.setDate(d.getDate() + nextIntervalDays(newBox));
  return { newBox, next: d };
}
