# Bani pe Omnivo: credite, urcare, promovare, planuri

**Cum merge:** utilizatorul încarcă *credite* (1 credit = 1 leu) cu cardul, pe pagina Stripe, și cu ele plătește urcarea în listă, promovarea și planurile de cont. O singură plată cu cardul, fără abonamente și fără carduri salvate.

## Prețuri (se schimbă într-un singur loc: `pricing.js`)
| Serviciu | Preț |
|---|---|
| Urcare în listă | gratuită o dată la 72 de ore; mai des: **2 lei** |
| Promovare 3 / 7 / 30 de zile | **5 / 9 / 25 lei** |
| Plan Standard / Silver / Gold / Titanium (30 de zile) | **29 / 59 / 119 / 249 lei** |
| Pachete de credite | 15 lei → 15 · 30 lei → 32 · 60 lei → 68 · 120 lei → 140 |

Limitele fiecărui plan (anunțuri, promovări simultane, statistici) sunt în `plans.js`.

## Cum pornești plățile (pe Render → Environment)
1. Cont Stripe pe numele firmei (PFA/SRL). Stripe publică pentru România: **1,5% + 1 leu** pe cardurile din SEE.
2. Stripe → Developers → API keys → copiezi **Secret key** → variabila `STRIPE_SECRET_KEY`.
3. Stripe → Developers → Webhooks → **Add endpoint**: adresa `https://ADRESA-TA/api/billing/webhook`, evenimentul `checkout.session.completed`. Copiezi *Signing secret* → variabila `STRIPE_WEBHOOK_SECRET`.
4. Setezi `BILLING=on`. Până atunci urcarea și promovarea rămân gratuite și nimeni nu plătește nimic.
5. Fă întâi o plată de test cu cheile de test Stripe (card `4242 4242 4242 4242`).

Fără cheie Stripe, dar cu `BILLING=on`, creditele se pot da manual din Admin → Utilizatori → „💰 Credite” (de exemplu după o plată prin transfer).

## De ce e sigur
- Datele cardului ajung doar la Stripe (pagină găzduită de ei); serverul Omnivo nu le vede.
- Creditele se adaugă după ce Stripe confirmă plata: semnătura webhook-ului se verifică (HMAC, maximum 5 minute vechime), iar pagina de succes reconfirmă sesiunea direct la Stripe.
- Aceeași plată nu poate credita de două ori (index unic pe sesiunea Stripe); suma și moneda se compară cu pachetul.
- Soldul nu poate coborî sub 0, iar fiecare mișcare rămâne în istoric (`credit_tx`).

## Teste
`node billing.test.js` (18 verificări: semnături, dubluri, sume greșite, credite insuficiente).
