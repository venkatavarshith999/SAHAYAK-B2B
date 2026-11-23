/**
 * KAEN Automated Multi-Round B2B Negotiation Engine
 * Preserved core concession & reservation-price solver.
 */
export function evaluateNegotiationRound({
  round,
  maxRounds = 5,
  buyerOffer,
  buyerMaxPrice,
  sellerAsk,
  sellerFloorPrice,
  quantity
}) {
  if (buyerOffer >= sellerAsk) {
    return {
      status: 'ACCEPTED',
      agreedUnitPrice: buyerOffer,
      totalValue: buyerOffer * quantity,
      rationale: 'Buyer offer meets or exceeds current seller ask.'
    };
  }

  if (round >= maxRounds && buyerOffer < sellerFloorPrice) {
    return {
      status: 'ESCALATED_TO_HUMAN',
      suggestedMidpoint: Math.round(((buyerOffer + sellerAsk) / 2) * 100) / 100,
      rationale: 'Max automated rounds reached without crossing seller floor price.'
    };
  }

  const progress = Math.min(round / maxRounds, 1);
  const concessionFactor = Math.pow(progress, 1.35);
  const nextSellerCounter =
    Math.round((sellerAsk - (sellerAsk - sellerFloorPrice) * concessionFactor) * 100) / 100;

  if (buyerOffer >= nextSellerCounter) {
    return {
      status: 'ACCEPTED',
      agreedUnitPrice: buyerOffer,
      totalValue: buyerOffer * quantity,
      rationale: `Buyer offer satisfies Round ${round} concession threshold.`
    };
  }

  return {
    status: 'COUNTER_OFFER',
    round,
    counterUnitPrice: nextSellerCounter,
    totalValue: nextSellerCounter * quantity,
    buyerDeltaPct: Math.round(((nextSellerCounter - buyerOffer) / buyerOffer) * 1000) / 10,
    rationale: `KAEN Round ${round}/${maxRounds} concession calculated toward floor price.`
  };
}
