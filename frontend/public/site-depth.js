(() => {
  const tabs = [...document.querySelectorAll('[data-app-tab]')];
  const followServiceAnchor = () => {
    const tab = tabs.find((item) => `#${item.id}` === location.hash);
    if (tab) tab.click();
  };
  window.addEventListener('hashchange', followServiceAnchor);
  followServiceAnchor();
  tabs.forEach((tab) => tab.addEventListener('keydown', (event) => {
    if (event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const target = event.key === 'Home' ? tabs[0] : tabs[tabs.length - 1];
    target.focus();
    target.click();
  }));

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  document.querySelectorAll('[data-depth-scene]').forEach((scene) => {
    let frame = 0;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      scene.style.removeProperty('--rx');
      scene.style.removeProperty('--ry');
    };
    scene.addEventListener('pointermove', (event) => {
      if (motion.matches || !pointer.matches) return;
      const bounds = scene.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - .5;
      const y = (event.clientY - bounds.top) / bounds.height - .5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        scene.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
        scene.style.setProperty('--ry', `${(x * 7).toFixed(2)}deg`);
      });
    });
    scene.addEventListener('pointerleave', reset);
    scene.addEventListener('pointercancel', reset);
    motion.addEventListener('change', reset);
    pointer.addEventListener('change', reset);
  });
})();
