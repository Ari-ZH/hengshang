/** 向上向下取整数 */
export function getFixedValue(type, value, roundStep, offsetStep = 0) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const stepValue = Number(roundStep);
  const step = stepValue > 0 ? stepValue : 5;
  const offset = Number(offsetStep) || 0;
  if (type === 'up') {
    return Math.ceil(Number(value) / step) * step + offset;
  } else if (type === 'down') {
    return Math.floor(Number(value) / step) * step - offset;
  }
  throw new Error('Invalid type. Use "up" or "down".');
}
