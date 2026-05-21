/* ============================================================
   LetsGoRide Zimbabwe – scripts.js
   ============================================================ */

'use strict';

/* ---- Utility helpers ---- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ============================================================
   1. Dynamic copyright year
   ============================================================ */
const yearEl = $('#year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ============================================================
   2. Sticky header shadow on scroll
   ============================================================ */
const header = $('#site-header');
window.addEventListener('scroll', () => {
  if (header) {
    header.style.boxShadow = window.scrollY > 10
      ? '0 4px 16px rgba(0,0,0,.25)'
      : '';
  }
}, { passive: true });

/* ============================================================
   3. Mobile navigation toggle
   ============================================================ */
const navToggle = $('#navToggle');
const primaryNav = $('#primary-nav');

if (navToggle && primaryNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = primaryNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.closest('nav').classList.toggle('nav-open', isOpen);
  });

  // Close nav when a link is clicked
  $$('a', primaryNav).forEach(link => {
    link.addEventListener('click', () => {
      primaryNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.closest('nav').classList.remove('nav-open');
    });
  });

  // Close nav on outside click
  document.addEventListener('click', e => {
    if (!header.contains(e.target)) {
      primaryNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.closest('nav').classList.remove('nav-open');
    }
  });
}

/* ============================================================
   4. Smooth scroll for all in-page anchor links
   ============================================================ */
$$('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const targetId = anchor.getAttribute('href');
    if (targetId === '#') return;
    const target = document.querySelector(targetId);
    if (!target) return;
    e.preventDefault();
    const headerH = header ? header.offsetHeight : 0;
    const top = target.getBoundingClientRect().top + window.scrollY - headerH - 8;
    window.scrollTo({ top, behavior: 'smooth' });
    // Move focus for accessibility
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
});

/* ============================================================
   5. Back-to-top button
   ============================================================ */
const backToTop = $('#backToTop');
if (backToTop) {
  window.addEventListener('scroll', () => {
    const show = window.scrollY > 400;
    backToTop.hidden = !show;
  }, { passive: true });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ============================================================
   6. Ride Search Form
   ============================================================ */
const searchForm = $('#searchForm');
const searchResults = $('#searchResults');

// Sample ride data (in production this would come from an API)
const RIDES_DATA = [
  { from: 'Harare',   to: 'Bulawayo',      date: '2026-06-15', driver: 'John Mubayi',     price: 100, seats: 3, departs: '06:00 AM', km: 440, vehicle: 'Toyota Fortuner (White)' },
  { from: 'Harare',   to: 'Victoria Falls', date: '2026-06-20', driver: 'Jane Mbalaka',    price: 150, seats: 2, departs: '05:30 AM', km: 880, vehicle: 'Honda CR-V (Silver)' },
  { from: 'Bulawayo', to: 'Masvingo',       date: '2026-06-18', driver: 'Tafadzwa Ndlovu', price: 60,  seats: 4, departs: '07:00 AM', km: 290, vehicle: 'Nissan X-Trail (Blue)' },
  { from: 'Mutare',   to: 'Harare',         date: '2026-06-22', driver: 'Chiedza Moyo',    price: 55,  seats: 1, departs: '08:00 AM', km: 265, vehicle: 'Toyota Corolla (Red)' },
  { from: 'Harare',   to: 'Gweru',          date: '2026-06-17', driver: 'Blessing Choto',  price: 45,  seats: 3, departs: '07:30 AM', km: 280, vehicle: 'Mazda CX-5 (Black)' },
  { from: 'Harare',   to: 'Mutare',         date: '2026-06-19', driver: 'Farai Dube',      price: 50,  seats: 2, departs: '09:00 AM', km: 265, vehicle: 'VW Polo (White)' },
  { from: 'Bulawayo', to: 'Victoria Falls', date: '2026-06-21', driver: 'Nomsa Sibanda',   price: 80,  seats: 3, departs: '06:30 AM', km: 440, vehicle: 'Ford Ranger (Grey)' },
  { from: 'Harare',   to: 'Kariba',         date: '2026-06-23', driver: 'Tapiwa Mhuru',    price: 70,  seats: 2, departs: '07:00 AM', km: 365, vehicle: 'Toyota Hilux (Blue)' },
];

if (searchForm) {
  // Set minimum date to today
  const dateInput = $('#travel-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
  }

  searchForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateForm(searchForm)) return;

    const from  = $('#from').value;
    const to    = $('#to').value;
    const date  = $('#travel-date').value;
    const seats = parseInt($('#seats').value, 10) || 1;

    const results = RIDES_DATA.filter(r =>
      r.from === from &&
      r.to   === to   &&
      r.seats >= seats
    );

    renderSearchResults(results, from, to, date);
  });
}

function validateForm(form) {
  let valid = true;
  $$('[required]', form).forEach(field => {
    if (!field.value.trim()) {
      field.setAttribute('aria-invalid', 'true');
      valid = false;
    } else {
      field.removeAttribute('aria-invalid');
    }
  });
  return valid;
}

function renderSearchResults(results, from, to, date) {
  if (!searchResults) return;

  if (results.length === 0) {
    searchResults.innerHTML = `
      <div class="no-results" role="alert">
        <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
        No rides found from <strong>${from}</strong> to <strong>${to}</strong> on the selected date.
        <br>Try a different date or <a href="#contact">request a ride</a>.
      </div>`;
    searchResults.style.cssText = 'margin-top:1.5rem;';
    return;
  }

  const cards = results.map(r => `
    <article class="ride-card" aria-label="Ride from ${r.from} to ${r.to}">
      <div class="ride-card-header">
        <span class="route-badge">
          <i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${r.from}
          <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          <i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${r.to}
        </span>
        <span class="seats-badge">
          <i class="fa-solid fa-user-group" aria-hidden="true"></i> ${r.seats} seat${r.seats !== 1 ? 's' : ''} left
        </span>
      </div>
      <div class="ride-card-body">
        <div class="driver-info">
          <div class="driver-avatar" aria-hidden="true">${r.driver.split(' ').map(n => n[0]).join('')}</div>
          <div>
            <strong>${r.driver}</strong>
            <div class="rating" aria-label="Rating: 4.8 out of 5">
              ${'<i class="fa-solid fa-star" aria-hidden="true"></i>'.repeat(4)}
              <i class="fa-solid fa-star-half-stroke" aria-hidden="true"></i>
              <span>4.8</span>
            </div>
          </div>
        </div>
        <ul class="ride-details">
          <li><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${formatDate(r.date)}</li>
          <li><i class="fa-regular fa-clock" aria-hidden="true"></i> Departs ${r.departs}</li>
          <li><i class="fa-solid fa-road" aria-hidden="true"></i> ~${r.km} km</li>
          <li><i class="fa-solid fa-car" aria-hidden="true"></i> ${r.vehicle}</li>
        </ul>
      </div>
      <div class="ride-card-footer">
        <span class="price" aria-label="Price: ${r.price} US dollars">$${r.price} <small>/ seat</small></span>
        <button class="btn btn-primary" onclick="bookRide('${r.from} to ${r.to}', ${r.price})">
          <i class="fa-solid fa-ticket" aria-hidden="true"></i> Book Now
        </button>
      </div>
    </article>`).join('');

  searchResults.innerHTML = `
    <p style="margin-bottom:1rem;font-weight:700;color:#333;">
      <i class="fa-solid fa-circle-check" style="color:#2e7d32" aria-hidden="true"></i>
      Found ${results.length} ride${results.length !== 1 ? 's' : ''} from ${from} to ${to}
    </p>
    <div class="rides-grid">${cards}</div>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-ZW', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ============================================================
   7. Auth Modal (Sign In / Register)
   ============================================================ */
const authModal    = $('#authModal');
const loginBtn     = $('#loginBtn');
const modalClose   = $('#modalClose');
const modalOverlay = $('#modalOverlay');
const tabSignin    = $('#tab-signin');
const tabRegister  = $('#tab-register');
const panelSignin  = $('#panel-signin');
const panelRegister = $('#panel-register');

function openAuthModal(tab = 'signin') {
  if (!authModal) return;
  authModal.hidden = false;
  document.body.style.overflow = 'hidden';
  switchTab(tab);
  // Focus first input
  setTimeout(() => {
    const firstInput = authModal.querySelector('input');
    if (firstInput) firstInput.focus();
  }, 50);
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.hidden = true;
  document.body.style.overflow = '';
  if (loginBtn) loginBtn.focus();
}

function switchTab(tab) {
  const isSignin = tab === 'signin';
  tabSignin.classList.toggle('active', isSignin);
  tabRegister.classList.toggle('active', !isSignin);
  tabSignin.setAttribute('aria-selected', String(isSignin));
  tabRegister.setAttribute('aria-selected', String(!isSignin));
  panelSignin.hidden  = !isSignin;
  panelRegister.hidden = isSignin;
}

if (loginBtn)     loginBtn.addEventListener('click', () => openAuthModal('signin'));
if (modalClose)   modalClose.addEventListener('click', closeAuthModal);
if (modalOverlay) modalOverlay.addEventListener('click', closeAuthModal);
if (tabSignin)    tabSignin.addEventListener('click', () => switchTab('signin'));
if (tabRegister)  tabRegister.addEventListener('click', () => switchTab('register'));

// Close modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (authModal && !authModal.hidden) closeAuthModal();
    if (bookingModal && !bookingModal.hidden) closeBookingModal();
  }
});

/* ---- Sign-in form ---- */
const signinForm = $('#signinForm');
if (signinForm) {
  signinForm.addEventListener('submit', e => {
    e.preventDefault();
    const email    = $('#si-email').value.trim();
    const password = $('#si-password').value;
    const feedback = $('#signinFeedback');

    if (!email || !password) {
      showFeedback(feedback, 'Please fill in all fields.', 'error');
      return;
    }
    if (!isValidEmail(email)) {
      showFeedback(feedback, 'Please enter a valid email address.', 'error');
      return;
    }

    // Simulate async sign-in (replace with real API call)
    showFeedback(feedback, 'Signing you in…', '');
    setTimeout(() => {
      showFeedback(feedback, 'Welcome back! Redirecting…', 'success');
      loginBtn.innerHTML = '<i class="fa-solid fa-user" aria-hidden="true"></i> My Account';
      setTimeout(closeAuthModal, 1200);
    }, 1000);
  });
}

/* ---- Register form ---- */
const registerForm = $('#registerForm');
const pwInput      = $('#r-password');
const pwStrength   = $('#pwStrength');

if (pwInput && pwStrength) {
  pwInput.addEventListener('input', () => {
    const strength = getPasswordStrength(pwInput.value);
    pwStrength.textContent = strength.label;
    pwStrength.style.color = strength.color;
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', e => {
    e.preventDefault();
    const fname    = $('#r-fname').value.trim();
    const lname    = $('#r-lname').value.trim();
    const email    = $('#r-email').value.trim();
    const password = $('#r-password').value;
    const terms    = $('#r-terms').checked;
    const feedback = $('#registerFeedback');

    if (!fname || !lname || !email || !password) {
      showFeedback(feedback, 'Please fill in all required fields.', 'error');
      return;
    }
    if (!isValidEmail(email)) {
      showFeedback(feedback, 'Please enter a valid email address.', 'error');
      return;
    }
    if (password.length < 8) {
      showFeedback(feedback, 'Password must be at least 8 characters.', 'error');
      return;
    }
    if (!terms) {
      showFeedback(feedback, 'You must agree to the Terms of Service.', 'error');
      return;
    }

    showFeedback(feedback, 'Creating your account…', '');
    setTimeout(() => {
      showFeedback(feedback, `Account created! Welcome, ${fname}!`, 'success');
      loginBtn.innerHTML = `<i class="fa-solid fa-user" aria-hidden="true"></i> ${fname}`;
      setTimeout(closeAuthModal, 1400);
    }, 1200);
  });
}

/* ============================================================
   8. Booking Modal
   ============================================================ */
const bookingModal   = $('#bookingModal');
const bookingClose   = $('#bookingClose');
const bookingOverlay = $('#bookingOverlay');
const bookingDetails = $('#bookingDetails');
const bookingTotal   = $('#bookingTotal');
const bSeats         = $('#b-seats');
const confirmBtn     = $('#confirmBookingBtn');

let currentRide = { route: '', price: 0 };

window.bookRide = function(route, price) {
  currentRide = { route, price };
  if (bookingDetails) {
    bookingDetails.innerHTML = `
      <strong>Route:</strong> ${route}<br>
      <strong>Price per seat:</strong> $${price}`;
  }
  updateBookingTotal();
  if (bookingModal) {
    bookingModal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (bSeats) bSeats.focus();
  }
};

function updateBookingTotal() {
  if (!bSeats || !bookingTotal) return;
  const seats = parseInt(bSeats.value, 10) || 1;
  const total = seats * currentRide.price;
  bookingTotal.textContent = `Total: $${total}`;
}

function closeBookingModal() {
  if (!bookingModal) return;
  bookingModal.hidden = true;
  document.body.style.overflow = '';
}

if (bSeats)         bSeats.addEventListener('input', updateBookingTotal);
if (bookingClose)   bookingClose.addEventListener('click', closeBookingModal);
if (bookingOverlay) bookingOverlay.addEventListener('click', closeBookingModal);

if (confirmBtn) {
  confirmBtn.addEventListener('click', () => {
    const seats   = parseInt(bSeats.value, 10) || 1;
    const total   = seats * currentRide.price;
    const payment = document.querySelector('input[name="payment"]:checked')?.value || 'EcoCash';
    closeBookingModal();
    showToast(`Booking confirmed! ${seats} seat${seats > 1 ? 's' : ''} on ${currentRide.route} — $${total} via ${payment}. Check your email for details.`, 'success');
  });
}

/* ============================================================
   9. Contact Form
   ============================================================ */
const contactForm = $('#contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', e => {
    e.preventDefault();
    const name     = $('#c-name').value.trim();
    const email    = $('#c-email').value.trim();
    const message  = $('#c-message').value.trim();
    const feedback = $('#formFeedback');

    if (!name || !email || !message) {
      showFeedback(feedback, 'Please fill in all required fields.', 'error');
      return;
    }
    if (!isValidEmail(email)) {
      showFeedback(feedback, 'Please enter a valid email address.', 'error');
      return;
    }

    showFeedback(feedback, 'Sending your message…', '');
    setTimeout(() => {
      showFeedback(feedback, `Thank you, ${name}! We'll be in touch within 24 hours.`, 'success');
      contactForm.reset();
    }, 1000);
  });
}

/* ============================================================
   10. Password visibility toggle
   ============================================================ */
$$('.toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = isPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
    }
    btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });
});

/* ============================================================
   11. Intersection Observer – fade-in sections
   ============================================================ */
const observerOptions = { threshold: 0.05, rootMargin: '0px 0px 0px 0px' };
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Add fade-in style via JS (so it degrades gracefully without JS)
const fadeStyle = document.createElement('style');
fadeStyle.textContent = `
  .ride-card, .step, .testimonial-card, .about-grid, .contact-grid {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.5s ease, transform 0.5s ease;
  }
  .ride-card.visible, .step.visible, .testimonial-card.visible,
  .about-grid.visible, .contact-grid.visible {
    opacity: 1;
    transform: none;
  }
`;
document.head.appendChild(fadeStyle);

$$('.ride-card, .step, .testimonial-card, .about-grid, .contact-grid').forEach(el => {
  observer.observe(el);
});

/* ============================================================
   Helper functions
   ============================================================ */
function showFeedback(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'form-feedback' + (type ? ' ' + type : '');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getPasswordStrength(pw) {
  if (!pw) return { label: '', color: '' };
  if (pw.length < 6) return { label: 'Weak', color: '#c62828' };
  if (pw.length < 10 || !/[A-Z]/.test(pw) || !/\d/.test(pw))
    return { label: 'Fair', color: '#e65c00' };
  if (/[^A-Za-z0-9]/.test(pw))
    return { label: 'Strong', color: '#2e7d32' };
  return { label: 'Good', color: '#558b2f' };
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.style.cssText = `
    position: fixed; bottom: 5rem; left: 50%; transform: translateX(-50%);
    background: ${type === 'success' ? '#2e7d32' : '#1a1a2e'};
    color: #fff; padding: 1rem 1.5rem; border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,.2); z-index: 3000;
    font-size: 0.95rem; max-width: 90vw; text-align: center;
    animation: slideUp 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

/* ============================================================
   12. Active nav link highlighting on scroll
   ============================================================ */
const sections = $$('section[id]');
const navLinks  = $$('#primary-nav a[href^="#"]');

window.addEventListener('scroll', () => {
  const scrollPos = window.scrollY + (header ? header.offsetHeight : 0) + 20;
  sections.forEach(section => {
    const top    = section.offsetTop;
    const bottom = top + section.offsetHeight;
    const id     = section.id;
    if (scrollPos >= top && scrollPos < bottom) {
      navLinks.forEach(link => {
        link.removeAttribute('aria-current');
        if (link.getAttribute('href') === '#' + id) {
          link.setAttribute('aria-current', 'page');
        }
      });
    }
  });
}, { passive: true });
