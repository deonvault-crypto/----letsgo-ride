const menuBtn = document.getElementById("menuBtn");
const nav = document.getElementById("nav");

menuBtn.addEventListener("click", () => {
  nav.classList.toggle("open");
});

document.getElementById("contactForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const message = document.getElementById("message").value.trim();

  const text = `Hello LetsGo Ride, my name is ${name || "a customer"}. My contact is ${email || "not provided"}. ${message || "I want to ask about LetsGo Ride."}`;
  const phone = "263771234567";

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
});
