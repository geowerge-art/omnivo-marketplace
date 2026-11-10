/* Formularul de contact din /contact. */
(() => {
  const f = document.getElementById('contactForm'); if (!f) return;
  const err = document.getElementById('ctErr'), done = document.getElementById('ctDone');
  const MSG = { RATE_LIMIT: 'Ai trimis prea multe mesaje. Încearcă peste o oră.', EMAIL_INVALID: 'Scrie o adresă de e-mail validă.', ACORD_NECESAR: 'Bifează acordul de prelucrare a datelor.', DATE_INVALIDE: 'Completează numele și un mesaj de cel puțin 10 caractere.' };
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = done.hidden = true;
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        name: document.getElementById('ctName').value, email: document.getElementById('ctEmail').value, topic: document.getElementById('ctTopic').value,
        message: document.getElementById('ctMsg').value, website: document.getElementById('ctWeb').value, consent: document.getElementById('ctOk').checked }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = MSG[d.error] || 'Nu am putut trimite mesajul. Încearcă din nou.'; err.hidden = false; }
      else { done.textContent = 'Mulțumim! Am primit mesajul și îți răspundem pe e-mail.'; done.hidden = false; f.reset(); }
    } catch { err.textContent = 'Nu am putut trimite mesajul. Verifică conexiunea.'; err.hidden = false; }
    btn.disabled = false;
  });
})();
