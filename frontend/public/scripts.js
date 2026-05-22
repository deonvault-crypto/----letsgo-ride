/* ============================================================
   LetsGoRide Zimbabwe – scripts.js
   ============================================================ */

'use strict';

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];

const header = $('.header');
const navToggle = $('#navToggle');
const primaryNav = $('#siteNav');
const backToTop = $('#backToTop');
const searchForm = $('#searchForm');
const searchResults = $('#searchResults');

if (navToggle && primaryNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = primaryNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  primaryNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => primaryNav.classList.remove('open'));
  });
}

window.addEventListener('scroll', () => {
  if (header) header.classList.toggle('scrolled', window.scrollY > 10);
  if (backToTop) backToTop.hidden = window.scrollY < 420;
}, { passive: true });

if (backToTop) {
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

$$('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', event => {
    const targetId = anchor.getAttribute('href');
    if (!targetId || targetId === '#') return;
    const target = document.querySelector(targetId);
    if (!target) return;

    event.preventDefault();
    const offset = header ? header.offsetHeight + 18 : 18;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
});

// Sample ride data (in production this would come from an API)
const RIDES_DATA = [
  { from: 'Harare', to: 'Bulawayo', date: '2026-06-15', driver: 'John Mubayi', price: 100, seats: 3, departs: '06:00 AM', km: 440, vehicle: 'Toyota Fortuner' },
  { from: 'Harare', to: 'Victoria Falls', date: '2026-06-20', driver: 'Jane Mbalaka', price: 150, seats: 2, departs: '05:30 AM', km: 880, vehicle: 'Honda CR-V' },
  { from: 'Bulawayo', to: 'Masvingo', date: '2026-06-18', driver: 'Tafadzwa Ndlovu', price: 60, seats: 4, departs: '07:00 AM', km: 290, vehicle: 'Nissan X-Trail' },
  { from: 'Mutare', to: 'Harare', date: '2026-06-22', driver: 'Chiedza Moyo', price: 55, seats: 1, departs: '08:00 AM', km: 265, vehicle: 'Toyota Corolla' },
  { from: 'Harare', to: 'Gweru', date: '2026-06-17', driver: 'Blessing Choto', price: 45, seats: 3, departs: '07:30 AM', km: 280, vehicle: 'Mazda CX-5' },
  { from: 'Harare', to: 'Mutare', date: '2026-06-19', driver: 'Farai Dube', price: 50, seats: 2, departs: '09:00 AM', km: 265, vehicle: 'VW Polo' },
  { from: 'Bulawayo', to: 'Victoria Falls', date: '2026-06-21', driver: 'Nomsa Sibanda', price: 80, seats: 3, departs: '06:30 AM', km: 440, vehicle: 'Ford Ranger' },
  { from: 'Harare', to: 'Kariba', date: '2026-06-23', driver: 'Tapiwa Mhuru', price: 70, seats: 2, departs: '07:00 AM', km: 365, vehicle: 'Toyota Hilux' },
];

if (searchForm) {
  const dateInput = $('#travel-date');
  if (dateInput) dateInput.setAttribute('min', new Date().toISOString().split('T')[0]);

  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!validateForm(searchForm)) return;

    const from = $('#from').value;
    const to = $('#to').value;
    const seats = Number($('#seats').value) || 1;
    const results = RIDES_DATA.filter(ride => ride.from === from && ride.to === to && ride.seats >= seats);

    renderSearchResults(results, from, to);
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

function renderSearchResults(results, from, to) {
  if (!searchResults) return;

  if (!results.length) {
    searchResults.innerHTML = `
      <div class="no-results" role="status">
        <strong>No rides found</strong> from ${from} to ${to}. Try another route or date.
      </div>`;
    return;
  }

  const cards = results.map(ride => `
    <article class="ride-card" aria-label="Ride from ${ride.from} to ${ride.to}">
      <div class="ride-card-header">
        <span class="route-badge">${ride.from} → ${ride.to}</span>
        <span class="seats-badge">${ride.seats} seat${ride.seats === 1 ? '' : 's'} left</span>
      </div>
      <div class="ride-card-body">
        <div class="driver-info">
          <span class="avatar">${ride.driver.split(' ').map(part => part[0]).join('')}</span>
          <div>
            <strong>${ride.driver}</strong>
            <div class="ride-meta">${formatDate(ride.date)} • ${ride.departs}</div>
          </div>
        </div>
        <ul class="ride-details">
          <li><strong>Vehicle:</strong> ${ride.vehicle}</li>
          <li><strong>Distance:</strong> ${ride.km} km</li>
          <li><strong>Price:</strong> $${ride.price} / seat</li>
        </ul>
      </div>
      <div class="ride-card-footer">
        <button class="btn btn-primary" type="button" onclick="bookRide('${ride.from} to ${ride.to}', ${ride.price})">Book Now</button>
      </div>
    </article>`).join('');

  searchResults.innerHTML = `
    <div class="search-summary">Found ${results.length} ride${results.length === 1 ? '' : 's'} from ${from} to ${to}.</div>
    <div class="rides-grid">${cards}</div>`;
}

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString('en-ZW', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

const contactForm = $('#contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#name').value.trim();
    const email = $('#email').value.trim();
    const message = $('#message').value.trim();
    const feedback = $('#formFeedback');

    if (!name || !email || !message) {
      showFeedback(feedback, 'Please complete all fields.', 'error');
      return;
    }
    if (!isValidEmail(email)) {
      showFeedback(feedback, 'Please enter a valid email address.', 'error');
      return;
    }

    showFeedback(feedback, 'Sending message…', '');
    setTimeout(() => {
      showFeedback(feedback, `Thanks ${name}! We'll be in touch soon.`, 'success');
      contactForm.reset();
    }, 900);
  });
}

function showFeedback(element, message, type) {
  if (!element) return;
  element.textContent = message;
  element.className = 'form-feedback' + (type ? ` ${type}` : '');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

window.bookRide = function(route, price) {
  const bookingModal = $('#bookingModal');
  const bookingDetails = $('#bookingDetails');
  const bookingTotal = $('#bookingTotal');
  const seatsInput = $('#b-seats');

  if (!bookingModal || !bookingDetails || !bookingTotal || !seatsInput) return;

  bookingDetails.textContent = `${route} — $${price} per seat`;
  seatsInput.value = '1';
  bookingTotal.textContent = `Total: $${price}`;
  bookingModal.hidden = false;
  document.body.style.overflow = 'hidden';
  seatsInput.focus();

  seatsInput.addEventListener('input', () => {
    const seats = Number(seatsInput.value) || 1;
    bookingTotal.textContent = `Total: $${seats * price}`;
  });
};

function closeBookingModal() {
  const bookingModal = $('#bookingModal');
  if (!bookingModal) return;
  bookingModal.hidden = true;
  document.body.style.overflow = '';
}

const sections = $$('section[id]');
const navLinks = $$('#siteNav a[href^="#"]');

window.addEventListener('scroll', () => {
  const position = window.scrollY + (header ? header.offsetHeight : 0) + 20;
  sections.forEach(section => {
    const top = section.offsetTop;
    const bottom = top + section.offsetHeight;
    const id = section.id;

    if (position >= top && position < bottom) {
      navLinks.forEach(link => {
        if (link.getAttribute('href') === `#${id}`) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }
  });
}, { passive: true });

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  toast.style.cssText = [
    'position: fixed',
    'bottom: 1.5rem',
    'left: 50%',
    'transform: translateX(-50%)',
    'padding: 0.95rem 1.25rem',
    'border-radius: 0.85rem',
    'color: #fff',
    'background: rgba(17, 24, 39, 0.92)',
    'box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16)',
    'z-index: 9999',
    'font-size: 0.95rem',
    'min-width: 240px',
    'text-align: center',
  ].join(';');

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}
