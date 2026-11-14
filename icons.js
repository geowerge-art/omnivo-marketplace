/* Pictograme desenate (SVG, linie fină). Culoarea vine din `currentColor`. */
(function () {
  const P = {
    "auto-moto": '<path d="M12 24l4.2-8.2A3 3 0 0 1 18.9 14h10.2a3 3 0 0 1 2.6 1.5L36 24"/><path d="M24 14v10"/><path d="M5 31v-4.5A2.5 2.5 0 0 1 7.5 24h33a2.5 2.5 0 0 1 2.5 2.5V31a1 1 0 0 1-1 1h-3M10 32H6a1 1 0 0 1-1-1M18 32h12"/><circle cx="14" cy="32" r="4"/><circle cx="34" cy="32" r="4"/><path d="M39.5 27.5H41M7 27.5h1.5"/>',
    "electronice": '<rect x="14" y="5" width="20" height="38" rx="4"/><path d="M21 9h6M21 38.5h6"/><path d="M19 17h10M19 22h10M19 27h6" opacity=".55"/>',
    "casa-gradina": '<path d="M5 22L24 7l19 15"/><path d="M10 19v21h28V19"/><path d="M20 40V28h8v12"/><path d="M33 12V8h4v8" />',
    "moda": '<path d="M17 6L5 12l4 9 5-2v21h20V19l5 2 4-9-12-6a7 7 0 0 1-14 0z"/>',
    "servicii": '<path d="M30 7a10 10 0 0 0-9.4 13.3L7.5 33.4a3.8 3.8 0 0 0 5.4 5.4l13.1-13.1A10 10 0 0 0 40 17l-6.3 6.3-5-1-1-5L34 10.9A10 10 0 0 0 30 7z"/><circle cx="10.2" cy="36" r=".8"/>',
    "sport-timp-liber": '<circle cx="24" cy="24" r="17"/><path d="M24 15l8 5.8-3 9.4H19l-3-9.4z"/><path d="M24 15V7.5M32 20.8l7.5-2.4M29 30.2l4.6 6.3M19 30.2l-4.6 6.3M16 20.8l-7.5-2.4"/>',
    "mobila": '<path d="M11 21v-5a6 6 0 0 1 6-6h14a6 6 0 0 1 6 6v5"/><path d="M5 25a4 4 0 0 1 8 0v5h22v-5a4 4 0 0 1 8 0v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M11 37v4M37 37v4"/>',
    "copii-jucarii": '<circle cx="24" cy="27" r="12"/><circle cx="12.5" cy="14" r="4.5"/><circle cx="35.5" cy="14" r="4.5"/><circle cx="24" cy="30.5" r="4"/><circle cx="19.5" cy="24" r=".9" fill="currentColor"/><circle cx="28.5" cy="24" r=".9" fill="currentColor"/><path d="M24 28.5v1.5"/>',
    "alt": '<path d="M24 6l16 8v20l-16 8-16-8V14z"/><path d="M8 14l16 8 16-8M24 22v20"/>',
    /* bara de jos */
    "acasa": '<path d="M4 12l8-7 8 7"/><path d="M6 10.5V20h12v-9.5"/><path d="M10 20v-6h4v6"/>',
    "imobiliare": '<path d="M8 42V10l14-4v36"/><path d="M22 18h18v24"/><path d="M4 42h40"/><path d="M13 16h4M13 23h4M13 30h4M28 26h4M28 33h4"/>',
    "locuri-de-munca": '<rect x="6" y="14" width="36" height="26" rx="3"/><path d="M17 14v-4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M6 25h36M21 25v4h6v-4"/>',
    "animale": '<ellipse cx="24" cy="31" rx="9" ry="7"/><circle cx="12" cy="22" r="3.5"/><circle cx="20" cy="13.5" r="3.5"/><circle cx="28" cy="13.5" r="3.5"/><circle cx="36" cy="22" r="3.5"/>',
    "agro-industrie": '<circle cx="14" cy="33" r="7"/><circle cx="37" cy="36" r="4"/><path d="M14 26V14h12l3 8h7a4 4 0 0 1 4 4v6"/><path d="M26 14l-2 8H14"/>',
    "cazare-turism": '<path d="M5 38V12M5 28h38v10M43 28v-4a5 5 0 0 0-5-5H22v9"/><circle cx="13" cy="22" r="4"/>',
    "hobby-cultura": '<path d="M24 14c-4-3-10-4-17-3v26c7-1 13 0 17 3 4-3 10-4 17-3V11c-7-1-13 0-17 3z"/><path d="M24 14v26"/>',
    "meniu": '<path d="M4 7h16M4 12h16M4 17h10"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "lupa": '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.6 15.6L21 21"/>',
    "cont": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    "chat": '<path d="M4 5.5h16v11H10l-4.5 3.5v-3.5H4z"/>',
    "clopot": '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>'
  };
  const nav = new Set(["acasa", "meniu", "plus", "lupa", "cont", "chat", "clopot"]);
  window.icon = function (name, size) {
    const k = P[name] ? name : "alt", s = size || (nav.has(k) ? 24 : 40);
    const vb = nav.has(k) ? "0 0 24 24" : "0 0 48 48";
    const sw = nav.has(k) ? 1.8 : 1.7;
    return `<svg class="ico" viewBox="${vb}" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[k]}</svg>`;
  };
})();
