(() => {
  'use strict';

  const answers = {
    avondale: 'Name the entrance or landmark — not just “Avondale”. A useful pickup saves the driver from circling the block.',
    jason: 'Check which side of Jason Moyo Avenue the pin landed on. A road name alone can still leave the driver guessing.',
    samora: 'Use a landmark the driver can see without stopping traffic. The best pickup note is short, specific and visible from the road.',
  };

  const answerNode = document.querySelector('[data-pickup-answer]');
  const buttons = Array.from(document.querySelectorAll('[data-pickup]'));

  if (!answerNode || !buttons.length) return;

  function selectPickup(button) {
    const key = String(button.dataset.pickup || '');
    const answer = answers[key];
    if (!answer) return;

    for (const item of buttons) {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    answerNode.textContent = answer;
  }

  for (const button of buttons) {
    button.addEventListener('click', () => selectPickup(button));
  }
})();
