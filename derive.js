/* Diagonala TV/tabletă: dacă omul a completat doar inch sau doar cm, o calculăm pe cealaltă (1 inch = 2,54 cm). */
function deriveDiagonals(attributes, defKeys) {
  const keys = new Set(defKeys);
  if (!keys.has('diagonala') || !keys.has('diagonala_cm')) return attributes;
  const inch = attributes.diagonala, cm = attributes.diagonala_cm;
  if (cm != null && inch == null && cm > 0) attributes.diagonala = Math.round(cm / 2.54);
  else if (inch != null && cm == null && inch > 0) attributes.diagonala_cm = Math.round(inch * 2.54);
  return attributes;
}

module.exports = { deriveDiagonals };
