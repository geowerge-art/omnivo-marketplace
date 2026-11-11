/* PREȚURILE. Singurul loc unde le schimbi. 1 credit = 1 leu (TVA inclus, dacă ești plătitor de TVA).
   Serviciile se plătesc DOAR când variabila BILLING=on; până atunci tot ce e aici rămâne gratuit. */
module.exports = {
  // Urcare în listă: gratuită o dată la `free_hours` ore; mai des, costă `price` credite.
  bump: { free_hours: 72, price: 2 },
  // Promovare (anunțul apare primul + insigna „Promovat”): zile -> credite
  promo: { 3: 5, 7: 9, 30: 25 },
  // Pachete de credite cumpărate cu cardul: lei plătiți -> credite primite (bonusul e diferența)
  packs: { s: { lei: 15, credits: 15 }, m: { lei: 30, credits: 32 }, l: { lei: 60, credits: 68 }, xl: { lei: 120, credits: 140 } },
  // Planuri de cont (limitele sunt în plans.js), preț pentru `plan_days` zile, în credite
  plans: { standard: 29, silver: 59, gold: 119, titanium: 249 },
  plan_days: 30
};
