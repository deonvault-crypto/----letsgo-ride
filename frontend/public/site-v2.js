(() => {
  const menuButton = document.querySelector("[data-menu-button]");
  const nav = document.querySelector("[data-nav]");
  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
      });
    });
  }
  document.querySelectorAll("[data-year]").forEach((node) => { node.textContent = new Date().getFullYear(); });
  const deletionForm = document.querySelector("#deleteAccountForm");
  if (deletionForm) {
    deletionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(deletionForm);
      const email = String(data.get("email") || "").trim();
      const role = String(data.get("role") || "").trim();
      const note = String(data.get("note") || "").trim();
      const subject = "LetsGoRide account deletion request";
      const body = ["Hello LetsGoRide Support,","","I am requesting deletion of my LetsGoRide account and associated personal data.","",`Account email: ${email || "[enter your account email]"}`,`Account type: ${role || "[select account type]"}`,note ? `Additional note: ${note}` : "","","Please confirm any identity-verification step required to process this request."].filter(Boolean).join("\n");
      window.location.href = "mailto:support@letsgoride.site?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    });
  }
})();
