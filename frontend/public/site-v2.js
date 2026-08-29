(() => {
  const documentRoot = document.documentElement;
  const body = document.body;
  const menuButton = document.querySelector("[data-menu-button]");
  const nav = document.querySelector("[data-nav]");
  const siteHeader = document.querySelector("[data-site-header]") || document.querySelector(".site-header");

  documentRoot.classList.add("js-ready");

  const closeMenu = ({ restoreFocus = false } = {}) => {
    if (!menuButton || !nav) return;
    nav.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    body.classList.remove("menu-open");
    if (restoreFocus) menuButton.focus();
  };

  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = !nav.classList.contains("open");
      nav.classList.toggle("open", open);
      menuButton.setAttribute("aria-expanded", String(open));
      body.classList.toggle("menu-open", open);
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => closeMenu());
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("open")) closeMenu({ restoreFocus: true });
    });

    document.addEventListener("click", (event) => {
      if (!nav.classList.contains("open")) return;
      if (!nav.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
    });

    const mobileNavigation = window.matchMedia("(max-width: 760px)");
    const handleNavigationViewport = () => {
      if (!mobileNavigation.matches) closeMenu();
    };
    if (typeof mobileNavigation.addEventListener === "function") {
      mobileNavigation.addEventListener("change", handleNavigationViewport);
    } else if (typeof mobileNavigation.addListener === "function") {
      mobileNavigation.addListener(handleNavigationViewport);
    }
  }

  const updateHeader = () => {
    if (siteHeader) siteHeader.classList.toggle("is-scrolled", window.scrollY > 16);
  };
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = new Date().getFullYear();
  });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealNodes = document.querySelectorAll(".reveal");
  if (!reducedMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealNodes.forEach((node) => observer.observe(node));
  } else {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
  }

  const appTabs = [...document.querySelectorAll("[data-app-tab]")];
  const appPanels = [...document.querySelectorAll("[data-app-panel]")];
  const deviceStage = document.querySelector("[data-device-stage]");
  appTabs.forEach((tab, tabIndex) => {
    tab.addEventListener("click", () => {
      const service = tab.getAttribute("data-app-tab");
      appTabs.forEach((candidate) => {
        const selected = candidate === tab;
        candidate.setAttribute("aria-selected", String(selected));
        candidate.setAttribute("tabindex", selected ? "0" : "-1");
      });
      appPanels.forEach((panel) => {
        panel.hidden = panel.getAttribute("data-app-panel") !== service;
      });
      if (deviceStage) deviceStage.setAttribute("data-active-service", service || "move");
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const nextTab = appTabs[(tabIndex + offset + appTabs.length) % appTabs.length];
      nextTab.focus();
      nextTab.click();
    });
  });

  const deletionForm = document.querySelector("#deleteAccountForm");
  if (deletionForm) {
    deletionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(deletionForm);
      const email = String(data.get("email") || "").trim();
      const role = String(data.get("role") || "").trim();
      const note = String(data.get("note") || "").trim();
      const subject = "LetsGoRide account deletion request";
      const bodyLines = [
        "Hello LetsGoRide Support,",
        "",
        "I am requesting deletion of my LetsGoRide account and associated personal data.",
        "",
        `Account email: ${email || "[enter your account email]"}`,
        `Account type: ${role || "[select account type]"}`,
        note ? `Additional note: ${note}` : "",
        "",
        "Please confirm any identity-verification step required to process this request."
      ].filter(Boolean);
      window.location.href = `mailto:support@letsgoride.site?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
    });
  }
})();
