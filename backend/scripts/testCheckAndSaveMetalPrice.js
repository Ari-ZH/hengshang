const rawRecyclePrices = [500, 500.1, 499.9, 500.3, 499.9, 499.7];
const rawSellPrices = [600, 600.1, 599.9, 600.3, 599.9, 599.7];

const config = {
  minUp: 10,
  minDown: 10,
  fixedStep: 5,
};

function getFixedValue(type, value, roundStep, offsetStep = 0) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const stepValue = Number(roundStep);
  const step = stepValue > 0 ? stepValue : 5;
  const offset = Number(offsetStep) || 0;
  if (type === 'up') {
    return Math.ceil(Number(value) / step) * step + offset;
  }
  if (type === 'down') {
    return Math.floor(Number(value) / step) * step - offset;
  }
  throw new Error('Invalid type. Use "up" or "down".');
}

function isConfirmedPriceChange(currentPrice, prevPrice, rawPrice, roundStep, offsetStep) {
  if (prevPrice === null || prevPrice === undefined) {
    return true;
  }
  if (currentPrice === prevPrice) {
    return false;
  }
  if (currentPrice === -1 || prevPrice === -1) {
    return true;
  }
  if (Number.isNaN(rawPrice)) {
    return false;
  }
  const direction = currentPrice > prevPrice ? 'up' : 'down';
  if (direction === 'up') {
    const newRawValue = rawPrice - 0.25;
    const newValue = getFixedValue(direction, newRawValue, roundStep, offsetStep);
    return newValue === currentPrice;
  }
  const newRawValue = rawPrice + 0.25;
  const newValue = getFixedValue(direction, newRawValue, roundStep, offsetStep);
  return newValue === currentPrice;
}

function checkAndSaveMetalPrice(rawData, config, latestPrice, triggeredByConfig = false) {
  if (!rawData) return { priceChanged: false, priceRecord: null };

  const sellDisabled = Number(config.minUp) === -1;
  const recycleDisabled = Number(config.minDown) === -1;
  const currentSellPrice = sellDisabled
    ? -1
    : parseFloat(getFixedValue('up', rawData.salePrice, config.fixedStep, config.minUp));
  const currentRecyclePrice = recycleDisabled
    ? -1
    : parseFloat(getFixedValue('down', rawData.buyPrice, config.fixedStep, config.minDown));
  const rawSellPrice = parseFloat(rawData.salePrice);
  const rawRecyclePrice = parseFloat(rawData.buyPrice);

  let priceChanged = false;
  let prevSellPrice = null;
  let prevRecyclePrice = null;
  let sellChanged = false;
  let recycleChanged = false;

  if (!latestPrice) {
    priceChanged = true;
  } else {
    prevSellPrice = parseFloat(latestPrice.sellPrice);
    prevRecyclePrice = parseFloat(latestPrice.recyclePrice);
    if (triggeredByConfig) {
      sellChanged = currentSellPrice !== prevSellPrice;
      recycleChanged = currentRecyclePrice !== prevRecyclePrice;
    } else {
      sellChanged = isConfirmedPriceChange(currentSellPrice, prevSellPrice, rawSellPrice, config.fixedStep, config.minUp);
      recycleChanged = isConfirmedPriceChange(currentRecyclePrice, prevRecyclePrice, rawRecyclePrice, config.fixedStep, config.minDown);
    }
    priceChanged = sellChanged || recycleChanged;
  }

  const priceRecord = {
    sellPrice: currentSellPrice,
    recyclePrice: currentRecyclePrice,
    rawSellPrice: rawSellPrice,
    rawRecyclePrice: rawRecyclePrice,
    prevSellPrice: prevSellPrice,
    prevRecyclePrice: prevRecyclePrice,
    changeTime: rawData.time,
  };

  return { priceChanged, priceRecord, sellChanged, recycleChanged };
}

let latestPrice = null;

rawSellPrices.forEach((sellPrice, index) => {
  const rawData = {
    salePrice: sellPrice,
    buyPrice: rawRecyclePrices[index],
    time: `t${index + 1}`,
  };
  const result = checkAndSaveMetalPrice(rawData, config, latestPrice, false);
  console.log(`step ${index + 1}`, {
    rawSellPrice: rawData.salePrice,
    rawRecyclePrice: rawData.buyPrice,
    currentSellPrice: result.priceRecord.sellPrice,
    currentRecyclePrice: result.priceRecord.recyclePrice,
    priceChanged: result.priceChanged,
    sellChanged: result.sellChanged,
    recycleChanged: result.recycleChanged,
    prevSellPrice: result.priceRecord.prevSellPrice,
    prevRecyclePrice: result.priceRecord.prevRecyclePrice,
  });
  if (result.priceChanged) {
    latestPrice = result.priceRecord;
  }
});
