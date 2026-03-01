/** 向上向下取整数 */
export function getFixedValue(type, value, fixedStep) {
  if (!value) {
    return '';
  }
  if (type === 'up') {
    return Math.ceil(Number(value) / 5) * 5 + fixedStep;
  } else if (type === 'down') {
    return Math.floor(Number(value) / 5) * 5 - fixedStep;
  }
  throw new Error('Invalid type. Use "up" or "down".');
}
