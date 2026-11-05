export function injectSponsored(list: any[], sponsored: any[], interval = 5) {
  const result = [];
  let sIndex = 0;

  for (const item of list) {
    if (
      result.length > 0 &&
      (result.length + 1) % interval === 0 &&
      sponsored[sIndex]
    ) {
      result.push({
        ...sponsored[sIndex],
        isSponsored: true
      });
      sIndex++;
    }

    result.push(item);
  }

  if (
    result.length > 0 &&
    (result.length + 1) % interval === 0 &&
    sponsored[sIndex]
  ) {
    result.push({
      ...sponsored[sIndex],
      isSponsored: true
    });
    sIndex++;
  }

  // Keep sponsored inventory visible on short result pages too. The regular
  // interval can be missed entirely when fewer than `interval - 1` items load.
  if (result.length > 0 && sIndex === 0 && sponsored[sIndex]) {
    result.push({
      ...sponsored[sIndex],
      isSponsored: true,
    });
  }

  return result;
}
